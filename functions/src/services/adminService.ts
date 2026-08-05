import {db} from "../config/firebase-admin";
import {NotFoundError, ConflictError, ValidationError} from "../utils/errors";
import {FieldValue} from "firebase-admin/firestore";
import {QueueType, ServingStrategy} from "shared";

// ─── Sectors ───

export async function createSector(data: { name: string; description?: string }) {
  if (!data.name) throw new ValidationError("name is required");

  const ref = db.collection("sectors").doc();
  const sector = {
    id: ref.id,
    name: data.name,
    description: data.description || "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await ref.set(sector);
  return sector;
}

export async function listSectors() {
  const snap = await db.collection("sectors").orderBy("name").get();
  return snap.docs.map((doc) => doc.data());
}

export async function updateSector(sectorId: string, data: Record<string, any>) {
  const ref = db.collection("sectors").doc(sectorId);
  const doc = await ref.get();
  if (!doc.exists) throw new NotFoundError("Sector not found");

  const updateData: Record<string, any> = {updatedAt: new Date()};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;

  await ref.update(updateData);
  const updated = await ref.get();
  return updated.data();
}

export async function deleteSector(sectorId: string) {
  const ref = db.collection("sectors").doc(sectorId);
  const doc = await ref.get();
  if (!doc.exists) throw new NotFoundError("Sector not found");

  // Cascade: delete queues in this sector
  const queuesSnap = await db.collection("queues")
    .where("sectorId", "==", sectorId).get();
  const queueIds = queuesSnap.docs.map((d) => d.id);

  const batch = db.batch();

  // Delete queues
  for (const qDoc of queuesSnap.docs) {
    batch.delete(qDoc.ref);
  }

  // Clean terminals referencing this sector or its queues
  if (queueIds.length > 0) {
    const terminalsSnap = await db.collection("terminals").get();
    for (const tDoc of terminalsSnap.docs) {
      const tData = tDoc.data();
      const hasQueue = tData.activeQueueIds?.some((id: string) => queueIds.includes(id));
      const hasSector = tData.sectorIds?.includes(sectorId);
      if (hasQueue || hasSector) {
        batch.update(tDoc.ref, {
          sectorIds: (tData.sectorIds || []).filter((id: string) => id !== sectorId),
          activeQueueIds: (tData.activeQueueIds || []).filter((id: string) => !queueIds.includes(id)),
          updatedAt: new Date(),
        });
      }
    }
  } else {
    // Still clean sectorIds from terminals
    const terminalsSnap = await db.collection("terminals")
      .where("sectorIds", "array-contains", sectorId).get();
    for (const tDoc of terminalsSnap.docs) {
      batch.update(tDoc.ref, {
        sectorIds: FieldValue.arrayRemove(sectorId),
        updatedAt: new Date(),
      });
    }
  }

  batch.delete(ref);
  await batch.commit();
}

// ─── Queues ───

export async function createQueue(data: {
  name: string;
  sectorId: string;
  type: string;
  reenqueueConfig: { enabled: boolean; maxAttempts: number; positionsBack: number };
  priorityWeight?: number;
}) {
  if (!data.name) throw new ValidationError("name is required");
  if (!data.sectorId) throw new ValidationError("sectorId is required");
  if (data.type !== undefined && !Object.values(QueueType).includes(data.type as QueueType)) {
    throw new ValidationError("Invalid queue type");
  }

  // Validate sector exists
  const sectorDoc = await db.collection("sectors").doc(data.sectorId).get();
  if (!sectorDoc.exists) throw new NotFoundError("Sector not found");

  const ref = db.collection("queues").doc();
  const queue = {
    id: ref.id,
    name: data.name,
    sectorId: data.sectorId,
    type: data.type || "normal",
    reenqueueConfig: data.reenqueueConfig || {enabled: false, maxAttempts: 3, positionsBack: 5},
    priorityWeight: data.priorityWeight || 1,
    servedBy: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await ref.set(queue);
  return queue;
}

export async function listQueues() {
  const snap = await db.collection("queues").orderBy("name").get();
  return snap.docs.map((doc) => doc.data());
}

export async function updateQueue(queueId: string, data: Record<string, any>) {
  const ref = db.collection("queues").doc(queueId);
  const doc = await ref.get();
  if (!doc.exists) throw new NotFoundError("Queue not found");
  if (data.type !== undefined && !Object.values(QueueType).includes(data.type as QueueType)) {
    throw new ValidationError("Invalid queue type");
  }

  const updateData: Record<string, any> = {updatedAt: new Date()};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.sectorId !== undefined) updateData.sectorId = data.sectorId;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.reenqueueConfig !== undefined) updateData.reenqueueConfig = data.reenqueueConfig;
  if (data.priorityWeight !== undefined) updateData.priorityWeight = data.priorityWeight;

  await ref.update(updateData);
  const updated = await ref.get();
  return updated.data();
}

