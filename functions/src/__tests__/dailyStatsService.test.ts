import {
  computeQueueDailyStats, writeQueueDailyStats, runDailyRollup, getQueueDailyStatsRange,
} from "../services/dailyStatsService";
import {db} from "../config/firebase-admin";
import {Turn, TurnStatus} from "shared";

jest.mock("../config/firebase-admin");

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: "turn-1",
    memberNumber: 1,
    queueId: "queue-1",
    queuedAt: new Date(),
    status: TurnStatus.FINISHED,
    channel: "totem",
    recallCount: 0,
    createdAt: new Date("2026-09-26T13:00:00Z"),
    ...overrides,
  };
}

function mockTurnsQuery(turns: Turn[]) {
  const snapshot = {docs: turns.map((turn) => ({data: () => turn}))};
  return jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue(snapshot)}),
    }),
  });
}

describe("Daily Stats Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("computeQueueDailyStats", () => {
    it("aggregates yesterday's turns into a rollup doc for the given date", async () => {
      const turns = [
        makeTurn({status: TurnStatus.FINISHED, calledAt: new Date("2026-09-26T13:01:00Z")}),
        makeTurn({status: TurnStatus.WAITING}),
      ];
      (db.collection as jest.Mock).mockImplementation((name: string) => {
        if (name === "turns") return {where: mockTurnsQuery(turns)};
        throw new Error(`unexpected collection: ${name}`);
      });

      const stats = await computeQueueDailyStats("queue-1", "2026-09-26");

      expect(stats.queueId).toBe("queue-1");
      expect(stats.date).toBe("2026-09-26");
      expect(stats.totalCreated).toBe(2);
      expect(stats.finishedCount).toBe(1);
      expect(stats.waitingCount).toBe(1);
      expect(stats.computedAt).toBeInstanceOf(Date);
    });
  });

  describe("writeQueueDailyStats", () => {
    it("overwrites the doc with .set() — no FieldValue.increment, no partial .update()", async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      const updateSpy = jest.fn();
      (db.collection as jest.Mock).mockImplementation((name: string) => {
        if (name === "turns") return {where: mockTurnsQuery([])};
        if (name === "queueDailyStats") {
          return {doc: jest.fn().mockReturnValue({set: setSpy, update: updateSpy})};
        }
        throw new Error(`unexpected collection: ${name}`);
      });

      await writeQueueDailyStats("queue-1", "2026-09-26");
      await writeQueueDailyStats("queue-1", "2026-09-26"); // rerun for the same date — must stay idempotent

      expect(setSpy).toHaveBeenCalledTimes(2);
      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({queueId: "queue-1", date: "2026-09-26"}));
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe("runDailyRollup", () => {
    it("keeps rolling up remaining queues when one queue's computation fails", async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      (db.collection as jest.Mock).mockImplementation((name: string) => {
        if (name === "queues") {
          return {get: jest.fn().mockResolvedValue({docs: [{id: "queue-1"}, {id: "queue-2"}]})};
        }
        if (name === "turns") {
          return {
            where: jest.fn((_field: string, _op: string, queueId: string) => ({
              where: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue({
                  get: jest.fn().mockImplementation(() => (
                    queueId === "queue-2" ?
                      Promise.reject(new Error("boom")) :
                      Promise.resolve({docs: []})
                  )),
                }),
              }),
            })),
          };
        }
        if (name === "queueDailyStats") {
          return {doc: jest.fn().mockReturnValue({set: setSpy})};
        }
        throw new Error(`unexpected collection: ${name}`);
      });

      const result = await runDailyRollup();

      expect(result.processed).toBe(1);
      expect(result.failed).toEqual(["queue-2"]);
    });
  });

  describe("getQueueDailyStatsRange", () => {
    it("returns [] without querying Firestore when there are no queueIds", async () => {
      const result = await getQueueDailyStatsRange([], 7);
      expect(result).toEqual([]);
      expect(db.getAll).not.toHaveBeenCalled();
    });

    it("silently omits missing days instead of padding with zeros", async () => {
      (db.getAll as jest.Mock).mockResolvedValue([
        {exists: true, data: () => ({queueId: "queue-1", date: "2026-09-26", totalCreated: 5})},
        {exists: false},
      ]);

      const result = await getQueueDailyStatsRange(["queue-1"], 2);

      expect(result).toHaveLength(1);
      expect(result[0].totalCreated).toBe(5);
    });
  });
});
