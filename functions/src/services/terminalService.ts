import {Turn, TurnStatus, Terminal, ServingStrategy} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError, ConflictError} from "../utils/errors";
import {getWaitingTurnsAcrossQueues} from "./queueService";
import {updateTurnStatus, noShowTurn} from "./turnService";

export async function getNextTurn(terminalId: string): Promise<Turn | null> {
  const terminalDoc = await db.collection("terminals").doc(terminalId).get();
  if (!terminalDoc.exists) {
    throw new NotFoundError(`Terminal ${terminalId} not found`);
  }

  const terminal = terminalDoc.data() as Terminal;

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

  for (const queueId of terminal.activeQueueIds) {
    const queueDoc = await db.collection("queues").doc(queueId).get();
    const queue = queueDoc.data() as any;
    if (queue.type === "priority") {
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
  const terminalDoc = await db.collection("terminals").doc(terminalId).get();
  if (!terminalDoc.exists) {
    throw new NotFoundError(`Terminal ${terminalId} not found`);
  }

  const turnDoc = await db.collection("turns").doc(turnId).get();
  if (!turnDoc.exists) {
    throw new NotFoundError(`Turn ${turnId} not found`);
  }

  const turn = turnDoc.data() as Turn;
  if (turn.status !== TurnStatus.WAITING) {
    throw new ConflictError(`Turn is not in WAITING status (current: ${turn.status})`);
  }

  await db.runTransaction(async (transaction) => {
    transaction.update(db.collection("turns").doc(turnId), {
      status: TurnStatus.CALLED,
      calledAt: new Date(),
      terminalId,
    });

    transaction.update(db.collection("terminals").doc(terminalId), {
      currentTurnId: turnId,
    });
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

  await updateTurnStatus(turnId, TurnStatus.ATTENDING);
}

export async function finishTurn(terminalId: string, turnId: string): Promise<void> {
  const terminalDoc = await db.collection("terminals").doc(terminalId).get();
  if (!terminalDoc.exists) {
    throw new NotFoundError(`Terminal ${terminalId} not found`);
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

    // Update terminal counters if ratio_based strategy
    const terminal = (await transaction.get(db.collection("terminals").doc(terminalId))).data() as Terminal;
    if (terminal.servingStrategy === ServingStrategy.RATIO_BASED && terminal.strategyConfig.ratioBased) {
      const queue = (await transaction.get(db.collection("queues").doc(turn.queueId))).data() as any;
      const config = {...terminal.strategyConfig.ratioBased};

      if (queue.type === "priority") {
        config.priorityCounterState = (config.priorityCounterState || 0) + 1;
      } else {
        config.normalCounterState = (config.normalCounterState || 0) + 1;
      }

      transaction.update(db.collection("terminals").doc(terminalId), {
        strategyConfig: {...terminal.strategyConfig, ratioBased: config},
        currentTurnId: "",
      });
    } else {
      transaction.update(db.collection("terminals").doc(terminalId), {
        currentTurnId: "",
      });
    }
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

  // Re-call the turn (set status back to called)
  await db.collection("turns").doc(turnId).update({
    recallCount: turn.recallCount + 1,
  });
}

export async function handleNoShow(terminalId: string, turnId: string): Promise<void> {
  const terminalDoc = await db.collection("terminals").doc(terminalId).get();
  if (!terminalDoc.exists) {
    throw new NotFoundError(`Terminal ${terminalId} not found`);
  }

  const turnDoc = await db.collection("turns").doc(turnId).get();
  if (!turnDoc.exists) {
    throw new NotFoundError(`Turn ${turnId} not found`);
  }

  const turn = turnDoc.data() as Turn;
  if (turn.status !== TurnStatus.CALLED) {
    throw new ConflictError(`Turn is not in CALLED status (current: ${turn.status})`);
  }

  await db.runTransaction(async (transaction) => {
    await noShowTurn(turnId);

    // Clear terminal's current turn
    transaction.update(db.collection("terminals").doc(terminalId), {
      currentTurnId: "",
    });
  });
}
