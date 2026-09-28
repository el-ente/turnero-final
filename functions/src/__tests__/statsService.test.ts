import {
  getQueueStats, getSectorStats, getTerminalStatsForQueue,
  aggregateTurns, aggregateByTerminal, avgSeconds,
} from "../services/statsService";
import {db} from "../config/firebase-admin";
import {Turn, TurnStatus} from "shared";

jest.mock("../config/firebase-admin");

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: "turn-1",
    memberNumber: 1,
    queueId: "queue-1",
    queuedAt: new Date(),
    status: TurnStatus.WAITING,
    channel: "totem",
    recallCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

// Mocks db.collection so "sectors"/"queues" docs exist by default and
// "turns" queries resolve to the given turns.
function mockFirestore(options: {
  docExists?: boolean;
  turns?: Turn[];
  queueDocs?: string[];
}) {
  const {docExists = true, turns = [], queueDocs} = options;

  (db.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === "turns") {
      const snapshot = {docs: turns.map((turn) => ({data: () => turn}))};
      return {
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue(snapshot)}),
        }),
      };
    }
    if (name === "queues" && queueDocs !== undefined) {
      return {
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({docs: queueDocs.map((id) => ({id}))}),
        }),
      };
    }
    return {
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({exists: docExists, data: () => ({})}),
      }),
    };
  });
}

