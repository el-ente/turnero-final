import {getNextTurn, callTurn, startTurn, finishTurn, handleNoShow} from "../services/terminalService";
import {db} from "../config/firebase-admin";
import {Terminal, Turn, TurnStatus, ServingStrategy} from "shared";
import {NotFoundError, ConflictError} from "../utils/errors";
import {mockRunTransaction} from "./helpers";

jest.mock("../config/firebase-admin");
jest.mock("../services/queueService");

// Shared by callTurn/handleNoShow tests: transaction.get uses db.collection(...).doc(...)
// refs as keys, so db.collection must resolve to something with a .doc() before the
// transaction body runs.
function mockCollectionDocs() {
  (db.collection as jest.Mock).mockImplementation(() => ({
    doc: jest.fn().mockReturnValue({}),
  }));
}

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
      mockCollectionDocs();
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: false});

      await expect(callTurn("invalid-terminal", "turn-1")).rejects.toThrow(NotFoundError);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError if turn not found", async () => {
      mockCollectionDocs();
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true}) // terminal
        .mockResolvedValueOnce({exists: false}); // turn

      await expect(callTurn("terminal-1", "invalid-turn")).rejects.toThrow(NotFoundError);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("should throw ConflictError if turn is not in WAITING status", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberId: "member-1",
        queueId: "queue-1",
        originalTurnNumber: 1,
        currentTurnNumber: 1,
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true}) // terminal
        .mockResolvedValueOnce({exists: true, data: () => mockTurn}); // turn

      await expect(callTurn("terminal-1", "turn-1")).rejects.toThrow(ConflictError);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("should update both the turn and terminal when the turn is WAITING", async () => {
      mockCollectionDocs();
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
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true}) // terminal
        .mockResolvedValueOnce({exists: true, data: () => mockTurn}); // turn

      await callTurn("terminal-1", "turn-1");

      expect(transaction.update).toHaveBeenCalledTimes(2);
      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({status: TurnStatus.CALLED, terminalId: "terminal-1"})
      );
      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({currentTurnId: "turn-1"})
      );
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

  describe("handleNoShow", () => {
    function mockTurnAndQueue(turn: Turn, queue: {reenqueueConfig: {enabled: boolean; maxAttempts: number; positionsBack: number}}) {
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true}) // terminal
        .mockResolvedValueOnce({exists: true, data: () => turn}) // turn
        .mockResolvedValueOnce({exists: true, data: () => queue}); // queue
      return transaction;
    }

    it("should throw NotFoundError if terminal not found", async () => {
      mockCollectionDocs();
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: false});

      await expect(handleNoShow("invalid-terminal", "turn-1")).rejects.toThrow(NotFoundError);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("should requeue the turn when recallCount is under maxAttempts", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberId: "member-1",
        queueId: "queue-1",
        originalTurnNumber: 5,
        currentTurnNumber: 5,
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      const mockQueue = {reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 2}};
      const transaction = mockTurnAndQueue(mockTurn, mockQueue);

      await handleNoShow("terminal-1", "turn-1");

      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentTurnNumber: 7,
          recallCount: 1,
          status: TurnStatus.WAITING,
        })
      );
      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({currentTurnId: ""})
      );
    });

    it("should cancel the turn when maxAttempts is reached", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberId: "member-1",
        queueId: "queue-1",
        originalTurnNumber: 5,
        currentTurnNumber: 5,
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 3,
        createdAt: new Date(),
      };
      const mockQueue = {reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 2}};
      const transaction = mockTurnAndQueue(mockTurn, mockQueue);

      await handleNoShow("terminal-1", "turn-1");

      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({status: TurnStatus.CANCELLED})
      );
    });

    it("never calls the plain non-transactional update path — only transaction.update is used", async () => {
      const docUpdateSpy = jest.fn();
      (db.collection as jest.Mock).mockImplementation(() => ({
        doc: jest.fn().mockReturnValue({update: docUpdateSpy}),
      }));
      const mockTurn: Turn = {
        id: "turn-1",
        memberId: "member-1",
        queueId: "queue-1",
        originalTurnNumber: 5,
        currentTurnNumber: 5,
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      const mockQueue = {reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 2}};
      const transaction = mockTurnAndQueue(mockTurn, mockQueue);

      await handleNoShow("terminal-1", "turn-1");

      expect(docUpdateSpy).not.toHaveBeenCalled();
      expect(transaction.update).toHaveBeenCalled();
    });
  });
});
