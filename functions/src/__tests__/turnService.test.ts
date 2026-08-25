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
    // and "turns" resolves to both a doc() (plain set() spy — createTurn no
    // longer uses a transaction) and the where().where().where().limit().get()
    // chain used by the same-queue duplicate check. Defaults to "no existing
    // active turn found" so existing creation tests are unaffected.
    function mockQueueExists(existingActiveTurn: Turn | null = null) {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      const turnRef = {id: "new-turn-id", set: setSpy};
      const turnsCollection = {
        doc: jest.fn().mockReturnValue(turnRef),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(existingActiveTurn ?
          {empty: false, docs: [{data: () => existingActiveTurn}]} :
          {empty: true, docs: []}),
      };

      (db.collection as jest.Mock).mockImplementation((name: string) => {
        if (name === "queues") {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({exists: true, data: () => ({active: true})}),
            }),
          };
        }
        if (name === "turns") {
          return turnsCollection;
        }
        throw new Error(`Unexpected collection: ${name}`);
      });

      return {setSpy, turnsCollection};
    }

    it("returns the createdAt that was actually written via set()", async () => {
      const {setSpy} = mockQueueExists();

      const result = await createTurn("queue-1", 4213);

      const setCallArg = setSpy.mock.calls[0][0] as Turn;
      expect(result.createdAt).toBe(setCallArg.createdAt);
      expect(result.queuedAt).toBe(setCallArg.createdAt);
      expect(result.memberNumber).toBe(4213);
    });

    it("should reject if queue does not exist", async () => {
      const mockQueueDoc = {exists: false};

      (db.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockQueueDoc),
        }),
      });

      expect(createTurn("invalid-queue", 4213)).rejects.toThrow();
    });

    it("should reject if queue is closed (active === false)", async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);

      (db.collection as jest.Mock).mockImplementation((name: string) => {
        if (name === "queues") {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({exists: true, data: () => ({active: false})}),
            }),
          };
        }
        if (name === "turns") {
          return {doc: jest.fn().mockReturnValue({id: "new-turn-id", set: setSpy})};
        }
        throw new Error(`Unexpected collection: ${name}`);
      });

      await expect(createTurn("queue-1", 4213)).rejects.toThrow("Queue queue-1 is closed");
      expect(setSpy).not.toHaveBeenCalled();
    });

    describe("same-queue duplicate guard", () => {
      it("returns the existing active turn instead of creating a new one", async () => {
        const existing: Turn = {
          id: "existing-turn",
          memberNumber: 4213,
          queueId: "queue-1",
          queuedAt: new Date("2026-01-01T10:00:00Z"),
          status: TurnStatus.WAITING,
          channel: "totem",
          recallCount: 0,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        };
        const {setSpy} = mockQueueExists(existing);

        const result = await createTurn("queue-1", 4213);

        expect(result).toEqual(existing);
        expect(setSpy).not.toHaveBeenCalled();
      });

      it("scopes the duplicate check to memberNumber AND queueId (not memberNumber alone)", async () => {
        const {setSpy, turnsCollection} = mockQueueExists(null);

        const result = await createTurn("queue-1", 4213);

        expect(turnsCollection.where).toHaveBeenCalledWith("memberNumber", "==", 4213);
        expect(turnsCollection.where).toHaveBeenCalledWith("queueId", "==", "queue-1");
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(result.queueId).toBe("queue-1");
      });
    });

    describe("memberNumber validation", () => {
      it.each([0, 100000, 1.5, -1])(
        "rejects %p with ValidationError",
        async (memberNumber) => {
          await expect(createTurn("queue-1", memberNumber)).rejects.toThrow("memberNumber must be an integer between 1 and 99999");
        }
      );

      it.each([1, 99999])("accepts %p", async (memberNumber) => {
        const {setSpy} = mockQueueExists();

        const result = await createTurn("queue-1", memberNumber);

        expect(result.memberNumber).toBe(memberNumber);
        expect(setSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("cancelTurn", () => {
    it("cancels a waiting turn when memberNumber matches", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({status: TurnStatus.WAITING, memberNumber: 4213}),
      });

      await cancelTurn("turn-1", 4213);

      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        {status: TurnStatus.CANCELLED}
      );
    });

    it("throws NotFoundError if turn does not exist", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({exists: false});

      await expect(cancelTurn("invalid-turn", 4213)).rejects.toThrow();
    });

    it("throws ConflictError if turn is not WAITING", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({status: TurnStatus.CALLED, memberNumber: 4213}),
      });

      await expect(cancelTurn("turn-1", 4213)).rejects.toThrow();
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError and does not cancel if memberNumber does not match", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({status: TurnStatus.WAITING, memberNumber: 4213}),
      });

      await expect(cancelTurn("turn-1", 9999)).rejects.toThrow();
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

      const turn = await getCurrentTurn(4213);
      expect(turn).toBeNull();
    });
  });
});
