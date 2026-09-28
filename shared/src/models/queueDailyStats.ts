/**
 * One rollup doc per queue per Argentina calendar day, id `{queueId}_{date}`.
 * Stores sums + counts (not pre-divided averages) so sector-level totals can
 * be derived later by summing per-queue docs — averaging averages would be
 * wrong, summing sums and dividing once at read time is correct.
 */
export interface QueueDailyStats {
  queueId: string;
  date: string; // "YYYY-MM-DD", Argentina calendar date this rollup covers
  totalCreated: number;
  waitingCount: number;
  calledCount: number;
  attendingCount: number;
  finishedCount: number;
  noShowCount: number;
  cancelledCount: number;
  totalWaitTimeSeconds: number;
  totalServiceTimeSeconds: number;
  computedAt: Date;
}