export async function deleteQueue(queueId: string) {
  const ref = db.collection("queues").doc(queueId);
  const doc = await ref.get();
  if (!doc.exists) throw new NotFoundError("Queue not found");

  // Check no active turns
  const activeTurns = await db.collection("turns")
    .where("queueId", "==", queueId)
    .where("status", "in", ["waiting", "called", "attending"])
    .limit(1).get();
  if (!activeTurns.empty) {
    throw new ConflictError("Cannot delete queue with active turns");
  }

  const batch = db.batch();

  // Remove from terminals' activeQueueIds
  const terminalsSnap = await db.collection("terminals")
    .where("activeQueueIds", "array-contains", queueId).get();
  for (const tDoc of terminalsSnap.docs) {
    batch.update(tDoc.ref, {
      activeQueueIds: FieldValue.arrayRemove(queueId),
      updatedAt: new Date(),
    });
  }

  batch.delete(ref);
  await batch.commit();
}

// ─── Terminals ───

export async function createTerminal(data: {
  name: string;
  sectorIds: string[];
  activeQueueIds: string[];
  servingStrategy: string;
  strategyConfig: Record<string, any>;
}) {
  if (!data.name) throw new ValidationError("name is required");
  if (
    data.servingStrategy !== undefined &&
    !Object.values(ServingStrategy).includes(data.servingStrategy as ServingStrategy)
  ) {
    throw new ValidationError("Invalid serving strategy");
  }

  const ref = db.collection("terminals").doc();
  const terminal = {
    id: ref.id,
    name: data.name,
    sectorIds: data.sectorIds || [],
    activeQueueIds: data.activeQueueIds || [],
    servingStrategy: data.servingStrategy || "fifo_across_queues",
    strategyConfig: data.strategyConfig || {strategy: data.servingStrategy || "fifo_across_queues"},
    currentTurnId: null,
    status: "available",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await ref.set(terminal);

  // Sync servedBy on queues
  await syncServedBy(ref.id, [], data.activeQueueIds || []);

  return terminal;
}

export async function listTerminals() {
  const snap = await db.collection("terminals").orderBy("name").get();
  return snap.docs.map((doc) => doc.data());
}

export async function updateTerminal(terminalId: string, data: Record<string, any>) {
  const ref = db.collection("terminals").doc(terminalId);
  const doc = await ref.get();
  if (!doc.exists) throw new NotFoundError("Terminal not found");
  if (
    data.servingStrategy !== undefined &&
    !Object.values(ServingStrategy).includes(data.servingStrategy as ServingStrategy)
  ) {
    throw new ValidationError("Invalid serving strategy");
  }

  const oldData = doc.data()!;
  const updateData: Record<string, any> = {updatedAt: new Date()};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.sectorIds !== undefined) updateData.sectorIds = data.sectorIds;
  if (data.activeQueueIds !== undefined) updateData.activeQueueIds = data.activeQueueIds;
  if (data.servingStrategy !== undefined) updateData.servingStrategy = data.servingStrategy;
  if (data.strategyConfig !== undefined) updateData.strategyConfig = data.strategyConfig;
  if (data.status !== undefined) updateData.status = data.status;

  await ref.update(updateData);

  // Sync servedBy if activeQueueIds changed
  if (data.activeQueueIds !== undefined) {
    await syncServedBy(terminalId, oldData.activeQueueIds || [], data.activeQueueIds);
  }

  const updated = await ref.get();
  return updated.data();
}

export async function deleteTerminal(terminalId: string) {
  const ref = db.collection("terminals").doc(terminalId);
  const doc = await ref.get();
  if (!doc.exists) throw new NotFoundError("Terminal not found");

  const data = doc.data()!;
  if (data.status === "busy") {
    throw new ConflictError("Cannot delete busy terminal");
  }

  // Remove from queues' servedBy
  await syncServedBy(terminalId, data.activeQueueIds || [], []);

  await ref.delete();
}

// ─── Helpers ───

async function syncServedBy(terminalId: string, oldQueueIds: string[], newQueueIds: string[]) {
  const removed = oldQueueIds.filter((id) => !newQueueIds.includes(id));
  const added = newQueueIds.filter((id) => !oldQueueIds.includes(id));
  const batch = db.batch();

  for (const qId of removed) {
    batch.update(db.collection("queues").doc(qId), {
      servedBy: FieldValue.arrayRemove(terminalId),
    });
  }
  for (const qId of added) {
    batch.update(db.collection("queues").doc(qId), {
      servedBy: FieldValue.arrayUnion(terminalId),
    });
  }

  if (removed.length > 0 || added.length > 0) {
    await batch.commit();
  }
}
