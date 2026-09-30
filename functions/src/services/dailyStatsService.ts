import {Turn, QueueDailyStats} from "shared";
import {db} from "../config/firebase-admin";
import {aggregateTurns, aggregateTurnsByHour} from "./statsService";
import {yesterdayInArgentina, argentinaMidnightRangeFor, lastDatesEndingYesterday} from "../utils/argentinaTime";

function dailyStatsDocId(queueId: string, date: string): string {
  return `${queueId}_${date}`;
}

export async function computeQueueDailyStats(queueId: string, date: string): Promise<QueueDailyStats> {
  const {start, end} = argentinaMidnightRangeFor(date);
  const turnsSnap = await db
    .collection("turns")
    .where("queueId", "==", queueId)
    .where("createdAt", ">=", start)
    .where("createdAt", "<", end)
    .get();
  const turns = turnsSnap.docs.map((doc) => doc.data() as Turn);
  const aggregate = aggregateTurns(turns);

  return {
    queueId,
    date,
    totalCreated: aggregate.totalCreated,
    waitingCount: aggregate.waitingCount,
    calledCount: aggregate.calledCount,
    attendingCount: aggregate.attendingCount,
    finishedCount: aggregate.finishedCount,
    noShowCount: aggregate.noShowCount,
    cancelledCount: aggregate.cancelledCount,
    totalWaitTimeSeconds: aggregate.totalWaitTimeSeconds,
    totalServiceTimeSeconds: aggregate.totalServiceTimeSeconds,
    hourly: aggregateTurnsByHour(turns),
    computedAt: new Date(),
  };
}

// Full overwrite, not an increment — safe to rerun for the same
// (queueId, date) any number of times, from any source of truth, with no
// double-counting risk.
export async function writeQueueDailyStats(queueId: string, date: string): Promise<void> {
  const stats = await computeQueueDailyStats(queueId, date);
  await db.collection("queueDailyStats").doc(dailyStatsDocId(queueId, date)).set(stats);
}

// Rolls up yesterday (Argentina calendar day) for every queue — including
// inactive ones, since a queue closed mid-day still had turns that day and
// skipping it would leave a silent gap in its trend. One queue failing
// doesn't block the rest.
export interface RollupResult {
  processed: number;
  failed: string[];
}

async function rollupQueuesForDate(queueIds: string[], date: string): Promise<RollupResult> {
  const results = await Promise.allSettled(queueIds.map((queueId) => writeQueueDailyStats(queueId, date)));
  const failed = queueIds.filter((_, i) => results[i].status === "rejected");
  return {processed: queueIds.length - failed.length, failed};
}

async function listQueueIds(): Promise<string[]> {
  const queuesSnap = await db.collection("queues").get();
  return queuesSnap.docs.map((doc) => doc.id);
}

export async function runDailyRollup(): Promise<RollupResult> {
  return rollupQueuesForDate(await listQueueIds(), yesterdayInArgentina());
}

// Recomputes the last `days` days (ending yesterday) for every queue, one
// date at a time so a long backfill doesn't fan out thousands of parallel
// queries. Failures are reported as `{queueId}_{date}` and don't stop the rest.
export async function backfillDailyStats(days: number): Promise<RollupResult> {
  const queueIds = await listQueueIds();
  const summary: RollupResult = {processed: 0, failed: []};
  for (const date of lastDatesEndingYesterday(days)) {
    const result = await rollupQueuesForDate(queueIds, date);
    summary.processed += result.processed;
    summary.failed.push(...result.failed.map((queueId) => dailyStatsDocId(queueId, date)));
  }
  return summary;
}

// Raw rollup docs for the given queues over the last `days` days (ending
// yesterday — today has no rollup yet). Missing days (before the pipeline
// existed, or today) are silently omitted, not padded with zeros.
export async function getQueueDailyStatsRange(queueIds: string[], days: number): Promise<QueueDailyStats[]> {
  const dates = lastDatesEndingYesterday(days);
  const refs = queueIds.flatMap((queueId) => dates.map((date) => db.collection("queueDailyStats").doc(dailyStatsDocId(queueId, date))));
  if (refs.length === 0) return [];

  const snaps = await db.getAll(...refs);
  return snaps.filter((snap) => snap.exists).map((snap) => snap.data() as QueueDailyStats);
}
