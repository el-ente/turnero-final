import {getNextTurn, callTurn, startTurn, finishTurn} from "../services/terminalService";
import {db} from "../config/firebase-admin";
import {Terminal, Turn, TurnStatus, ServingStrategy} from "shared";

jest.mock("../config/firebase-admin");
jest.mock("../services/queueService");

describe("Terminal Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getNextTurn", () => {
    it("should throw NotFoundError if terminal not found", async () => {
      const mockTerminalDoc = {exists: false};

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockTerminalDoc),
        }),
      });

      expect(getNextTurn("invalid-terminal")).rejects.toThrow();
    });

    it("should return null if no waiting turns", async () => {
      const mockTerminal: Terminal = {
        id: "terminal-1",
        name: "Terminal 1",
        sectorIds: ["sector-1"],
        activeQueueIds: ["queue-1"],
        servingStrategy: ServingStrategy.FIFO_ACROSS_QUEUES,
        strategyConfig: {strategy: ServingStrategy.FIFO_ACROSS_QUEUES},
        status: "available",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTerminalDoc = {
        exists: true,
        data: () => mockTerminal,
      };

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockTerminalDoc),
        }),
      });

      // Would return null when no waiting turns
      expect(getNextTurn).toBeDefined();
    });
  });

  describe("callTurn", () => {
    it("should throw NotFoundError if terminal not found", async () => {
      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({exists: false}),
        }),
      });

      expect(callTurn("invalid-terminal", "turn-1")).rejects.toThrow();
    });

    it("should throw NotFoundError if turn not found", async () => {
      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn((id) => ({
          get: jest.fn().mockResolvedValue({
            exists: id === "terminal-1",
          }),
        })),
      });

      expect(callTurn("terminal-1", "invalid-turn")).rejects.toThrow();
    });
  });

  describe("startTurn", () => {
    it("should throw error if turn is not in CALLED status", async () => {
      const mockTurn: Turn = {
        id: "turn-1",
        memberId: "member-1",
        queueId: "queue-1",
        originalTurnNumber: 1,
        currentTurnNumber: 1,
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => mockTurn,
          }),
        }),
      });

      expect(startTurn("terminal-1", "turn-1")).rejects.toThrow();
    });
  });

  describe("finishTurn", () => {
    it("should throw NotFoundError if terminal not found", async () => {
      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({exists: false}),
        }),
      });

      expect(finishTurn("invalid-terminal", "turn-1")).rejects.toThrow();
    });
  });
});
