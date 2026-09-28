import {Turn, TurnStatus} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError, ValidationError} from "../utils/errors";
import {toMillis} from "../utils/dates";

const ARGENTINA_OFFSET = -3 * 60; // UTC-3 in minutes

// Firestore's "in" operator caps at 30 values (same cap noted in
// adminService.ts's deleteSector / terminalService.ts's reassignTerminalQueues).
const MAX_SECTOR_QUEUE_IDS = 30;

function getTodayMidnightInArgentina(): Date {
  const now = new Date();
  const localDate = new Date(now.getTime() + (ARGENTINA_OFFSET + now.getTimezoneOffset()) * 60000);
  const midnight = new Date(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate(),
    0,
    0,
    0,
    0
  );
  return new Date(midnight.getTime() - (ARGENTINA_OFFSET + now.getTimezoneOffset()) * 60000);
}

export interface TurnAggregate {
  totalCreated: number;
  waitingCount: number;
  calledCount: number;
  attendingCount: number;
  finishedCount: number;
  noShowCount: number;
  cancelledCount: number;
  totalWaitTimeSeconds: number;
  totalServiceTimeSeconds: number;
}

function incrementStatusCount(aggregate: TurnAggregate, status: TurnStatus): void {
  switch (status) {
  case TurnStatus.WAITING: aggregate.waitingCount++; break;
  case TurnStatus.CALLED: aggregate.calledCount++; break;
  case TurnStatus.ATTENDING: aggregate.attendingCount++; break;
  case TurnStatus.FINISHED: aggregate.finishedCount++; break;
  case TurnStatus.NO_SHOW: aggregate.noShowCount++; break;
  case TurnStatus.CANCELLED: aggregate.cancelledCount++; break;
  }
}

// Pure reducer: counts by status + summed wait/service time (seconds). No
// averaging here — callers derive averages with avgSeconds(), so this same
// shape can be persisted (Phase 2 rollup) without losing precision to
// pre-divided numbers.
export function aggregateTurns(turns: Turn[]): TurnAggregate {
  const aggregate: TurnAggregate = {
    totalCreated: turns.length,
    waitingCount: 0,
    calledCount: 0,
    attendingCount: 0,
    finishedCount: 0,
    noShowCount: 0,
    cancelledCount: 0,
    totalWaitTimeSeconds: 0,
    totalServiceTimeSeconds: 0,
  };

  for (const turn of turns) {
    incrementStatusCount(aggregate, turn.status);
    if (turn.status !== TurnStatus.FINISHED) continue;

    if (turn.calledAt && turn.createdAt) {
      aggregate.totalWaitTimeSeconds += (toMillis(turn.calledAt) - toMillis(turn.createdAt)) / 1000;
    }
    if (turn.attendingAt && turn.finishedAt) {
      aggregate.totalServiceTimeSeconds += (toMillis(turn.finishedAt) - toMillis(turn.attendingAt)) / 1000;
    }
  }

  return aggregate;
}

// null (not 0) when count is 0 — 0 would misleadingly imply instant service.
export function avgSeconds(totalSeconds: number, count: number): number | null {
  return count > 0 ? Math.round(totalSeconds / count) : null;
}

export interface StatsSummary {
  totalCreated: number;
  waitingCount: number;
  calledCount: number;
  attendingCount: number;
  finishedCount: number;
  noShowCount: number;
  cancelledCount: number;
  avgWaitTimeSeconds: number | null;
  avgServiceTimeSeconds: number | null;
}

function toStatsSummary(aggregate: TurnAggregate): StatsSummary {
  return {
    totalCreated: aggregate.totalCreated,
    waitingCount: aggregate.waitingCount,
    calledCount: aggregate.calledCount,
    attendingCount: aggregate.attendingCount,
    finishedCount: aggregate.finishedCount,
    noShowCount: aggregate.noShowCount,
    cancelledCount: aggregate.cancelledCount,
    avgWaitTimeSeconds: avgSeconds(aggregate.totalWaitTimeSeconds, aggregate.finishedCount),
    avgServiceTimeSeconds: avgSeconds(aggregate.totalServiceTimeSeconds, aggregate.finishedCount),
  };
}

