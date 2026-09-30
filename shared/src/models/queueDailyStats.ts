/**
 * Per-hour slice of a day's turns, bucketed by the hour (Argentina time) the
 * turn was created. Wait/service sums cover only FINISHED turns, same rule as
 * the daily totals, and are attributed to the arrival hour — the question they
 * answer is "how long did people who arrived at 10am wait", which is what
 * staffing-per-hour decisions need.
 */
export interface HourlyBucket {
  created: number;
  finished: number;
  totalWaitTimeSeconds: number;
  totalServiceTimeSeconds: number;
}

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
  hourly: HourlyBucket[]; // 24 entries, index = hour 0-23 (Argentina time)
  computedAt: Date;
}
