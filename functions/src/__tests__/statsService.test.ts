import { getQueueStats } from "../services/statsService";
import { db } from "../config/firebase-admin";
import { Turn, TurnStatus } from "shared";

jest.mock("../config/firebase-admin");

describe("Stats Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getQueueStats", () => {
    it("should throw NotFoundError if queue not found", async () => {
      const mockQueueDoc = { exists: false };

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockQueueDoc),
        }),
      });

      expect(getQueueStats("invalid-queue")).rejects.toThrow();
    });

    it("should count turns by status", async () => {
      const mockQueueDoc = {
        exists: true,
        data: () => ({ id: "queue-1", name: "Test Queue" }),
      };

      const mockTurns: Turn[] = [
        {
          id: "turn-1",
          memberId: "member-1",
          queueId: "queue-1",
          originalTurnNumber: 1,
          currentTurnNumber: 1,
          status: TurnStatus.WAITING,
          channel: "totem",
          recallCount: 0,
          createdAt: new Date(),
        },
        {
          id: "turn-2",
          memberId: "member-2",
          queueId: "queue-1",
          originalTurnNumber: 2,
          currentTurnNumber: 2,
          status: TurnStatus.FINISHED,
          channel: "totem",
          recallCount: 0,
          createdAt: new Date("2026-03-26T00:00:00"),
          calledAt: new Date("2026-03-26T00:05:00"),
        },
      ];

      const mockSnapshot = {
        docs: mockTurns.map((turn) => ({
          data: () => turn,
        })),
      };

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockQueueDoc),
        }),
      });

      // Mock the where().where().get() chain
      const mockWhereChain = {
        get: jest.fn().mockResolvedValue(mockSnapshot),
      };

      (db.collection as jest.Mock).mockImplementation((name) => {
        if (name === "turns") {
          return {
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue(mockWhereChain),
            }),
          };
        }
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockQueueDoc),
          }),
        };
      });

      const stats = await getQueueStats("queue-1");
      expect(stats).toHaveProperty("queueId", "queue-1");
      expect(stats).toHaveProperty("totalTodayCreated");
      expect(stats).toHaveProperty("waitingCount");
      expect(stats).toHaveProperty("finishedCount");
    });

    it("should calculate average wait time correctly", async () => {
      const mockQueueDoc = {
        exists: true,
        data: () => ({ id: "queue-1" }),
      };

      const createdAt = new Date("2026-03-26T10:00:00");
      const calledAt = new Date("2026-03-26T10:02:00"); // 120 seconds later

      const mockTurns: Turn[] = [
        {
          id: "turn-1",
          memberId: "member-1",
          queueId: "queue-1",
          originalTurnNumber: 1,
          currentTurnNumber: 1,
          status: TurnStatus.FINISHED,
          channel: "totem",
          recallCount: 0,
          createdAt,
          calledAt,
          finishedAt: new Date("2026-03-26T10:05:00"),
        },
      ];

      const mockSnapshot = {
        docs: mockTurns.map((turn) => ({
          data: () => turn,
        })),
      };

      (db.collection as jest.Mock).mockImplementation((name) => {
        if (name === "turns") {
          return {
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(mockSnapshot),
              }),
            }),
          };
        }
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockQueueDoc),
          }),
        };
      });

      const stats = await getQueueStats("queue-1");
      // 120 seconds wait time should be reflected
      expect(stats.avgWaitTimeSeconds).toBeGreaterThan(0);
    });
  });
});
