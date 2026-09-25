// Same offset/shifting technique as statsService.ts's getTodayMidnightInArgentina —
// kept as its own small helper here (not imported from statsService) so this
// module stays independent, per the Agenda feature's independence decision.
const ARGENTINA_OFFSET = -3 * 60; // UTC-3 in minutes

function nowShiftedToArgentina(): Date {
  const now = new Date();
  return new Date(now.getTime() + (ARGENTINA_OFFSET + now.getTimezoneOffset()) * 60000);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayInArgentina(): string {
  return formatDate(nowShiftedToArgentina());
}

// dateStr is a plain "YYYY-MM-DD" calendar date — parsed as UTC noon so the
// result is independent of the machine's local timezone.
export function dayOfWeekInArgentina(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function isPastInArgentina(date: string, startTime: string): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = startTime.split(":").map(Number);
  const target = new Date(year, month - 1, day, hours, minutes);
  return target.getTime() < nowShiftedToArgentina().getTime();
}
