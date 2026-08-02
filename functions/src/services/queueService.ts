import {Turn, TurnStatus} from "shared";
import {db} from "../config/firebase-admin";

export async function getWaitingTurns(queueId: string): Promise<Turn[]> {
  const snapshot = await db
    .collection("turns")
    .where("queueId", "==", queueId)
    .where("status", "==", TurnStatus.WAITING)
    .orderBy("currentTurnNumber", "asc")
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs.map((doc) => doc.data() as Turn);
}

export async function getWaitingTurnsAcrossQueues(queueIds: string[]): Promise<Turn[]> {
  if (queueIds.length === 0) {
    return [];
  }

  const snapshot = await db
    .collection("turns")
    .where("queueId", "in", queueIds)
    .where("status", "==", TurnStatus.WAITING)
    .orderBy("currentTurnNumber", "asc")
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs.map((doc) => doc.data() as Turn);
}
