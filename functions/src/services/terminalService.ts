import {Turn, TurnStatus, Terminal, TerminalStatus, ServingStrategy, Queue, RatioBasedConfig} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError, ConflictError, ValidationError, ForbiddenError} from "../utils/errors";
import {getWaitingTurnsAcrossQueues, getQueuesByIds} from "./queueService";
import {syncServedBy} from "./adminService";
import {updateTurnStatus} from "./turnService";
import {toMillis} from "../utils/dates";

export function nextRatioCounterState(config: RatioBasedConfig, isPriority: boolean) {
  let normal = config.normalCounterState || 0;
  let priority = config.priorityCounterState || 0;
  if (isPriority) priority += 1; else normal += 1;
  if (normal >= config.normalQueueRatio && priority >= config.priorityQueueRatio) {
    normal = 0; priority = 0;
  }
  return {normalCounterState: normal, priorityCounterState: priority};
}

// Every per-turn action takes terminalId from the caller, and the access
// check runs against that id — so the turn must be verified to actually
// belong to it, or one terminal could finish/no-show another's turn and
// strand that terminal's currentTurnId on a closed turn.
function turnNotOnTerminalError(turnId: string, terminalId: string): ConflictError {
  return new ConflictError(`Turn ${turnId} is not being served by terminal ${terminalId}`);
}

export async function getTerminalById(terminalId: string): Promise<Terminal> {
  const terminalDoc = await db.collection("terminals").doc(terminalId).get();
  if (!terminalDoc.exists) {
    throw new NotFoundError(`Terminal ${terminalId} not found`);
  }
  return terminalDoc.data() as Terminal;
}

export async function getNextTurn(terminalId: string): Promise<Turn | null> {
  const terminalDoc = await db.collection("terminals").doc(terminalId).get();
  if (!terminalDoc.exists) {
    throw new NotFoundError(`Terminal ${terminalId} not found`);
  }

  const terminal = terminalDoc.data() as Terminal;
  if (terminal.status === TerminalStatus.OFFLINE) {
    throw new ConflictError(`Terminal ${terminalId} is offline`);
  }

  if (terminal.servingStrategy === ServingStrategy.FIFO_ACROSS_QUEUES) {
    return getNextTurnFifoAcrossQueues(terminal);
  } else if (terminal.servingStrategy === ServingStrategy.RATIO_BASED) {
    return getNextTurnRatioBased(terminal);
  }

  return null;
}

async function getNextTurnFifoAcrossQueues(terminal: Terminal): Promise<Turn | null> {
  const turns = await getWaitingTurnsAcrossQueues(terminal.activeQueueIds);
  if (turns.length === 0) {
    return null;
  }
  return turns[0];
}

async function getNextTurnRatioBased(terminal: Terminal): Promise<Turn | null> {
  const config = terminal.strategyConfig.ratioBased;
  if (!config) {
    return null;
  }

  const normalCounterState = config.normalCounterState || 0;
  const priorityCounterState = config.priorityCounterState || 0;

  // Simple algorithm: determine which queue to serve next based on ratios
  // If we've served more priority turns than the ratio allows, serve normal
  // If we've served fewer priority turns, serve priority

  const totalNormalRequired = normalCounterState + priorityCounterState > 0 ?
    Math.ceil((normalCounterState + priorityCounterState) * (config.normalQueueRatio / (config.normalQueueRatio + config.priorityQueueRatio))) :
    0;

  const shouldServePriority = normalCounterState >= totalNormalRequired && priorityCounterState <= Math.floor((normalCounterState + priorityCounterState) * (config.priorityQueueRatio / (config.normalQueueRatio + config.priorityQueueRatio)));

  // Split queues into normal and priority
  const normalQueues: string[] = [];
  const priorityQueues: string[] = [];

  const activeQueues = await getQueuesByIds(terminal.activeQueueIds);
  const queueTypeById = new Map(activeQueues.map((q) => [q.id, q.type]));

  for (const queueId of terminal.activeQueueIds) {
    if (queueTypeById.get(queueId) === "priority") {
      priorityQueues.push(queueId);
    } else {
      normalQueues.push(queueId);
    }
  }

  let turnToServe: Turn | null = null;

  if (shouldServePriority && priorityQueues.length > 0) {
    const priorityTurns = await getWaitingTurnsAcrossQueues(priorityQueues);
    turnToServe = priorityTurns.length > 0 ? priorityTurns[0] : null;

    // If no priority turns, fallback to normal
    if (!turnToServe && normalQueues.length > 0) {
      const normalTurns = await getWaitingTurnsAcrossQueues(normalQueues);
      turnToServe = normalTurns.length > 0 ? normalTurns[0] : null;
    }
  } else if (normalQueues.length > 0) {
    const normalTurns = await getWaitingTurnsAcrossQueues(normalQueues);
    turnToServe = normalTurns.length > 0 ? normalTurns[0] : null;

    // If no normal turns, fallback to priority
    if (!turnToServe && priorityQueues.length > 0) {
      const priorityTurns = await getWaitingTurnsAcrossQueues(priorityQueues);
      turnToServe = priorityTurns.length > 0 ? priorityTurns[0] : null;
    }
  }

  return turnToServe;
}

