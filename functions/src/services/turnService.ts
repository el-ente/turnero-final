import {Turn, TurnStatus, Channel} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError, ConflictError, ValidationError} from "../utils/errors";

export async function createTurn(
  queueId: string,
  memberNumber: number,
  channel: Channel = "totem"
): Promise<Turn> {
  if (!Number.isInteger(memberNumber) || memberNumber < 1 || memberNumber > 99999) {
    throw new ValidationError("memberNumber must be an integer between 1 and 99999");
  }
  const queueDoc = await db.collection("queues").doc(queueId).get();
  if (!queueDoc.exists) throw new NotFoundError(`Queue ${queueId} not found`);

  // Same-queue duplicate guard: a second ticket in the same queue isn't a new
  // need, just a repeat of the same one — keep the existing (older) ticket,
  // which already has earned position, instead of creating a fresh one.
  const existingSnap = await db.collection("turns")
    .where("memberNumber", "==", memberNumber)
    .where("queueId", "==", queueId)
    .where("status", "in", [TurnStatus.WAITING, TurnStatus.CALLED, TurnStatus.ATTENDING])
    .limit(1)
    .get();
  if (!existingSnap.empty) {
    return existingSnap.docs[0].data() as Turn;
  }

  const turnRef = db.collection("turns").doc();
  const createdAt = new Date();
  const newTurn: Turn = {
    id: turnRef.id, memberNumber, queueId, queuedAt: createdAt,
    status: TurnStatus.WAITING, channel, recallCount: 0, createdAt,
  };
  await turnRef.set(newTurn);
  return newTurn;
}

export async function getCurrentTurn(memberNumber: number): Promise<Turn | null> {
  const turnsSnap = await db
    .collection("turns")
    .where("memberNumber", "==", memberNumber)
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

