import * as admin from "firebase-admin";
import {
  Sector,
  Queue,
  QueueType,
  Terminal,
  ServingStrategy,
  TerminalStatus,
  Turn,
  TurnStatus,
} from "shared";

// Initialize Firebase (will use emulator if FIRESTORE_EMULATOR_HOST is set)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function seed() {
  console.log("Seeding Firestore...");

  try {
    // Clear existing data
    const collections = ["sectors", "queues", "terminals", "turns"];
    for (const col of collections) {
      const snapshot = await db.collection(col).get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      console.log(`Cleared ${col}`);
    }

    // 1. Create Sectors
    const sector1: Sector = {
      id: "sector-1",
      name: "Atención General",
      description: "Módulo de atención general",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sector2: Sector = {
      id: "sector-2",
      name: "Perfumería",
      description: "Sección perfumería",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("sectors").doc(sector1.id).set(sector1);
    await db.collection("sectors").doc(sector2.id).set(sector2);
    console.log("Created 2 sectors");

    // 2. Create Queues
    const queue1: Queue = {
      id: "queue-1",
      sectorId: sector1.id,
      name: "Clientes VIP",
      type: QueueType.PRIORITY,
      reenqueueConfig: {
        enabled: true,
        maxAttempts: 3,
        positionsBack: 5,
      },
      priorityWeight: 2,
      servedBy: ["terminal-1", "terminal-2"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const queue2: Queue = {
      id: "queue-2",
      sectorId: sector1.id,
      name: "Clientes Regulares",
      type: QueueType.NORMAL,
      reenqueueConfig: {
        enabled: true,
        maxAttempts: 2,
        positionsBack: 3,
      },
      servedBy: ["terminal-1"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const queue3: Queue = {
      id: "queue-3",
      sectorId: sector2.id,
      name: "Perfumería",
      type: QueueType.NORMAL,
      reenqueueConfig: {
        enabled: false,
        maxAttempts: 0,
        positionsBack: 0,
      },
      servedBy: ["terminal-2"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("queues").doc(queue1.id).set(queue1);
    await db.collection("queues").doc(queue2.id).set(queue2);
    await db.collection("queues").doc(queue3.id).set(queue3);
    console.log("Created 3 queues");

    // 3. Create Terminals
    const terminal1: Terminal = {
      id: "terminal-1",
      name: "Módulo 1",
      sectorIds: [sector1.id],
      activeQueueIds: [queue1.id, queue2.id],
      servingStrategy: ServingStrategy.RATIO_BASED,
      strategyConfig: {
        strategy: ServingStrategy.RATIO_BASED,
        ratioBased: {
          normalQueueRatio: 2,
          priorityQueueRatio: 1,
          normalCounterState: 0,
          priorityCounterState: 0,
        },
      },
      status: TerminalStatus.AVAILABLE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const terminal2: Terminal = {
      id: "terminal-2",
      name: "Módulo 2",
      sectorIds: [sector1.id, sector2.id],
      activeQueueIds: [queue1.id, queue3.id],
      servingStrategy: ServingStrategy.FIFO_ACROSS_QUEUES,
      strategyConfig: {
        strategy: ServingStrategy.FIFO_ACROSS_QUEUES,
      },
      status: TerminalStatus.AVAILABLE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("terminals").doc(terminal1.id).set(terminal1);
    await db.collection("terminals").doc(terminal2.id).set(terminal2);
    console.log("Created 2 terminals");

    // 4. Create Turns
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const turn1: Turn = {
      id: "turn-1",
      memberId: "member-1",
      queueId: queue1.id,
      originalTurnNumber: 1,
      currentTurnNumber: 1,
      status: TurnStatus.WAITING,
      channel: "totem",
      recallCount: 0,
      createdAt: todayMidnight,
    };

    const turn2: Turn = {
      id: "turn-2",
      memberId: "member-2",
      queueId: queue2.id,
      originalTurnNumber: 1,
      currentTurnNumber: 1,
      status: TurnStatus.WAITING,
      channel: "totem",
      recallCount: 0,
      createdAt: todayMidnight,
    };

    const turn3: Turn = {
      id: "turn-3",
      memberId: "member-3",
      queueId: queue1.id,
      originalTurnNumber: 2,
      currentTurnNumber: 2,
      status: TurnStatus.CALLED,
      channel: "totem",
      recallCount: 0,
      createdAt: todayMidnight,
      calledAt: new Date(now.getTime() - 60000), // 1 min ago
      terminalId: terminal1.id,
    };

    const turn4: Turn = {
      id: "turn-4",
      memberId: "member-4",
      queueId: queue2.id,
      originalTurnNumber: 2,
      currentTurnNumber: 2,
      status: TurnStatus.ATTENDING,
      channel: "totem",
      recallCount: 0,
      createdAt: todayMidnight,
      calledAt: new Date(now.getTime() - 120000), // 2 min ago
      attendingAt: new Date(now.getTime() - 30000), // 30 sec ago
      terminalId: terminal1.id,
    };

    const turn5: Turn = {
      id: "turn-5",
      memberId: "member-5",
      queueId: queue3.id,
      originalTurnNumber: 1,
      currentTurnNumber: 1,
      status: TurnStatus.WAITING,
      channel: "totem",
      recallCount: 0,
      createdAt: todayMidnight,
    };

    const turn6: Turn = {
      id: "turn-6",
      memberId: "member-6",
      queueId: queue1.id,
      originalTurnNumber: 3,
      currentTurnNumber: 3,
      status: TurnStatus.FINISHED,
      channel: "totem",
      recallCount: 0,
      createdAt: todayMidnight,
      calledAt: new Date(now.getTime() - 300000), // 5 min ago
      attendingAt: new Date(now.getTime() - 240000), // 4 min ago
      finishedAt: new Date(now.getTime() - 60000), // 1 min ago
      terminalId: terminal2.id,
    };

    const turn7: Turn = {
      id: "turn-7",
      memberId: "member-7",
      queueId: queue2.id,
      originalTurnNumber: 3,
      currentTurnNumber: 6, // requeued
      status: TurnStatus.WAITING,
      channel: "totem",
      recallCount: 1,
      createdAt: todayMidnight,
      lastRequeueAt: new Date(now.getTime() - 180000), // 3 min ago
    };

    const turns = [turn1, turn2, turn3, turn4, turn5, turn6, turn7];
    for (const turn of turns) {
      await db.collection("turns").doc(turn.id).set(turn);
    }
    console.log(`Created ${turns.length} turns`);

    console.log("✓ Seed completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
}

seed();
