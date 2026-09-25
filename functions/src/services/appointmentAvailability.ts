import {AvailabilityRule, AppointmentBlock} from "shared";
import {dayOfWeekInArgentina} from "../utils/argentinaTime";

// Pure date/slot math, deliberately free of Firestore — easy to unit test
// without mocking anything. appointmentService.ts wraps this with the
// Firestore reads (blocks, existing appointment counts) it needs.

export interface CandidateSlot {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
}

export interface SlotAvailability extends CandidateSlot {
  remainingCapacity: number;
}

export function slotKey(slot: CandidateSlot): string {
  return `${slot.date}T${slot.startTime}`;
}

export function computeCandidateSlots(
  rules: AvailabilityRule[],
  durationMinutes: number,
  dateFrom: string,
  dateTo: string
): CandidateSlot[] {
  const slots: CandidateSlot[] = [];
  for (const date of eachDate(dateFrom, dateTo)) {
    const dow = dayOfWeekInArgentina(date);
    for (const rule of rules) {
      if (!rule.daysOfWeek.includes(dow)) continue;
      for (const startTime of timesInRange(rule.startTime, rule.endTime, durationMinutes)) {
        slots.push({date, startTime});
      }
    }
  }
  return slots;
}

export function applyBlocks(candidates: CandidateSlot[], blocks: AppointmentBlock[]): CandidateSlot[] {
  return candidates.filter((slot) => !blocks.some((block) => blockCovers(block, slot)));
}

export function subtractCounts(
  candidates: CandidateSlot[],
  capacityPerSlot: number,
  countsByDateTime: Record<string, number>
): SlotAvailability[] {
  return candidates
    .map((slot) => ({
      ...slot,
      remainingCapacity: capacityPerSlot - (countsByDateTime[slotKey(slot)] ?? 0),
    }))
    .filter((slot) => slot.remainingCapacity > 0);
}

function blockCovers(block: AppointmentBlock, slot: CandidateSlot): boolean {
  if (block.date !== slot.date) return false;
  if (!block.startTime || !block.endTime) return true; // sin horario = todo el día
  return slot.startTime >= block.startTime && slot.startTime < block.endTime;
}

function eachDate(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate()
  ).padStart(2, "0")}`;
}

function timesInRange(startTime: string, endTime: string, stepMinutes: number): string[] {
  const times: string[] = [];
  let minutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  while (minutes + stepMinutes <= endMinutes) {
    times.push(fromMinutes(minutes));
    minutes += stepMinutes;
  }
  return times;
}

function toMinutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function fromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