describe("Stats Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("aggregateTurns", () => {
    it("counts turns by status", () => {
      const turns = [
        makeTurn({status: TurnStatus.WAITING}),
        makeTurn({status: TurnStatus.CALLED}),
        makeTurn({status: TurnStatus.ATTENDING}),
        makeTurn({status: TurnStatus.FINISHED}),
        makeTurn({status: TurnStatus.NO_SHOW}),
        makeTurn({status: TurnStatus.CANCELLED}),
      ];

      const aggregate = aggregateTurns(turns);

      expect(aggregate.totalCreated).toBe(6);
      expect(aggregate.waitingCount).toBe(1);
      expect(aggregate.calledCount).toBe(1);
      expect(aggregate.attendingCount).toBe(1);
      expect(aggregate.finishedCount).toBe(1);
      expect(aggregate.noShowCount).toBe(1);
      expect(aggregate.cancelledCount).toBe(1);
    });

    it("sums wait time from createdAt->calledAt and service time from attendingAt->finishedAt, only for finished turns", () => {
      const createdAt = new Date("2026-03-26T10:00:00");
      const calledAt = new Date("2026-03-26T10:02:00"); // +120s wait
      const attendingAt = new Date("2026-03-26T10:02:30");
      const finishedAt = new Date("2026-03-26T10:05:30"); // +180s service

      const turns = [
        makeTurn({status: TurnStatus.FINISHED, createdAt, calledAt, attendingAt, finishedAt}),
        // Not finished — must not contribute even though it has the same fields.
        makeTurn({status: TurnStatus.ATTENDING, createdAt, calledAt, attendingAt}),
      ];

      const aggregate = aggregateTurns(turns);

      expect(aggregate.totalWaitTimeSeconds).toBe(120);
      expect(aggregate.totalServiceTimeSeconds).toBe(180);
    });
  });

  describe("avgSeconds", () => {
    it("returns null when count is 0, not 0", () => {
      expect(avgSeconds(0, 0)).toBeNull();
    });

    it("rounds the average", () => {
      expect(avgSeconds(100, 3)).toBe(33);
    });
  });

  describe("aggregateByTerminal", () => {
    it("excludes turns with no terminalId", () => {
      const turns = [
        makeTurn({terminalId: "term-1"}),
        makeTurn({terminalId: undefined}),
      ];

      const result = aggregateByTerminal(turns);

      expect(result).toHaveLength(1);
      expect(result[0].terminalId).toBe("term-1");
    });

    it("groups counts and avg service time per terminal", () => {
      const attendingAt = new Date("2026-03-26T10:00:00");
      const finishedAt = new Date("2026-03-26T10:01:00"); // +60s
      const turns = [
        makeTurn({terminalId: "term-1", status: TurnStatus.FINISHED, attendingAt, finishedAt}),
        makeTurn({terminalId: "term-1", status: TurnStatus.WAITING}),
        makeTurn({terminalId: "term-2", status: TurnStatus.FINISHED, attendingAt, finishedAt}),
      ];

      const result = aggregateByTerminal(turns);
      const term1 = result.find((t) => t.terminalId === "term-1");
      const term2 = result.find((t) => t.terminalId === "term-2");

      expect(term1?.turnCount).toBe(2);
      expect(term1?.avgServiceTimeSeconds).toBe(60);
      expect(term2?.turnCount).toBe(1);
      expect(term2?.avgServiceTimeSeconds).toBe(60);
    });
  });

  describe("getQueueStats", () => {
    it("should throw NotFoundError if queue not found", async () => {
      mockFirestore({docExists: false});
      await expect(getQueueStats("invalid-queue")).rejects.toThrow();
    });

    it("should count turns by status", async () => {
      const turns = [
        makeTurn({id: "turn-1", status: TurnStatus.WAITING}),
        makeTurn({
          id: "turn-2",
          status: TurnStatus.FINISHED,
          createdAt: new Date("2026-03-26T00:00:00"),
          calledAt: new Date("2026-03-26T00:05:00"),
        }),
      ];
      mockFirestore({turns});

      const stats = await getQueueStats("queue-1");

      expect(stats).toHaveProperty("queueId", "queue-1");
      expect(stats).toHaveProperty("totalTodayCreated", 2);
      expect(stats).toHaveProperty("waitingCount", 1);
      expect(stats).toHaveProperty("finishedCount", 1);
    });

    it("should calculate average wait time correctly", async () => {
      const createdAt = new Date("2026-03-26T10:00:00");
      const calledAt = new Date("2026-03-26T10:02:00"); // 120 seconds later
      mockFirestore({
        turns: [makeTurn({
          status: TurnStatus.FINISHED,
          createdAt,
          calledAt,
          finishedAt: new Date("2026-03-26T10:05:00"),
        })],
      });

      const stats = await getQueueStats("queue-1");

      expect(stats.avgWaitTimeSeconds).toBe(120);
    });

    it("should report avgWaitTimeSeconds and avgServiceTimeSeconds as null, not 0, when no turn finished today", async () => {
      mockFirestore({turns: [makeTurn({status: TurnStatus.WAITING})]});

      const stats = await getQueueStats("queue-1");

      expect(stats.avgWaitTimeSeconds).toBeNull();
      expect(stats.avgServiceTimeSeconds).toBeNull();
    });
  });

  describe("getSectorStats", () => {
    it("should throw NotFoundError if sector not found", async () => {
      mockFirestore({docExists: false, queueDocs: []});
      await expect(getSectorStats("invalid-sector")).rejects.toThrow();
    });

    it("returns an explicit zero-state, not an error, for a sector with no queues", async () => {
      mockFirestore({queueDocs: []});

      const stats = await getSectorStats("sector-1");

      expect(stats.queues).toEqual([]);
      expect(stats.today.totalCreated).toBe(0);
      expect(stats.today.avgWaitTimeSeconds).toBeNull();
    });

    it("splits turns per queue and the combined total matches the sum of the per-queue breakdown", async () => {
      const turns = [
        makeTurn({id: "t1", queueId: "queue-1", status: TurnStatus.WAITING}),
        makeTurn({id: "t2", queueId: "queue-1", status: TurnStatus.FINISHED}),
        makeTurn({id: "t3", queueId: "queue-2", status: TurnStatus.WAITING}),
      ];
      mockFirestore({turns, queueDocs: ["queue-1", "queue-2"]});

      const stats = await getSectorStats("sector-1");

      expect(stats.queues).toHaveLength(2);
      const queue1 = stats.queues.find((q) => q.queueId === "queue-1");
      const queue2 = stats.queues.find((q) => q.queueId === "queue-2");
      expect(queue1?.totalCreated).toBe(2);
      expect(queue2?.totalCreated).toBe(1);
      expect(stats.today.totalCreated).toBe(queue1!.totalCreated + queue2!.totalCreated);
    });
  });

  describe("getTerminalStatsForQueue", () => {
    it("should throw NotFoundError if queue not found", async () => {
      mockFirestore({docExists: false});
      await expect(getTerminalStatsForQueue("invalid-queue")).rejects.toThrow();
    });

    it("excludes turns with no terminalId from the breakdown", async () => {
      const turns = [
        makeTurn({terminalId: "term-1"}),
        makeTurn({terminalId: undefined}),
      ];
      mockFirestore({turns});

      const result = await getTerminalStatsForQueue("queue-1");

      expect(result.terminals).toHaveLength(1);
      expect(result.terminals[0].terminalId).toBe("term-1");
    });
  });
});
