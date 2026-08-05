import {Turn, TurnStatus} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError, ConflictError} from "../utils/errors";

const ARGENTINA_OFFSET = -3 * 60; // UTC-3 in minutes

function getTodayMidnightInArgentina(): Date {
  const now = new Date();
  const localDate = new Date(now.getTime() + (ARGENTINA_OFFSET + now.getTimezoneOffset()) * 60000);
  const midnight = new Date(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate(),
    0,
    0,
    0,
    0
  );
  return new Date(midnight.getTime() - (ARGENTINA_OFFSET + now.getTimezoneOffset()) * 60000);
}

export async function createTurn(
  queueId: string,
  memberId: string,
  channel: "totem" | "whatsapp" | "mobile" = "totem"
): Promise<Turn> {
  // Validate queue exists
  const queueDoc = await db.collection("queues").doc(queueId).get();
  if (!queueDoc.exists) {
    throw new NotFoundError(`Queue ${queueId} not found`);
  }

  let turnId = "";
  let turnNumber = 0;
  let createdAt = new Date();

  // Use transaction to get next number and create turn atomically
  await db.runTransaction(async (transaction) => {
    const today = getTodayMidnightInArgentina();

    // Find the highest turn number for this queue today across ALL of today's turns,
    // not just the most recently created one (requeues bump currentTurnNumber without
    // changing createdAt, so the most-recent doc isn't necessarily the highest).
    const turnsSnap = await transaction.get(
      db
        .collection("turns")
        .where("queueId", "==", queueId)
        .where("createdAt", ">=", today)
    );

    let maxNumber = 0;
    turnsSnap.docs.forEach((doc) => {
      const t = doc.data() as Turn;
      maxNumber = Math.max(maxNumber, t.originalTurnNumber, t.currentTurnNumber);
    });

    turnNumber = maxNumber + 1;
    createdAt = new Date();

    // Create new turn
    const newTurn: Turn = {
      id: "",
      memberId,
      queueId,
      originalTurnNumber: turnNumber,
      currentTurnNumber: turnNumber,
      status: TurnStatus.WAITING,
      channel,
      recallCount: 0,
      createdAt,
    };

    const turnRef = db.collection("turns").doc();
    newTurn.id = turnRef.id;

    transaction.set(turnRef, newTurn);
    turnId = turnRef.id;
  });

  return {
    id: turnId,
    memberId,
    queueId,
    originalTurnNumber: turnNumber,
    currentTurnNumber: turnNumber,
    status: TurnStatus.WAITING,
    channel,
    recallCount: 0,
    createdAt,
  };
}

export async function getCurrentTurn(memberId: string): Promise<Turn | null> {
  const turnsSnap = await db
    .collection("turns")
    .where("memberId", "==", memberId)
    .where("status", "in", [TurnStatus.WAITING, TurnStatus.CALLED, TurnStatus.ATTENDING])
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (turnsSnap.empty) {
    return null;
  }

  return turnsSnap.docs[0].data() as Turn;
}

export async function getTurnById(turnId: string): Promise<Turn | null> {
  const turnDoc = await db.collection("turns").doc(turnId).get();
  if (!turnDoc.exists) {
    return null;
  }
  return turnDoc.data() as Turn;
}

export async function cancelTurn(turnId: string): Promise<void> {
  // Transactional so a customer's cancel and an operator's simultaneous
  // callTurn can't race — whichever commits first is the one that sticks,
  // and the loser sees the fresh status and errors instead of overwriting it.
  await db.runTransaction(async (transaction) => {
    const turnRef = db.collection("turns").doc(turnId);
    const turnDoc = await transaction.get(turnRef);
    if (!turnDoc.exists) {
      throw new NotFoundError(`Turn ${turnId} not found`);
    }

    const turn = turnDoc.data() as Turn;
    if (turn.status !== TurnStatus.WAITING) {
      throw new ConflictError(`Turn is not in WAITING status (current: ${turn.status})`);
    }

    transaction.update(turnRef, {status: TurnStatus.CANCELLED});
  });
}

export async function updateTurnStatus(turnId: string, status: TurnStatus): Promise<void> {
  const updateData: Partial<Turn> = {status};
  if (status === TurnStatus.CALLED) {
    updateData.calledAt = new Date();
  } else if (status === TurnStatus.ATTENDING) {
    updateData.attendingAt = new Date();
  } else if (status === TurnStatus.FINISHED) {
    updateData.finishedAt = new Date();
  }

  await db.collection("turns").doc(turnId).update(updateData);
}