export async function callTurn(terminalId: string, turnId: string): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const terminalRef = db.collection("terminals").doc(terminalId);
    const turnRef = db.collection("turns").doc(turnId);

    const terminalDoc = await transaction.get(terminalRef);
    if (!terminalDoc.exists) {
      throw new NotFoundError(`Terminal ${terminalId} not found`);
    }

    const terminal = terminalDoc.data() as Terminal;
    if (terminal.status === TerminalStatus.OFFLINE) {
      throw new ConflictError(`Terminal ${terminalId} is offline`);
    }
    if (terminal.currentTurnId) {
      throw new ConflictError(
        `Terminal ${terminalId} is already serving turn ${terminal.currentTurnId}`
      );
    }

    const turnDoc = await transaction.get(turnRef);
    if (!turnDoc.exists) {
      throw new NotFoundError(`Turn ${turnId} not found`);
    }

    const turn = turnDoc.data() as Turn;
    if (turn.status !== TurnStatus.WAITING) {
      throw new ConflictError(`Turn is not in WAITING status (current: ${turn.status})`);
    }
    if (!terminal.activeQueueIds.includes(turn.queueId)) {
      throw new ConflictError(`Turn's queue is not active on terminal ${terminalId}`);
    }

    const queueRef = db.collection("queues").doc(turn.queueId);
    const queueDoc = await transaction.get(queueRef);

    transaction.update(turnRef, {
      status: TurnStatus.CALLED,
      calledAt: new Date(),
      terminalId,
    });

    const terminalUpdate: Record<string, unknown> = {currentTurnId: turnId};

    if (terminal.servingStrategy === ServingStrategy.RATIO_BASED && terminal.strategyConfig.ratioBased) {
      const queue = queueDoc.data() as Queue;
      const isPriority = queue.type === "priority";
      const nextConfig = nextRatioCounterState(terminal.strategyConfig.ratioBased, isPriority);
      terminalUpdate.strategyConfig = {
        ...terminal.strategyConfig,
        ratioBased: {...terminal.strategyConfig.ratioBased, ...nextConfig},
      };
    }

    transaction.update(terminalRef, terminalUpdate);
  });
}

export async function startTurn(terminalId: string, turnId: string): Promise<void> {
  const turnDoc = await db.collection("turns").doc(turnId).get();
  if (!turnDoc.exists) {
    throw new NotFoundError(`Turn ${turnId} not found`);
  }

  const turn = turnDoc.data() as Turn;
  if (turn.status !== TurnStatus.CALLED) {
    throw new ConflictError(`Turn is not in CALLED status (current: ${turn.status})`);
  }
  if (turn.terminalId !== terminalId) throw turnNotOnTerminalError(turnId, terminalId);

  await updateTurnStatus(turnId, TurnStatus.ATTENDING);
}

export async function finishTurn(terminalId: string, turnId: string): Promise<void> {
  const terminalDoc = await db.collection("terminals").doc(terminalId).get();
  if (!terminalDoc.exists) {
    throw new NotFoundError(`Terminal ${terminalId} not found`);
  }
  if ((terminalDoc.data() as Terminal).currentTurnId !== turnId) {
    throw turnNotOnTerminalError(turnId, terminalId);
  }

  const turnDoc = await db.collection("turns").doc(turnId).get();
  if (!turnDoc.exists) {
    throw new NotFoundError(`Turn ${turnId} not found`);
  }

  const turn = turnDoc.data() as Turn;
  if (turn.status !== TurnStatus.ATTENDING) {
    throw new ConflictError(`Turn is not in ATTENDING status (current: ${turn.status})`);
  }

  await db.runTransaction(async (transaction) => {
    transaction.update(db.collection("turns").doc(turnId), {
      status: TurnStatus.FINISHED,
      finishedAt: new Date(),
    });

    transaction.update(db.collection("terminals").doc(terminalId), {
      currentTurnId: "",
    });
  });
}

export async function recallTurn(terminalId: string, turnId: string): Promise<void> {
  const turnDoc = await db.collection("turns").doc(turnId).get();
  if (!turnDoc.exists) {
    throw new NotFoundError(`Turn ${turnId} not found`);
  }

  const turn = turnDoc.data() as Turn;
  if (turn.status !== TurnStatus.CALLED) {
    throw new ConflictError(`Turn is not in CALLED status (current: ${turn.status})`);
  }
  if (turn.terminalId !== terminalId) throw turnNotOnTerminalError(turnId, terminalId);

  // Re-call: bump the count and stamp when, so the Display can tell this
  // apart from the original call and chime again — same turn id, so
  // nothing else about it changes.
  await db.collection("turns").doc(turnId).update({
    recallCount: turn.recallCount + 1,
    lastRecallAt: new Date(),
  });
}

