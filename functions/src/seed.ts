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
// Shares the app's Firestore handle so the seed can reuse services; the
// emulator target and project id come from FIRESTORE_EMULATOR_HOST /
// GCLOUD_PROJECT set by the `seed:emulator` script.
import {db} from "./config/firebase-admin";
import {backfillDailyStats} from "./services/dailyStatsService";
import {lastDatesEndingYesterday, argentinaMidnightRangeFor, dayOfWeekInArgentina} from "./utils/argentinaTime";

const HISTORY_DAYS = 14;
const SUNDAY = 0;
const PRIORITY_QUEUE_SHARE = 0.4;
const FIRESTORE_BATCH_LIMIT = 400;
// Typical arrivals per hour for a regular queue: a late-morning peak and a
// smaller one mid-afternoon, so the hourly heatmap has something to say.
const ARRIVALS_PER_HOUR: Record<number, number> = {8: 2, 9: 4, 10: 7, 11: 8, 12: 5, 13: 3, 14: 3, 15: 5, 16: 6, 17: 3};

// Deterministic PRNG (mulberry32) so every seed run yields the same history.
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function writeInBatches<T extends {id: string}>(collection: string, docs: T[]): Promise<void> {
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    docs.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((doc) => batch.set(db.collection(collection).doc(doc.id), doc));
    await batch.commit();
  }
}

async function clearCollection(collection: string): Promise<void> {
  const snapshot = await db.collection(collection).get();
  for (let i = 0; i < snapshot.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

function historicalTurnsForHour(
  queue: Queue, terminalId: string, date: string, hour: number, random: () => number, nextMember: () => number
): Turn[] {
  const load = ARRIVALS_PER_HOUR[hour] * (queue.type === QueueType.PRIORITY ? PRIORITY_QUEUE_SHARE : 1);
  const count = Math.round(load * (0.7 + random() * 0.6));
  const hourStart = argentinaMidnightRangeFor(date).start.getTime() + hour * 3600000;

  return Array.from({length: count}, (_, i) => {
    const createdAt = new Date(hourStart + Math.floor(random() * 60) * 60000);
    const waitMinutes = 2 + load * 1.5 + random() * 4;
    const serviceMinutes = 4 + random() * 6;
    const calledAt = new Date(createdAt.getTime() + waitMinutes * 60000);
    const attendingAt = new Date(calledAt.getTime() + 30000);
    return {
      id: `hist-${queue.id}-${date}-${hour}-${i}`,
      memberNumber: nextMember(),
      queueId: queue.id,
      queuedAt: createdAt,
      status: TurnStatus.FINISHED,
      channel: "totem",
      recallCount: 0,
      createdAt,
      calledAt,
      attendingAt,
      finishedAt: new Date(attendingAt.getTime() + serviceMinutes * 60000),
      terminalId,
    };
  });
}

// Finished turns spread over the last HISTORY_DAYS (no Sundays), one
// realistic day per queue, so Admin → Estadísticas → "Por franja horaria"
// shows a peak instead of an empty grid on a fresh emulator.
function buildHistoricalTurns(queues: Queue[], terminals: Terminal[]): Turn[] {
  const random = createRandom(2026);
  let member = 50000;
  const nextMember = () => member++;
  const turns: Turn[] = [];

  for (const date of lastDatesEndingYesterday(HISTORY_DAYS)) {
    if (dayOfWeekInArgentina(date) === SUNDAY) continue;
    for (const queue of queues) {
      const terminal = terminals.find((t) => t.sectorIds.includes(queue.sectorId));
      if (!terminal) continue;
      for (const hour of Object.keys(ARRIVALS_PER_HOUR).map(Number)) {
        turns.push(...historicalTurnsForHour(queue, terminal.id, date, hour, random, nextMember));
      }
    }
  }
  return turns;
}

async function seed() {
  console.log("Seeding Firestore...");

  try {
    // Clear existing data
    const collections = ["sectors", "queues", "terminals", "turns", "queueDailyStats"];
    for (const col of collections) {
      await clearCollection(col);
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
        recallCount: 0,
        requeueCount: 1,
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

    // 5. Historical finished turns + their daily rollups (hourly heatmap data).
    const historicalTurns = buildHistoricalTurns(queues, terminals);
    await writeInBatches("turns", historicalTurns);
    console.log(`Created ${historicalTurns.length} historical turns over ${HISTORY_DAYS} days`);

    const rollup = await backfillDailyStats(HISTORY_DAYS);
    console.log(`Rolled up ${rollup.processed} queue-days (${rollup.failed.length} failed)`);

    console.log("✓ Seed completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
}

seed();
