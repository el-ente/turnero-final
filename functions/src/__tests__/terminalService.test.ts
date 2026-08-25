import {getNextTurn, callTurn, startTurn, finishTurn, recallTurn, handleNoShow, nextRatioCounterState} from "../services/terminalService";
import {db} from "../config/firebase-admin";
import {Terminal, Turn, TurnStatus, ServingStrategy} from "shared";
import {NotFoundError, ConflictError} from "../utils/errors";
import {mockRunTransaction} from "./helpers";
import {getWaitingTurnsAcrossQueues} from "../services/queueService";

jest.mock("../config/firebase-admin");
jest.mock("../services/queueService");

// Shared by callTurn/handleNoShow tests: transaction.get uses db.collection(...).doc(...)
// refs as keys, so db.collection must resolve to something with a .doc() before the
// transaction body runs.
function mockCollectionDocs() {
  (db.collection as jest.Mock).mockImplementation(() => ({
    doc: jest.fn().mockReturnValue({}),
    // handleNoShow's requeue branch builds a where().where().orderBy() query
    // on "turns" to pass to transaction.get — the query itself is never
    // executed (transaction.get is mocked directly below), it just needs to
    // be constructible without throwing.
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  }));
}

// Mimics a Firestore Timestamp (only `.toDate()`, no `.getTime()`) — real
// transaction.get() reads return these for queuedAt despite the `Date` type
// annotation. Using a plain Date here would let a broken toMillis() call
// (e.g. `.getTime()` used directly) pass by accident.
function fakeTimestamp(ms: number): Date {
  return {toDate: () => new Date(ms)} as unknown as Date;
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
      (getWaitingTurnsAcrossQueues as jest.Mock).mockResolvedValue([]);

      const result = await getNextTurn("terminal-1");

      expect(result).toBeNull();
    });

    it("queries queue types in a single batched call regardless of activeQueueIds length", async () => {
      const mockTerminal: Terminal = {
        id: "terminal-1",
        name: "Terminal 1",
        sectorIds: ["sector-1"],
        activeQueueIds: ["q1", "q2", "q3", "q4", "q5"],
        servingStrategy: ServingStrategy.RATIO_BASED,
        strategyConfig: {
          strategy: ServingStrategy.RATIO_BASED,
          ratioBased: {normalQueueRatio: 3, priorityQueueRatio: 1, normalCounterState: 0, priorityCounterState: 0},
        },
        status: "available",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const whereMock = jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          docs: [
            {id: "q1", data: () => ({type: "normal"})},
            {id: "q2", data: () => ({type: "priority"})},
            {id: "q3", data: () => ({type: "normal"})},
            {id: "q4", data: () => ({type: "normal"})},
            {id: "q5", data: () => ({type: "priority"})},
          ],
        }),
      });

      (db.collection as jest.Mock).mockImplementation((name: string) => {
        if (name === "terminals") {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({exists: true, data: () => mockTerminal}),
            }),
          };
        }
        if (name === "queues") {
          return {where: whereMock};
        }
        return {doc: jest.fn().mockReturnValue({get: jest.fn()})};
      });
      (getWaitingTurnsAcrossQueues as jest.Mock).mockResolvedValue([]);

      await getNextTurn("terminal-1");

      expect(whereMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getNextTurnRatioBased (via getNextTurn)", () => {
    function mockTerminalAndQueues(terminal: Terminal, queueDocs: {id: string; type: string}[]) {
      const whereMock = jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          docs: queueDocs.map((q) => ({id: q.id, data: () => ({type: q.type})})),
        }),
      });

      (db.collection as jest.Mock).mockImplementation((name: string) => {
        if (name === "terminals") {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({exists: true, data: () => terminal}),
            }),
          };
        }
        if (name === "queues") {
          return {where: whereMock};
        }
        return {doc: jest.fn().mockReturnValue({get: jest.fn()})};
      });
    }

    function priorityPreferredTerminal(): Terminal {
      return {
        id: "terminal-1",
        name: "Terminal 1",
        sectorIds: ["sector-1"],
        activeQueueIds: ["q1", "q2"],
        servingStrategy: ServingStrategy.RATIO_BASED,
        strategyConfig: {
          strategy: ServingStrategy.RATIO_BASED,
          ratioBased: {normalQueueRatio: 3, priorityQueueRatio: 1, normalCounterState: 0, priorityCounterState: 0},
        },
        status: "available",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    function normalPreferredTerminal(): Terminal {
      return {
        id: "terminal-1",
        name: "Terminal 1",
        sectorIds: ["sector-1"],
        activeQueueIds: ["q1", "q2"],
        servingStrategy: ServingStrategy.RATIO_BASED,
        strategyConfig: {
          strategy: ServingStrategy.RATIO_BASED,
          ratioBased: {normalQueueRatio: 3, priorityQueueRatio: 1, normalCounterState: 0, priorityCounterState: 1},
        },
        status: "available",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    const queueDocs = [
      {id: "q1", type: "normal"},
      {id: "q2", type: "priority"},
    ];

    it("returns null when strategyConfig.ratioBased is missing", async () => {
      const mockTerminal: Terminal = {
        id: "terminal-1",
        name: "Terminal 1",
        sectorIds: ["sector-1"],
        activeQueueIds: ["q1"],
        servingStrategy: ServingStrategy.RATIO_BASED,
        strategyConfig: {strategy: ServingStrategy.RATIO_BASED},
        status: "available",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({exists: true, data: () => mockTerminal}),
        }),
      });

      const result = await getNextTurn("terminal-1");

      expect(result).toBeNull();
      expect(getWaitingTurnsAcrossQueues).not.toHaveBeenCalled();
    });

    it("returns the first priority turn when counters favor priority and priority turns are waiting", async () => {
      mockTerminalAndQueues(priorityPreferredTerminal(), queueDocs);
      const priorityTurn: Turn = {
        id: "turn-p1",
        memberNumber: 1,
        queueId: "q2",
        queuedAt: new Date(),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      (getWaitingTurnsAcrossQueues as jest.Mock).mockResolvedValueOnce([priorityTurn]);

      const result = await getNextTurn("terminal-1");

      expect(result).toEqual(priorityTurn);
      expect(getWaitingTurnsAcrossQueues).toHaveBeenCalledTimes(1);
      expect(getWaitingTurnsAcrossQueues).toHaveBeenCalledWith(["q2"]);
    });

    it("falls back to the first normal turn when counters favor priority but no priority turns are waiting", async () => {
      mockTerminalAndQueues(priorityPreferredTerminal(), queueDocs);
      const normalTurn: Turn = {
        id: "turn-n1",
        memberNumber: 2,
        queueId: "q1",
        queuedAt: new Date(),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      (getWaitingTurnsAcrossQueues as jest.Mock)
        .mockResolvedValueOnce([]) // priority queues: none waiting
        .mockResolvedValueOnce([normalTurn]); // fallback to normal queues

      const result = await getNextTurn("terminal-1");

      expect(result).toEqual(normalTurn);
      expect(getWaitingTurnsAcrossQueues).toHaveBeenNthCalledWith(1, ["q2"]);
      expect(getWaitingTurnsAcrossQueues).toHaveBeenNthCalledWith(2, ["q1"]);
    });

    it("returns the first normal turn when counters favor normal and normal turns are waiting", async () => {
      mockTerminalAndQueues(normalPreferredTerminal(), queueDocs);
      const normalTurn: Turn = {
        id: "turn-n1",
        memberNumber: 1,
        queueId: "q1",
        queuedAt: new Date(),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      (getWaitingTurnsAcrossQueues as jest.Mock).mockResolvedValueOnce([normalTurn]);

      const result = await getNextTurn("terminal-1");

      expect(result).toEqual(normalTurn);
      expect(getWaitingTurnsAcrossQueues).toHaveBeenCalledTimes(1);
      expect(getWaitingTurnsAcrossQueues).toHaveBeenCalledWith(["q1"]);
    });

    it("falls back to the first priority turn when counters favor normal but no normal turns are waiting", async () => {
      mockTerminalAndQueues(normalPreferredTerminal(), queueDocs);
      const priorityTurn: Turn = {
        id: "turn-p1",
        memberNumber: 2,
        queueId: "q2",
        queuedAt: new Date(),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      (getWaitingTurnsAcrossQueues as jest.Mock)
        .mockResolvedValueOnce([]) // normal queues: none waiting
        .mockResolvedValueOnce([priorityTurn]); // fallback to priority queues

      const result = await getNextTurn("terminal-1");

      expect(result).toEqual(priorityTurn);
      expect(getWaitingTurnsAcrossQueues).toHaveBeenNthCalledWith(1, ["q1"]);
      expect(getWaitingTurnsAcrossQueues).toHaveBeenNthCalledWith(2, ["q2"]);
    });
  });

  describe("nextRatioCounterState", () => {
    it("increments the normal counter for a normal turn", () => {
      const result = nextRatioCounterState(
        {normalQueueRatio: 3, priorityQueueRatio: 1, normalCounterState: 0, priorityCounterState: 0},
        false
      );
      expect(result).toEqual({normalCounterState: 1, priorityCounterState: 0});
    });

    it("increments the priority counter for a priority turn", () => {
      const result = nextRatioCounterState(
        {normalQueueRatio: 3, priorityQueueRatio: 1, normalCounterState: 0, priorityCounterState: 0},
        true
      );
      expect(result).toEqual({normalCounterState: 0, priorityCounterState: 1});
    });

    it("resets both counters once a full cycle completes", () => {
      const result = nextRatioCounterState(
        {normalQueueRatio: 3, priorityQueueRatio: 1, normalCounterState: 3, priorityCounterState: 0},
        true
      );
      expect(result).toEqual({normalCounterState: 0, priorityCounterState: 0});
    });

    it("does not reset when only one threshold is reached", () => {
      const result = nextRatioCounterState(
        {normalQueueRatio: 3, priorityQueueRatio: 2, normalCounterState: 3, priorityCounterState: 0},
        false
      );
      expect(result).toEqual({normalCounterState: 4, priorityCounterState: 0});
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
        .mockResolvedValueOnce({exists: true, data: () => ({})}) // terminal
        .mockResolvedValueOnce({exists: false}); // turn

      await expect(callTurn("terminal-1", "invalid-turn")).rejects.toThrow(NotFoundError);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("should throw ConflictError if terminal already has an active currentTurnId", async () => {
      mockCollectionDocs();
      const mockTerminal: Terminal = {
        id: "terminal-1",
        name: "Terminal 1",
        sectorIds: ["sector-1"],
        activeQueueIds: ["queue-1"],
        servingStrategy: ServingStrategy.FIFO_ACROSS_QUEUES,
        strategyConfig: {strategy: ServingStrategy.FIFO_ACROSS_QUEUES},
        status: "available",
        currentTurnId: "turn-in-progress",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: true, data: () => mockTerminal}); // terminal

      await expect(callTurn("terminal-1", "turn-2")).rejects.toThrow(ConflictError);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("should throw ConflictError if turn is not in WAITING status", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => ({})}) // terminal
        .mockResolvedValueOnce({exists: true, data: () => mockTurn}); // turn

      await expect(callTurn("terminal-1", "turn-1")).rejects.toThrow(ConflictError);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("should update both the turn and terminal when the turn is WAITING", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
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
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => mockTerminal}) // terminal
        .mockResolvedValueOnce({exists: true, data: () => mockTurn}) // turn
        .mockResolvedValueOnce({exists: true, data: () => ({type: "normal"})}); // queue

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

    it("increments the priority counter when the terminal is ratio_based and the turn's queue is priority", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      const mockTerminal: Terminal = {
        id: "terminal-1",
        name: "Terminal 1",
        sectorIds: ["sector-1"],
        activeQueueIds: ["queue-1"],
        servingStrategy: ServingStrategy.RATIO_BASED,
        strategyConfig: {
          strategy: ServingStrategy.RATIO_BASED,
          ratioBased: {normalQueueRatio: 3, priorityQueueRatio: 1, normalCounterState: 0, priorityCounterState: 0},
        },
        status: "available",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => mockTerminal}) // terminal
        .mockResolvedValueOnce({exists: true, data: () => mockTurn}) // turn
        .mockResolvedValueOnce({exists: true, data: () => ({type: "priority"})}); // queue

      await callTurn("terminal-1", "turn-1");

      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentTurnId: "turn-1",
          strategyConfig: expect.objectContaining({
            ratioBased: expect.objectContaining({normalCounterState: 0, priorityCounterState: 1}),
          }),
        })
      );
    });

    it("increments the normal counter when the terminal is ratio_based and the turn's queue is normal", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      const mockTerminal: Terminal = {
        id: "terminal-1",
        name: "Terminal 1",
        sectorIds: ["sector-1"],
        activeQueueIds: ["queue-1"],
        servingStrategy: ServingStrategy.RATIO_BASED,
        strategyConfig: {
          strategy: ServingStrategy.RATIO_BASED,
          ratioBased: {normalQueueRatio: 3, priorityQueueRatio: 1, normalCounterState: 0, priorityCounterState: 0},
        },
        status: "available",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => mockTerminal}) // terminal
        .mockResolvedValueOnce({exists: true, data: () => mockTurn}) // turn
        .mockResolvedValueOnce({exists: true, data: () => ({type: "normal"})}); // queue

      await callTurn("terminal-1", "turn-1");

      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentTurnId: "turn-1",
          strategyConfig: expect.objectContaining({
            ratioBased: expect.objectContaining({normalCounterState: 1, priorityCounterState: 0}),
          }),
        })
      );
    });
  });

  describe("startTurn", () => {
    it("should throw error if turn is not in CALLED status", async () => {
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
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

  describe("recallTurn", () => {
    it("bumps recallCount and stamps lastRecallAt for a CALLED turn", async () => {
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 1,
        createdAt: new Date(),
      };
      const updateSpy = jest.fn().mockResolvedValue(undefined);

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({exists: true, data: () => mockTurn}),
          update: updateSpy,
        }),
      });

      await recallTurn("terminal-1", "turn-1");

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const updateArg = updateSpy.mock.calls[0][0];
      expect(updateArg.recallCount).toBe(2);
      expect(updateArg.lastRecallAt).toBeInstanceOf(Date);
    });

    it("throws ConflictError if turn is not in CALLED status", async () => {
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({exists: true, data: () => mockTurn}),
        }),
      });

      await expect(recallTurn("terminal-1", "turn-1")).rejects.toThrow();
    });

    it("throws NotFoundError if turn does not exist", async () => {
      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({exists: false}),
        }),
      });

      await expect(recallTurn("terminal-1", "invalid-turn")).rejects.toThrow();
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
    function mockTurnAndQueue(
      turn: Turn,
      queue: {reenqueueConfig: {enabled: boolean; maxAttempts: number; positionsBack: number}},
      waitingTurns?: Partial<Turn>[]
    ) {
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true}) // terminal
        .mockResolvedValueOnce({exists: true, data: () => turn}) // turn
        .mockResolvedValueOnce({exists: true, data: () => queue}); // queue
      if (waitingTurns) {
        // 4th transaction.get call: the requeue branch's waiting-list query.
        transaction.get.mockResolvedValueOnce({
          docs: waitingTurns.map((t) => ({data: () => t})),
        });
      }
      return transaction;
    }

    it("should throw NotFoundError if terminal not found", async () => {
      mockCollectionDocs();
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: false});

      await expect(handleNoShow("invalid-terminal", "turn-1")).rejects.toThrow(NotFoundError);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("should requeue the turn behind the configured positionsBack count", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      const mockQueue = {reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 2}};
      const base = Date.now();
      // 3 waiting turns; positionsBack=2 clamps to idx=2, so the anchor is
      // waiting[1] (the turn immediately before index 2), not waiting[2].
      const waiting: Partial<Turn>[] = [
        {queuedAt: fakeTimestamp(base)},
        {queuedAt: fakeTimestamp(base + 1000)},
        {queuedAt: fakeTimestamp(base + 2000)},
      ];
      const transaction = mockTurnAndQueue(mockTurn, mockQueue, waiting);

      await handleNoShow("terminal-1", "turn-1");

      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          queuedAt: new Date(base + 1000 + 1),
          recallCount: 1,
          status: TurnStatus.WAITING,
        })
      );
      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({currentTurnId: ""})
      );
    });

    it("clamps to the back of the waiting list when positionsBack exceeds its length", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      // positionsBack (5) exceeds the waiting list length (2): clamp to
      // idx = waiting.length = 2, anchoring behind the last waiting turn.
      const mockQueue = {reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 5}};
      const base = Date.now();
      const waiting: Partial<Turn>[] = [
        {queuedAt: fakeTimestamp(base)},
        {queuedAt: fakeTimestamp(base + 1000)},
      ];
      const transaction = mockTurnAndQueue(mockTurn, mockQueue, waiting);

      await handleNoShow("terminal-1", "turn-1");

      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          queuedAt: new Date(base + 1000 + 1),
          recallCount: 1,
          status: TurnStatus.WAITING,
        })
      );
    });

    it("anchors to now() when the waiting list is empty", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      const mockQueue = {reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 2}};
      const before = Date.now();
      const transaction = mockTurnAndQueue(mockTurn, mockQueue, []);

      await handleNoShow("terminal-1", "turn-1");

      const updateCall = transaction.update.mock.calls.find(
        (call) => (call[1] as Partial<Turn>).status === TurnStatus.WAITING
      );
      const queuedAt = (updateCall?.[1] as Partial<Turn>).queuedAt as Date;
      expect(queuedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("should cancel the turn when maxAttempts is reached", async () => {
      mockCollectionDocs();
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
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
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      }));
      const mockTurn: Turn = {
        id: "turn-1",
        memberNumber: 1,
        queueId: "queue-1",
        queuedAt: new Date(),
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 0,
        createdAt: new Date(),
      };
      const mockQueue = {reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 2}};
      const transaction = mockTurnAndQueue(mockTurn, mockQueue, []);

      await handleNoShow("terminal-1", "turn-1");

      expect(docUpdateSpy).not.toHaveBeenCalled();
      expect(transaction.update).toHaveBeenCalled();
    });
  });
});