export interface TerminalAggregate {
  terminalId: string;
  finishedCount: number;
  avgServiceTimeSeconds: number | null;
}

// Turns with no terminalId (never called) are excluded, not counted as a
// phantom "unknown terminal".
export function aggregateByTerminal(turns: Turn[]): TerminalAggregate[] {
  const turnsByTerminal = new Map<string, Turn[]>();
  for (const turn of turns) {
    if (!turn.terminalId) continue;
    const group = turnsByTerminal.get(turn.terminalId) ?? [];
    group.push(turn);
    turnsByTerminal.set(turn.terminalId, group);
  }

  return Array.from(turnsByTerminal.entries()).map(([terminalId, terminalTurns]) => {
    const {finishedCount, totalServiceTimeSeconds} = aggregateTurns(terminalTurns);
    return {
      terminalId,
      finishedCount,
      avgServiceTimeSeconds: avgSeconds(totalServiceTimeSeconds, finishedCount),
    };
  });
}

async function fetchTodayTurns(queueId: string): Promise<Turn[]> {
  const today = getTodayMidnightInArgentina();
  const turnsSnap = await db
    .collection("turns")
    .where("queueId", "==", queueId)
    .where("createdAt", ">=", today)
    .get();
  return turnsSnap.docs.map((doc) => doc.data() as Turn);
}

export interface QueueStats extends Omit<StatsSummary, "totalCreated"> {
  queueId: string;
  totalTodayCreated: number;
}

export async function getQueueStats(queueId: string): Promise<QueueStats> {
  const queueDoc = await db.collection("queues").doc(queueId).get();
  if (!queueDoc.exists) {
    throw new NotFoundError(`Queue ${queueId} not found`);
  }

  const turns = await fetchTodayTurns(queueId);
  const {totalCreated, ...summary} = toStatsSummary(aggregateTurns(turns));

  return {queueId, totalTodayCreated: totalCreated, ...summary};
}

export interface SectorStats {
  sectorId: string;
  today: StatsSummary;
  queues: Array<{queueId: string} & StatsSummary>;
}

export async function getSectorStats(sectorId: string): Promise<SectorStats> {
  const sectorDoc = await db.collection("sectors").doc(sectorId).get();
  if (!sectorDoc.exists) {
    throw new NotFoundError(`Sector ${sectorId} not found`);
  }

  const queuesSnap = await db.collection("queues").where("sectorId", "==", sectorId).get();
  const queueIds = queuesSnap.docs.map((doc) => doc.id);

  if (queueIds.length === 0) {
    return {sectorId, today: toStatsSummary(aggregateTurns([])), queues: []};
  }
  if (queueIds.length > MAX_SECTOR_QUEUE_IDS) {
    throw new ValidationError(`Sector ${sectorId} has more than ${MAX_SECTOR_QUEUE_IDS} queues; stats query cannot batch yet`);
  }

  const today = getTodayMidnightInArgentina();
  const turnsSnap = await db
    .collection("turns")
    .where("queueId", "in", queueIds)
    .where("createdAt", ">=", today)
    .get();
  const turns = turnsSnap.docs.map((doc) => doc.data() as Turn);

  const turnsByQueue = new Map<string, Turn[]>(queueIds.map((queueId) => [queueId, [] as Turn[]]));
  for (const turn of turns) {
    turnsByQueue.get(turn.queueId)?.push(turn);
  }

  const queues = queueIds.map((queueId) => ({
    queueId,
    ...toStatsSummary(aggregateTurns(turnsByQueue.get(queueId) ?? [])),
  }));

  return {
    sectorId,
    today: toStatsSummary(aggregateTurns(turns)),
    queues,
  };
}

export interface TerminalStatsBreakdown {
  queueId: string;
  terminals: TerminalAggregate[];
}

export async function getTerminalStatsForQueue(queueId: string): Promise<TerminalStatsBreakdown> {
  const queueDoc = await db.collection("queues").doc(queueId).get();
  if (!queueDoc.exists) {
    throw new NotFoundError(`Queue ${queueId} not found`);
  }

  const turns = await fetchTodayTurns(queueId);
  return {queueId, terminals: aggregateByTerminal(turns)};
}
