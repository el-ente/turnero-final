import {onSchedule} from "firebase-functions/v2/scheduler";
import {runDailyRollup} from "../services/dailyStatsService";
import {logger} from "../config/firebase-admin";

// 3 AM Argentina time — comfortably after local midnight, so "yesterday" is
// unambiguously closed by the time this runs.
export const dailyStatsRollupHandler = onSchedule(
  {schedule: "0 3 * * *", timeZone: "America/Argentina/Buenos_Aires"},
  async () => {
    const result = await runDailyRollup();
    if (result.failed.length > 0) {
      logger.error("Daily stats rollup: some queues failed", {failed: result.failed});
    }
  }
);
