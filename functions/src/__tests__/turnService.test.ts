import {
  createTurn,
  getCurrentTurn,
  cancelTurn,
} from "../services/turnService";
import {db} from "../config/firebase-admin";
import {Turn, TurnStatus} from "shared";
import {mockRunTransaction} from "./helpers";

// Mock Firestore
jest.mock("../config/firebase-admin");

describe("Turn Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createTurn", () => {
    // Sets up db.collection so "queues" resolves to an existing queue doc,
    // and "turns" resolves to a chainable where().where() query object
    // (the actual query shape doesn't matter — transaction.get is mocked
    // directly via mockRunTransaction()).
    function mockQueueExists() {
      const turnsCollection = {
        where: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnValue({id: "new-turn-id"}),
      };

      (db.collection as jest.Mock).mockImplementation((name: string) => {
        if (name === "queues") {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({exists: true}),
            }),
          };
        }
        if (name === "turns") {
          return turnsCollection;
        }
        throw new Error(`Unexpected collection: ${name}`);
      });

      return turnsCollection;
    }

    it("computes the true max turn number across ALL of today's turns, not just the most recent", async () => {
      mockQueueExists();
      const transaction = mockRunTransaction();

      // Turn A was created first but requeued twice, so its currentTurnNumber (6)
      // is higher than turn B's, even though B was created more recently.
      const turnA: Partial<Turn> = {originalTurnNumber: 1, currentTurnNumber: 6};
      const turnB: Partial<Turn> = {originalTurnNumber: 2, currentTurnNumber: 2};
      transaction.get.mockResolvedValue({
        docs: [{data: () => turnA}, {data: () => turnB}],
      });

      const result = await createTurn("queue-1", "member-1");

      // Must be max(6, 2) + 1 = 7, not 3 (which the old "most recent doc" logic would give).
      expect(result.originalTurnNumber).toBe(7);
      expect(result.currentTurnNumber).toBe(7);

      const setCallArg = transaction.set.mock.calls[0][1] as Turn;
      expect(setCallArg.originalTurnNumber).toBe(7);
      expect(setCallArg.currentTurnNumber).toBe(7);
    });

    it("returns the createdAt that was actually written in the transaction", async () => {
      mockQueueExists();
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({docs: []});

      const result = await createTurn("queue-1", "member-1");

      const setCallArg = transaction.set.mock.calls[0][1] as Turn;
      expect(result.createdAt).toBe(setCallArg.createdAt);
    });

    it("should reject if queue does not exist", async () => {
      const mockQueueDoc = {exists: false};

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockQueueDoc),
        }),
      });

      // This would throw NotFoundError
      expect(createTurn("invalid-queue", "member-1")).rejects.toThrow();
    });
  });

  describe("cancelTurn", () => {
    it("cancels a waiting turn", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({status: TurnStatus.WAITING}),
      });

      await cancelTurn("turn-1");

      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        {status: TurnStatus.CANCELLED}
      );
    });

    it("throws NotFoundError if turn does not exist", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({exists: false});

      await expect(cancelTurn("invalid-turn")).rejects.toThrow();
    });

    it("throws ConflictError if turn is not WAITING", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({status: TurnStatus.CALLED}),
      });

      await expect(cancelTurn("turn-1")).rejects.toThrow();
      expect(transaction.update).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentTurn", () => {
    it("should return null if no active turn", async () => {
      const mockQuery = {
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({empty: true, docs: []}),
          }),
        }),
      };

      (db.collection as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(mockQuery),
        }),
      });

      const turn = await getCurrentTurn("member-1");
      expect(turn).toBeNull();
    });
  });
});
