import {Queue, Turn, TurnStatus} from "shared";
import {FieldPath} from "firebase-admin/firestore";
import {db} from "../config/firebase-admin";

export async function getWaitingTurns(queueId: string): Promise<Turn[]> {
  const snapshot = await db
    .collection("turns")
    .where("queueId", "==", queueId)
    .where("status", "==", TurnStatus.WAITING)
    .orderBy("queuedAt", "asc")
    .get();

  return snapshot.docs.map((doc) => doc.data() as Turn);
}

export async function getQueuesByIds(queueIds: string[]): Promise<Queue[]> {
  if (queueIds.length === 0) {
    return [];
  }

  // Firestore "in" caps at 30 values (same assumption as adminService.ts's deleteSector).
  const snapshot = await db
    .collection("queues")
    .where(FieldPath.documentId(), "in", queueIds)
    .get();

  return snapshot.docs.map((doc) => doc.data() as Queue);
}

export async function getWaitingTurnsAcrossQueues(queueIds: string[]): Promise<Turn[]> {
  if (queueIds.length === 0) {
    return [];
  }

  const snapshot = await db
    .collection("turns")
    .where("queueId", "in", queueIds)
    .where("status", "==", TurnStatus.WAITING)
    .orderBy("queuedAt", "asc")
    .get();

  return snapshot.docs.map((doc) => doc.data() as Turn);
}
