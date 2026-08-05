import {Turn, TurnStatus} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError} from "../utils/errors";

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

// Turn's Date-typed fields arrive as Firestore Timestamps at runtime (Admin SDK
// doesn't convert them), not native Dates — mirrors app/src/lib/dates.ts on the client.
function toMillis(value: Date | { toDate(): Date }): number {
  return typeof (value as { toDate?: () => Date }).toDate === "function" ?
    (value as { toDate(): Date }).toDate().getTime() :
    (value as Date).getTime();
}

export interface QueueStats {
  queueId: string;
  totalTodayCreated: number;
  waitingCount: number;
  calledCount: number;
  attendingCount: number;
  finishedCount: number;
  noShowCount: number;
  cancelledCount: number;
  avgWaitTimeSeconds: number;
}

export async function getQueueStats(queueId: string): Promise<QueueStats> {
  // Verify queue exists
  const queueDoc = await db.collection("queues").doc(queueId).get();
  if (!queueDoc.exists) {
    throw new NotFoundError(`Queue ${queueId} not found`);
  }

  const today = getTodayMidnightInArgentina();

  // Get all turns for this queue today
  const turnsSnap = await db
    .collection("turns")
    .where("queueId", "==", queueId)
    .where("createdAt", ">=", today)
    .get();

  const turns = turnsSnap.docs.map((doc) => doc.data() as Turn);

  // Count by status
  const statusCounts = {
    [TurnStatus.WAITING]: 0,
    [TurnStatus.CALLED]: 0,
    [TurnStatus.ATTENDING]: 0,
    [TurnStatus.FINISHED]: 0,
    [TurnStatus.NO_SHOW]: 0,
    [TurnStatus.CANCELLED]: 0,
  };

  let totalWaitTime = 0;
  let finishedTurnsCount = 0;

  for (const turn of turns) {
    statusCounts[turn.status]++;

    // Calculate avg wait time for finished turns
    if (turn.status === TurnStatus.FINISHED && turn.calledAt && turn.createdAt) {
      const waitTime = toMillis(turn.calledAt) - toMillis(turn.createdAt);
      totalWaitTime += waitTime;
      finishedTurnsCount++;
    }
  }

  const avgWaitTimeSeconds = finishedTurnsCount > 0 ? Math.round(totalWaitTime / finishedTurnsCount / 1000) : 0;

  return {
    queueId,
    totalTodayCreated: turns.length,
    waitingCount: statusCounts[TurnStatus.WAITING],
    calledCount: statusCounts[TurnStatus.CALLED],
    attendingCount: statusCounts[TurnStatus.ATTENDING],
    finishedCount: statusCounts[TurnStatus.FINISHED],
    noShowCount: statusCounts[TurnStatus.NO_SHOW],
    cancelledCount: statusCounts[TurnStatus.CANCELLED],
    avgWaitTimeSeconds,
  };
}
