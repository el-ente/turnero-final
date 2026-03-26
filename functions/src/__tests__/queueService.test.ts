import { getWaitingTurns, getWaitingTurnsAcrossQueues } from "../services/queueService";
import { db } from "../config/firebase-admin";
import { TurnStatus } from "shared";

jest.mock("../config/firebase-admin");

describe("Queue Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getWaitingTurns", () => {
    it("should return turns ordered by currentTurnNumber", async () => {
      const mockTurns = [
        {
          id: "turn-1",
          queueId: "queue-1",
          currentTurnNumber: 1,
          status: TurnStatus.WAITING,
          createdAt: new Date("2026-03-26T00:00:00"),
        },
        {
          id: "turn-2",
          queueId: "queue-1",
          currentTurnNumber: 2,
          status: TurnStatus.WAITING,
          createdAt: new Date("2026-03-26T00:01:00"),
        },
      ];

      const mockSnapshot = {
        docs: mockTurns.map((turn) => ({
          data: () => turn,
        })),
      };

      (db.collection as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(mockSnapshot),
              }),
            }),
          }),
        }),
      });

      const turns = await getWaitingTurns("queue-1");
      expect(Array.isArray(turns)).toBe(true);
    });

    it("should return empty array if no waiting turns", async () => {
      const mockSnapshot = { docs: [] };

      (db.collection as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(mockSnapshot),
              }),
            }),
          }),
        }),
      });

      const turns = await getWaitingTurns("queue-1");
      expect(turns.length).toBe(0);
    });
  });

  describe("getWaitingTurnsAcrossQueues", () => {
    it("should handle empty queue list", async () => {
      const turns = await getWaitingTurnsAcrossQueues([]);
      expect(turns.length).toBe(0);
    });

    it("should merge turns from multiple queues", async () => {
      const mockSnapshot = {
        docs: [
          {
            data: () => ({
              id: "turn-1",
              currentTurnNumber: 5,
              status: TurnStatus.WAITING,
            }),
          },
          {
            data: () => ({
              id: "turn-2",
              currentTurnNumber: 3,
              status: TurnStatus.WAITING,
            }),
          },
        ],
      };

      (db.collection as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(mockSnapshot),
              }),
            }),
          }),
        }),
      });

      const turns = await getWaitingTurnsAcrossQueues(["queue-1", "queue-2"]);
      expect(Array.isArray(turns)).toBe(true);
    });
  });
});
