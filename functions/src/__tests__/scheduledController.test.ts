// onSchedule() itself is mocked to hand back an object exposing the wrapped
// handler as `.run()` — the same shape firebase-functions gives ScheduleFunction,
// and the documented way to invoke a scheduled function's handler directly
// (via `firebase functions:shell`) without waiting for the cron trigger.
jest.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (_opts: unknown, handler: (event: unknown) => void | Promise<void>) => ({run: handler}),
}));

import {dailyStatsRollupHandler} from "../controllers/scheduledController";
import {runDailyRollup} from "../services/dailyStatsService";
import {logger} from "../config/firebase-admin";

jest.mock("../services/dailyStatsService");
jest.mock("../config/firebase-admin");

describe("dailyStatsRollupHandler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("runs the daily rollup and does not log when nothing failed", async () => {
    (runDailyRollup as jest.Mock).mockResolvedValue({processed: 3, failed: []});

    await dailyStatsRollupHandler.run({scheduleTime: "2026-09-27T06:00:00Z"});

    expect(runDailyRollup).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs an error (without throwing) when some queues failed", async () => {
    (runDailyRollup as jest.Mock).mockResolvedValue({processed: 1, failed: ["queue-2"]});

    await expect(dailyStatsRollupHandler.run({scheduleTime: "2026-09-27T06:00:00Z"})).resolves.not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({failed: ["queue-2"]}));
  });
});
