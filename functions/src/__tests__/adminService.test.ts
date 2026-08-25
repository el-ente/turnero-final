import {
  createSector,
  deleteSector,
  createQueue,
  deleteQueue,
  createTerminal,
  updateTerminal,
  deleteTerminal,
} from "../services/adminService";
import {db} from "../config/firebase-admin";
import {NotFoundError, ValidationError, ConflictError} from "../utils/errors";
import {FieldValue} from "firebase-admin/firestore";

jest.mock("../config/firebase-admin");

function mockBatch() {
  const batch = {
    delete: jest.fn(),
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  (db.batch as jest.Mock).mockReturnValue(batch);
  return batch;
}

function mockCollections(overrides: Record<string, unknown>) {
  (db.collection as jest.Mock).mockImplementation((name: string) => {
    if (overrides[name]) return overrides[name];
    throw new Error(`Unexpected collection: ${name}`);
  });
}

describe("Admin Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createSector", () => {
    it("creates a sector and calls ref.set with the expected shape", async () => {
      const sectorRef = {id: "sector-1", set: jest.fn().mockResolvedValue(undefined)};
      mockCollections({
        sectors: {doc: jest.fn().mockReturnValue(sectorRef)},
      });

      const result = await createSector({name: "Cashiers", description: "Front desk"});

      expect(sectorRef.set).toHaveBeenCalledWith({
        id: "sector-1",
        name: "Cashiers",
        description: "Front desk",
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(result).toMatchObject({id: "sector-1", name: "Cashiers", description: "Front desk"});
    });

    it("throws ValidationError when name is missing", async () => {
      await expect(createSector({name: ""} as any)).rejects.toThrow(ValidationError);
    });
  });

  describe("deleteSector", () => {
    it("throws NotFoundError when sector does not exist", async () => {
      mockCollections({
        sectors: {doc: jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue({exists: false})})},
      });

      await expect(deleteSector("missing-sector")).rejects.toThrow(NotFoundError);
    });

    it("throws ConflictError when any queue in the sector has active turns", async () => {
      const sectorRef = {get: jest.fn().mockResolvedValue({exists: true})};
      const queuesSnap = {docs: [{id: "q1", ref: {}}, {id: "q2", ref: {}}]};
      const activeTurnsGet = jest.fn().mockResolvedValue({empty: false});
      const turnsWhere = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({get: activeTurnsGet}),
        }),
      });

      mockCollections({
        sectors: {doc: jest.fn().mockReturnValue(sectorRef)},
        queues: {where: jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue(queuesSnap)})},
        turns: {where: turnsWhere},
      });

      await expect(deleteSector("sector-1")).rejects.toThrow(ConflictError);
      expect(turnsWhere).toHaveBeenCalledWith("queueId", "in", ["q1", "q2"]);
    });

    it("batch-deletes queues and updates referencing terminals when the sector has queues", async () => {
      const sectorRef = {get: jest.fn().mockResolvedValue({exists: true})};
      const q1Ref = {id: "q1-ref"};
      const q2Ref = {id: "q2-ref"};
      const queuesSnap = {
        docs: [
          {id: "q1", ref: q1Ref},
          {id: "q2", ref: q2Ref},
        ],
      };
      const termARef = {id: "termA-ref"}; // matches via activeQueueIds only
      const termBRef = {id: "termB-ref"}; // matches via sectorIds only
      const termCRef = {id: "termC-ref"}; // matches neither, must stay untouched
      const terminalsSnap = {
        docs: [
          {
            ref: termARef,
            data: () => ({activeQueueIds: ["q1", "q3"], sectorIds: ["other-sector"]}),
          },
          {
            ref: termBRef,
            data: () => ({activeQueueIds: ["qX"], sectorIds: ["sector-1", "other-sector"]}),
          },
          {
            ref: termCRef,
            data: () => ({activeQueueIds: ["qX"], sectorIds: ["other-sector"]}),
          },
        ],
      };

      const activeTurnsGet = jest.fn().mockResolvedValue({empty: true});
      mockCollections({
        sectors: {doc: jest.fn().mockReturnValue(sectorRef)},
        queues: {where: jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue(queuesSnap)})},
        terminals: {get: jest.fn().mockResolvedValue(terminalsSnap)},
        turns: {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({get: activeTurnsGet}),
            }),
          }),
        },
      });
      const batch = mockBatch();

      await deleteSector("sector-1");

      // Both queues deleted, plus the sector itself.
      expect(batch.delete).toHaveBeenCalledTimes(3);
      expect(batch.delete).toHaveBeenNthCalledWith(1, q1Ref);
      expect(batch.delete).toHaveBeenNthCalledWith(2, q2Ref);
      expect(batch.delete).toHaveBeenNthCalledWith(3, sectorRef);

      // termA (queue-only match) and termB (sector-only match) both get cleaned up;
      // termC (no match) is left alone.
      expect(batch.update).toHaveBeenCalledTimes(2);
      expect(batch.update).toHaveBeenCalledWith(termARef, {
        sectorIds: ["other-sector"],
        activeQueueIds: ["q3"],
        updatedAt: expect.any(Date),
      });
      expect(batch.update).toHaveBeenCalledWith(termBRef, {
        sectorIds: ["other-sector"],
        activeQueueIds: ["qX"],
        updatedAt: expect.any(Date),
      });
      expect(batch.update).not.toHaveBeenCalledWith(termCRef, expect.anything());

      expect(batch.commit).toHaveBeenCalledTimes(1);
    });

    it("uses the array-contains terminals query when the sector has zero queues", async () => {
      const sectorRef = {get: jest.fn().mockResolvedValue({exists: true})};
      const queuesSnap = {docs: []};
      const termCRef = {id: "termC-ref"};
      const arrayContainsSnap = {docs: [{ref: termCRef, data: () => ({sectorIds: ["sector-1", "other"]})}]};
      const terminalsWhere = jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue(arrayContainsSnap)});

      mockCollections({
        sectors: {doc: jest.fn().mockReturnValue(sectorRef)},
        queues: {where: jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue(queuesSnap)})},
        terminals: {where: terminalsWhere},
      });
      const batch = mockBatch();

      await deleteSector("sector-1");

      expect(terminalsWhere).toHaveBeenCalledWith("sectorIds", "array-contains", "sector-1");

      // No queues to delete, only the sector itself.
      expect(batch.delete).toHaveBeenCalledTimes(1);
      expect(batch.delete).toHaveBeenCalledWith(sectorRef);

      expect(batch.update).toHaveBeenCalledTimes(1);
      expect(batch.update).toHaveBeenCalledWith(termCRef, {
        sectorIds: FieldValue.arrayRemove("sector-1"),
        updatedAt: expect.any(Date),
      });

      expect(batch.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe("createQueue", () => {
    it("throws NotFoundError when sector does not exist", async () => {
      mockCollections({
        sectors: {doc: jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue({exists: false})})},
      });

      await expect(
        createQueue({name: "Q1", sectorId: "missing-sector", type: "normal", reenqueueConfig: {enabled: false, maxAttempts: 3, positionsBack: 5}})
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ValidationError when name is missing", async () => {
      await expect(
        createQueue({name: "", sectorId: "sector-1", type: "normal", reenqueueConfig: {enabled: false, maxAttempts: 3, positionsBack: 5}})
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when sectorId is missing", async () => {
      await expect(
        createQueue({name: "Q1", sectorId: "", type: "normal", reenqueueConfig: {enabled: false, maxAttempts: 3, positionsBack: 5}})
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for an invalid queue type", async () => {
      await expect(
        createQueue({name: "Q1", sectorId: "sector-1", type: "bogus", reenqueueConfig: {enabled: false, maxAttempts: 3, positionsBack: 5}})
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("deleteQueue", () => {
    it("throws ConflictError when the queue has active turns", async () => {
      const queueRef = {get: jest.fn().mockResolvedValue({exists: true})};
      const activeTurnsGet = jest.fn().mockResolvedValue({empty: false});
      mockCollections({
        queues: {doc: jest.fn().mockReturnValue(queueRef)},
        turns: {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({get: activeTurnsGet}),
            }),
          }),
        },
      });

      await expect(deleteQueue("queue-1")).rejects.toThrow(ConflictError);
    });

    it("deletes the queue and removes it from terminals' activeQueueIds", async () => {
      const queueRef = {get: jest.fn().mockResolvedValue({exists: true})};
      const activeTurnsGet = jest.fn().mockResolvedValue({empty: true});
      const termRef = {id: "term-ref"};
      const terminalsSnap = {docs: [{ref: termRef}]};
      const terminalsWhere = jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue(terminalsSnap)});

      mockCollections({
        queues: {doc: jest.fn().mockReturnValue(queueRef)},
        turns: {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({get: activeTurnsGet}),
            }),
          }),
        },
        terminals: {where: terminalsWhere},
      });
      const batch = mockBatch();

      await deleteQueue("queue-1");

      expect(terminalsWhere).toHaveBeenCalledWith("activeQueueIds", "array-contains", "queue-1");
      expect(batch.update).toHaveBeenCalledWith(termRef, {
        activeQueueIds: FieldValue.arrayRemove("queue-1"),
        updatedAt: expect.any(Date),
      });
      expect(batch.delete).toHaveBeenCalledWith(queueRef);
      expect(batch.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe("createTerminal", () => {
    it("throws ValidationError for an invalid serving strategy", async () => {
      await expect(
        createTerminal({name: "T1", sectorIds: [], activeQueueIds: [], servingStrategy: "bogus", strategyConfig: {}})
      ).rejects.toThrow(ValidationError);
    });

    it("syncs servedBy via arrayUnion for each initial active queue", async () => {
      const terminalRef = {id: "terminal-1", set: jest.fn().mockResolvedValue(undefined)};
      const queueDoc = jest.fn((id: string) => ({id}));
      mockCollections({
        terminals: {doc: jest.fn().mockReturnValue(terminalRef)},
        queues: {doc: queueDoc},
      });
      const batch = mockBatch();

      await createTerminal({
        name: "T1",
        sectorIds: ["sector-1"],
        activeQueueIds: ["q1", "q2"],
        servingStrategy: "fifo_across_queues",
        strategyConfig: {},
      });

      expect(terminalRef.set).toHaveBeenCalled();
      expect(batch.update).toHaveBeenCalledTimes(2);
      expect(batch.update).toHaveBeenCalledWith({id: "q1"}, {servedBy: FieldValue.arrayUnion("terminal-1")});
      expect(batch.update).toHaveBeenCalledWith({id: "q2"}, {servedBy: FieldValue.arrayUnion("terminal-1")});
      expect(batch.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateTerminal", () => {
    it("throws ValidationError for an invalid serving strategy", async () => {
      const terminalRef = {get: jest.fn().mockResolvedValue({exists: true, data: () => ({activeQueueIds: []})})};
      mockCollections({
        terminals: {doc: jest.fn().mockReturnValue(terminalRef)},
      });

      await expect(updateTerminal("terminal-1", {servingStrategy: "bogus"})).rejects.toThrow(ValidationError);
    });

    it("computes removed/added queues correctly when activeQueueIds changes", async () => {
      const terminalDoc = {
        exists: true,
        data: () => ({activeQueueIds: ["A", "B"]}),
      };
      const terminalRef = {
        get: jest.fn().mockResolvedValue(terminalDoc),
        update: jest.fn().mockResolvedValue(undefined),
      };
      const queueDoc = jest.fn((id: string) => ({id}));
      mockCollections({
        terminals: {doc: jest.fn().mockReturnValue(terminalRef)},
        queues: {doc: queueDoc},
      });
      const batch = mockBatch();

      await updateTerminal("terminal-1", {activeQueueIds: ["B", "C"]});

      // removed = [A] (arrayRemove), added = [C] (arrayUnion); B is unchanged.
      expect(batch.update).toHaveBeenCalledTimes(2);
      expect(batch.update).toHaveBeenCalledWith({id: "A"}, {servedBy: FieldValue.arrayRemove("terminal-1")});
      expect(batch.update).toHaveBeenCalledWith({id: "C"}, {servedBy: FieldValue.arrayUnion("terminal-1")});
      expect(batch.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteTerminal", () => {
    it("throws ConflictError when the terminal has a currentTurnId", async () => {
      const terminalRef = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({status: "available", currentTurnId: "turn-1", activeQueueIds: []}),
        }),
        delete: jest.fn(),
      };
      mockCollections({
        terminals: {doc: jest.fn().mockReturnValue(terminalRef)},
      });

      await expect(deleteTerminal("terminal-1")).rejects.toThrow(ConflictError);
      expect(terminalRef.delete).not.toHaveBeenCalled();
    });

    it("clears servedBy on previously-served queues for a terminal with no currentTurnId", async () => {
      const terminalRef = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({status: "available", activeQueueIds: ["q1", "q2"]}),
        }),
        delete: jest.fn().mockResolvedValue(undefined),
      };
      const queueDoc = jest.fn((id: string) => ({id}));
      mockCollections({
        terminals: {doc: jest.fn().mockReturnValue(terminalRef)},
        queues: {doc: queueDoc},
      });
      const batch = mockBatch();

      await deleteTerminal("terminal-1");

      expect(batch.update).toHaveBeenCalledTimes(2);
      expect(batch.update).toHaveBeenCalledWith({id: "q1"}, {servedBy: FieldValue.arrayRemove("terminal-1")});
      expect(batch.update).toHaveBeenCalledWith({id: "q2"}, {servedBy: FieldValue.arrayRemove("terminal-1")});
      expect(batch.commit).toHaveBeenCalledTimes(1);
      expect(terminalRef.delete).toHaveBeenCalledTimes(1);
    });
  });
});
