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
    // and "turns" resolves to a doc() that returns a fresh ref with a plain
    // set() spy (createTurn no longer uses a transaction).
    function mockQueueExists() {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      const turnRef = {id: "new-turn-id", set: setSpy};
      const turnsCollection = {
        doc: jest.fn().mockReturnValue(turnRef),
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

      return {setSpy};
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

      const turn = await getCurrentTurn(4213);
      expect(turn).toBeNull();
    });
  });
});
