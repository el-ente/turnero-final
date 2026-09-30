import {QueueDailyStats, HourlyBucket} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError, ValidationError} from "../utils/errors";
import {avgSeconds, MAX_SECTOR_QUEUE_IDS} from "./statsService";
import {lastDatesEndingYesterday, dayOfWeekInArgentina} from "../utils/argentinaTime";

const DAYS_PER_WEEK = 7;

export interface HourlyCell {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  hour: number; // 0-23, Argentina time
  created: number;
  finished: number;
  avgCreatedPerDay: number;
  avgWaitTimeSeconds: number | null;
  avgServiceTimeSeconds: number | null;
}

export interface HourlyStats {
  sectorId: string;
  queueId: string | null;
  days: number;
  from: string;
  to: string;
  datesCovered: number;
  firstDate: string | null;
  cells: HourlyCell[];
}

interface CellAccumulator extends HourlyBucket {
  dayOfWeek: number;
  hour: number;
}

function cellKey(dayOfWeek: number, hour: number): string {
  return `${dayOfWeek}-${hour}`;
}

function countDatesPerWeekday(dates: Set<string>): number[] {
  const counts = new Array<number>(DAYS_PER_WEEK).fill(0);
  for (const date of dates) counts[dayOfWeekInArgentina(date)]++;
  return counts;
}

function addRollupToCells(cells: Map<string, CellAccumulator>, rollup: QueueDailyStats): void {
  const dayOfWeek = dayOfWeekInArgentina(rollup.date);
  rollup.hourly.forEach((bucket, hour) => {
    if (bucket.created === 0) return;
    const key = cellKey(dayOfWeek, hour);
    const cell = cells.get(key) ?? {
      dayOfWeek, hour, created: 0, finished: 0, totalWaitTimeSeconds: 0, totalServiceTimeSeconds: 0,
    };
    cell.created += bucket.created;
    cell.finished += bucket.finished;
    cell.totalWaitTimeSeconds += bucket.totalWaitTimeSeconds;
    cell.totalServiceTimeSeconds += bucket.totalServiceTimeSeconds;
    cells.set(key, cell);
  });
}

function toHourlyCell(cell: CellAccumulator, daysSampled: number): HourlyCell {
  return {
    dayOfWeek: cell.dayOfWeek,
    hour: cell.hour,
    created: cell.created,
    finished: cell.finished,
    avgCreatedPerDay: Math.round((cell.created / daysSampled) * 10) / 10,
    avgWaitTimeSeconds: avgSeconds(cell.totalWaitTimeSeconds, cell.finished),
    avgServiceTimeSeconds: avgSeconds(cell.totalServiceTimeSeconds, cell.finished),
  };
}

// Rollups written before hourly buckets existed carry no `hourly`; they are
// skipped entirely (not counted as a covered date) rather than read as a day
// with zero arrivals, which would drag every average down.
export function aggregateRollupsByWeekdayHour(rollups: QueueDailyStats[]): { cells: HourlyCell[]; dates: string[] } {
  const usable = rollups.filter((rollup) => Array.isArray(rollup.hourly));
  const dates = new Set(usable.map((rollup) => rollup.date));
  const datesPerWeekday = countDatesPerWeekday(dates);

  const cells = new Map<string, CellAccumulator>();
  for (const rollup of usable) addRollupToCells(cells, rollup);

  const sorted = Array.from(cells.values()).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour);
  return {
    cells: sorted.map((cell) => toHourlyCell(cell, datesPerWeekday[cell.dayOfWeek])),
    dates: Array.from(dates).sort(),
  };
}

async function resolveQueueIds(sectorId: string, queueId: string | null): Promise<string[]> {
  const sectorDoc = await db.collection("sectors").doc(sectorId).get();
  if (!sectorDoc.exists) throw new NotFoundError(`Sector ${sectorId} not found`);

  const queuesSnap = await db.collection("queues").where("sectorId", "==", sectorId).get();
  const sectorQueueIds = queuesSnap.docs.map((doc) => doc.id);

  if (queueId) {
    if (!sectorQueueIds.includes(queueId)) throw new NotFoundError(`Queue ${queueId} not found in sector ${sectorId}`);
    return [queueId];
  }
  if (sectorQueueIds.length > MAX_SECTOR_QUEUE_IDS) {
    throw new ValidationError(`Sector ${sectorId} has more than ${MAX_SECTOR_QUEUE_IDS} queues; stats query cannot batch yet`);
  }
  return sectorQueueIds;
}

async function fetchRollupsBetween(queueIds: string[], from: string, to: string): Promise<QueueDailyStats[]> {
  if (queueIds.length === 0) return [];
  const snap = await db
    .collection("queueDailyStats")
    .where("queueId", "in", queueIds)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .get();
  return snap.docs.map((doc) => doc.data() as QueueDailyStats);
}

export async function getHourlyStats(sectorId: string, days: number, queueId: string | null): Promise<HourlyStats> {
  const queueIds = await resolveQueueIds(sectorId, queueId);
  const dates = lastDatesEndingYesterday(days);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const rollups = await fetchRollupsBetween(queueIds, from, to);
  const {cells, dates: coveredDates} = aggregateRollupsByWeekdayHour(rollups);

  return {
    sectorId,
    queueId,
    days,
    from,
    to,
    datesCovered: coveredDates.length,
    firstDate: coveredDates[0] ?? null,
    cells,
  };
}