export async function handleNoShow(terminalId: string, turnId: string): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const terminalRef = db.collection("terminals").doc(terminalId);
    const turnRef = db.collection("turns").doc(turnId);

    const terminalDoc = await transaction.get(terminalRef);
    if (!terminalDoc.exists) {
      throw new NotFoundError(`Terminal ${terminalId} not found`);
    }
    if ((terminalDoc.data() as Terminal).currentTurnId !== turnId) {
      throw turnNotOnTerminalError(turnId, terminalId);
    }

    const turnDoc = await transaction.get(turnRef);
    if (!turnDoc.exists) {
      throw new NotFoundError(`Turn ${turnId} not found`);
    }

    const turn = turnDoc.data() as Turn;
    if (turn.status !== TurnStatus.CALLED) {
      throw new ConflictError(`Turn is not in CALLED status (current: ${turn.status})`);
    }

    const queueRef = db.collection("queues").doc(turn.queueId);
    const queueDoc = await transaction.get(queueRef);
    if (!queueDoc.exists) {
      throw new NotFoundError(`Queue ${turn.queueId} not found`);
    }

    const queue = queueDoc.data() as Queue;
    const config = queue.reenqueueConfig;

    if (config.enabled && turn.recallCount < config.maxAttempts) {
      // Requeue the turn: anchor its new queuedAt to just after the turn at the
      // configured positionsBack in the current waiting list (clamped to the
      // list's length), so it lands that many positions back, not always at
      // the very end.
      const waitingSnap = await transaction.get(
        db.collection("turns")
          .where("queueId", "==", turn.queueId)
          .where("status", "==", TurnStatus.WAITING)
          .orderBy("queuedAt", "asc")
      );
      const waiting = waitingSnap.docs.map((d) => d.data() as Turn);
      const idx = Math.min(config.positionsBack, waiting.length);
      const newQueuedAt = idx > 0 ?
        new Date(toMillis(waiting[idx - 1].queuedAt) + 1) :
        new Date();

      transaction.update(turnRef, {
        queuedAt: newQueuedAt,
        status: TurnStatus.WAITING,
        recallCount: turn.recallCount + 1,
        lastRequeueAt: new Date(),
      });
    } else {
      transaction.update(turnRef, {
        status: TurnStatus.NO_SHOW,
      });
    }

    // Clear terminal's current turn
    transaction.update(terminalRef, {
      currentTurnId: "",
    });
  });
}

// Firestore "in" caps at 30 values (same assumption as adminService.ts's deleteSector).
const MAX_QUEUE_IDS = 30;

export async function reassignTerminalQueues(terminalId: string, queueIds: string[]): Promise<Terminal> {
  if (queueIds.length === 0 || queueIds.length > MAX_QUEUE_IDS) {
    throw new ValidationError(`queueIds must contain 1 to ${MAX_QUEUE_IDS} ids`);
  }

  const queues = await getQueuesByIds(queueIds);
  const foundIds = new Set(queues.map((q) => q.id));
  if (foundIds.size !== new Set(queueIds).size || queues.some((q) => !q.active)) {
    throw new ValidationError("All queues must exist and be active");
  }

  const now = new Date();
  const {updated, previousQueueIds} = await db.runTransaction(async (transaction) => {
    const ref = db.collection("terminals").doc(terminalId);
    const doc = await transaction.get(ref);
    if (!doc.exists) {
      throw new NotFoundError(`Terminal ${terminalId} not found`);
    }

    const terminal = doc.data() as Terminal;
    if (terminal.currentTurnId) {
      throw new ConflictError(`Terminal ${terminalId} has a turn in progress`);
    }
    // Re-checked here (not just at the controller) against the terminal
    // snapshot this transaction actually commits against, so a concurrent
    // admin edit to terminal.sectorIds can't slip a queue through on a
    // stale read — the only correctness-relevant copy of this check.
    if (queues.some((q) => !terminal.sectorIds.includes(q.sectorId))) {
      throw new ForbiddenError("One or more queues are outside this terminal's sectors");
    }

    transaction.update(ref, {activeQueueIds: queueIds, updatedAt: now});
    return {
      updated: {...terminal, activeQueueIds: queueIds, updatedAt: now},
      previousQueueIds: terminal.activeQueueIds,
    };
  });

  await syncServedBy(terminalId, previousQueueIds, queueIds);
  return updated;
}
