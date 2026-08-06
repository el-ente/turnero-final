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
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || "turnero-60150",
  });
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

    // 1. Create Sectors — three departments, each with its own regular +
    // priority queue and a dedicated terminal.
    const sectorFarmacia: Sector = {
      id: "sector-farmacia",
      name: "Farmacia",
      description: "Dispensa de medicamentos y consultas farmacéuticas",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sectorPerfumeria: Sector = {
      id: "sector-perfumeria",
      name: "Perfumería",
      description: "Perfumes, cosmética y cuidado personal",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sectorPami: Sector = {
      id: "sector-pami",
      name: "PAMI",
      description: "Atención de recetas y trámites PAMI",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sectors = [sectorFarmacia, sectorPerfumeria, sectorPami];
    for (const sector of sectors) {
      await db.collection("sectors").doc(sector.id).set(sector);
    }
    console.log(`Created ${sectors.length} sectors`);

    // 2. Create Queues — regular + priority per sector
    const queueFarmacia: Queue = {
      id: "queue-farmacia",
      sectorId: sectorFarmacia.id,
      name: "Farmacia",
      type: QueueType.NORMAL,
      reenqueueConfig: {enabled: true, maxAttempts: 2, positionsBack: 3},
      servedBy: ["terminal-farmacia"],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const queueFarmaciaPrioritaria: Queue = {
      id: "queue-farmacia-prioritaria",
      sectorId: sectorFarmacia.id,
      name: "Farmacia Prioritaria",
      type: QueueType.PRIORITY,
      reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 3},
      priorityWeight: 2,
      servedBy: ["terminal-farmacia"],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const queuePerfumeria: Queue = {
      id: "queue-perfumeria",
      sectorId: sectorPerfumeria.id,
      name: "Perfumería",
      type: QueueType.NORMAL,
      reenqueueConfig: {enabled: true, maxAttempts: 2, positionsBack: 3},
      servedBy: ["terminal-perfumeria"],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const queuePerfumeriaPrioritaria: Queue = {
      id: "queue-perfumeria-prioritaria",
      sectorId: sectorPerfumeria.id,
      name: "Perfumería Prioritaria",
      type: QueueType.PRIORITY,
      reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 3},
      priorityWeight: 2,
      servedBy: ["terminal-perfumeria"],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const queuePami: Queue = {
      id: "queue-pami",
      sectorId: sectorPami.id,
      name: "PAMI",
      type: QueueType.NORMAL,
      reenqueueConfig: {enabled: true, maxAttempts: 2, positionsBack: 3},
      servedBy: ["terminal-pami"],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const queuePamiPrioritaria: Queue = {
      id: "queue-pami-prioritaria",
      sectorId: sectorPami.id,
      name: "PAMI Prioritaria",
      type: QueueType.PRIORITY,
      reenqueueConfig: {enabled: true, maxAttempts: 3, positionsBack: 3},
      priorityWeight: 2,
      servedBy: ["terminal-pami"],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const queues = [
      queueFarmacia, queueFarmaciaPrioritaria,
      queuePerfumeria, queuePerfumeriaPrioritaria,
      queuePami, queuePamiPrioritaria,
    ];
    for (const queue of queues) {
      await db.collection("queues").doc(queue.id).set(queue);
    }
    console.log(`Created ${queues.length} queues`);

    // 3. Create Terminals — one per sector, ratio-based between its own
    // regular and priority queue.
    const terminalFarmacia: Terminal = {
      id: "terminal-farmacia",
      name: "Farmacia",
      sectorIds: [sectorFarmacia.id],
      activeQueueIds: [queueFarmacia.id, queueFarmaciaPrioritaria.id],
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

    const terminalPerfumeria: Terminal = {
      id: "terminal-perfumeria",
      name: "Perfumería",
      sectorIds: [sectorPerfumeria.id],
      activeQueueIds: [queuePerfumeria.id, queuePerfumeriaPrioritaria.id],
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

    const terminalPami: Terminal = {
      id: "terminal-pami",
      name: "PAMI",
      sectorIds: [sectorPami.id],
      activeQueueIds: [queuePami.id, queuePamiPrioritaria.id],
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

    const terminals = [terminalFarmacia, terminalPerfumeria, terminalPami];
    for (const terminal of terminals) {
      await db.collection("terminals").doc(terminal.id).set(terminal);
    }
    console.log(`Created ${terminals.length} terminals`);

    // 4. Create sample Turns — a mix of waiting/called/attending across all
    // three sectors, so every screen has something real to show.
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000);

    const turns: Turn[] = [
      {
        id: "turn-1",
        memberNumber: 41287,
        queueId: queueFarmacia.id,
        queuedAt: todayMidnight,
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: todayMidnight,
      },
      {
        id: "turn-2",
        memberNumber: 9034,
        queueId: queueFarmacia.id,
        queuedAt: minutesAgo(8),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: minutesAgo(8),
      },
      {
        id: "turn-3",
        memberNumber: 77650,
        queueId: queueFarmaciaPrioritaria.id,
        queuedAt: minutesAgo(5),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: minutesAgo(5),
      },
      {
        id: "turn-4",
        memberNumber: 2216,
        queueId: queuePerfumeria.id,
        queuedAt: minutesAgo(2),
        status: TurnStatus.CALLED,
        channel: "totem",
        recallCount: 0,
        createdAt: minutesAgo(2),
        calledAt: minutesAgo(1),
        terminalId: terminalPerfumeria.id,
      },
      {
        id: "turn-5",
        memberNumber: 63801,
        queueId: queuePerfumeriaPrioritaria.id,
        queuedAt: minutesAgo(3),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 0,
        createdAt: minutesAgo(3),
      },
      {
        id: "turn-6",
        memberNumber: 512,
        queueId: queuePami.id,
        queuedAt: minutesAgo(6),
        status: TurnStatus.ATTENDING,
        channel: "totem",
        recallCount: 0,
        createdAt: minutesAgo(6),
        calledAt: minutesAgo(4),
        attendingAt: minutesAgo(2),
        terminalId: terminalPami.id,
      },
      {
        id: "turn-7",
        memberNumber: 98123,
        queueId: queuePamiPrioritaria.id,
        queuedAt: minutesAgo(1),
        status: TurnStatus.WAITING,
        channel: "totem",
        recallCount: 1,
        createdAt: minutesAgo(9),
        lastRequeueAt: minutesAgo(1),
      },
      {
        id: "turn-8",
        memberNumber: 35590,
        queueId: queuePami.id,
        queuedAt: minutesAgo(15),
        status: TurnStatus.FINISHED,
        channel: "totem",
        recallCount: 0,
        createdAt: minutesAgo(15),
        calledAt: minutesAgo(12),
        attendingAt: minutesAgo(10),
        finishedAt: minutesAgo(4),
        terminalId: terminalPami.id,
      },
    ];

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
