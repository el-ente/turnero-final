import { auth } from "./firebase";

// Base URL for Cloud Functions
// In development, this points to emulator (localhost:5001)
// In production, this points to deployed functions
const BASE_URL = import.meta.env.DEV
  ? `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/us-central1`
  : `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

export interface ApiError {
  error: string;
  code?: string;
  message?: string;
}

export async function callFunction<T>(
  functionName: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "POST",
  body?: unknown,
  queryParams?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE_URL}/${functionName}`);

  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Totem/Display reads (and the endpoints they call) stay unauthenticated;
  // every other call attaches the signed-in user's ID token if there is one.
  if (auth.currentUser) {
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), options);

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error || `API error: ${response.statusText}`);
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

import type { Turn, Sector, Queue, Terminal, AppUser, UserRole, UserStatus, Appointment, AppointmentService, AppointmentBlock } from "shared";

// Turn API
export async function createTurn(
  queueId: string,
  memberNumber: number,
  channel: "totem" | "whatsapp" | "mobile" = "totem"
): Promise<Turn> {
  return callFunction<Turn>("createTurn", "POST", {
    queueId,
    memberNumber,
    channel,
  });
}

export async function getCurrentTurn(memberNumber: number): Promise<Turn> {
  return callFunction<Turn>("getCurrentTurn", "GET", undefined, { memberNumber: String(memberNumber) });
}

export async function cancelTurn(turnId: string, memberNumber: number): Promise<void> {
  return callFunction<void>("cancelTurn", "POST", { turnId, memberNumber });
}

// Terminal API
export async function getNextTurn(terminalId: string): Promise<Turn | null> {
  return callFunction<Turn | null>("nextTurn", "POST", { terminalId });
}

export async function callTurn(terminalId: string, turnId: string): Promise<void> {
  return callFunction<void>("callTurn", "POST", { terminalId, turnId });
}

export async function startTurn(terminalId: string, turnId: string): Promise<void> {
  return callFunction<void>("startTurn", "POST", { terminalId, turnId });
}

export async function finishTurn(terminalId: string, turnId: string): Promise<void> {
  return callFunction<void>("finishTurn", "POST", { terminalId, turnId });
}

export async function recallTurn(terminalId: string, turnId: string): Promise<void> {
  return callFunction<void>("recallTurn", "POST", { terminalId, turnId });
}

export async function noShowTurn(terminalId: string, turnId: string): Promise<void> {
  return callFunction<void>("noShow", "POST", { terminalId, turnId });
}

export async function apiReassignTerminalQueues(terminalId: string, queueIds: string[]): Promise<Terminal> {
  return callFunction<Terminal>("reassignTerminalQueues", "POST", { terminalId, queueIds });
}

export async function apiSetTerminalStatus(terminalId: string, status: "available" | "offline"): Promise<void> {
  await callFunction<{ success: boolean }>("setTerminalStatus", "POST", { terminalId, status });
}

// Admin API
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

export interface SectorStats {
  sectorId: string;
  today: StatsSummary;
  queues: Array<{ queueId: string } & StatsSummary>;
}

export interface TerminalStatsBreakdown {
  queueId: string;
  terminals: Array<{ terminalId: string; turnCount: number; avgServiceTimeSeconds: number | null }>;
}

export async function getQueueStats(queueId: string) {
  return callFunction("getQueueStats", "GET", undefined, { queueId });
}

export async function getSectorStats(sectorId: string) {
  return callFunction<SectorStats>("getSectorStats", "GET", undefined, { sectorId });
}

export async function getTerminalStats(queueId: string) {
  return callFunction<TerminalStatsBreakdown>("getTerminalStats", "GET", undefined, { queueId });
}

// CRUD — Sectors
export async function apiCreateSector(data: { name: string; description?: string }) {
  return callFunction<Sector>("createSector", "POST", data);
}

export async function apiListSectors() {
  return callFunction<Sector[]>("listSectors", "GET");
}

export async function apiUpdateSector(sectorId: string, data: Partial<Sector>) {
  return callFunction<Sector>("updateSector", "PUT", data, { sectorId });
}

export async function apiDeleteSector(sectorId: string) {
  return callFunction<void>("deleteSector", "DELETE", undefined, { sectorId });
}

// CRUD — Queues
export async function apiCreateQueue(data: { name: string; sectorId: string; type: string; reenqueueConfig: any; priorityWeight?: number }) {
  return callFunction<Queue>("createQueue", "POST", data);
}

export async function apiListQueues() {
  return callFunction<Queue[]>("listQueues", "GET");
}

export async function apiUpdateQueue(queueId: string, data: Partial<Queue>) {
  return callFunction<Queue>("updateQueue", "PUT", data, { queueId });
}

export async function apiDeleteQueue(queueId: string) {
  return callFunction<void>("deleteQueue", "DELETE", undefined, { queueId });
}

// CRUD — Terminals
export async function apiCreateTerminal(data: { name: string; sectorIds: string[]; activeQueueIds: string[]; servingStrategy: string; strategyConfig: any }) {
  return callFunction<Terminal>("createTerminal", "POST", data);
}

export async function apiListTerminals() {
  return callFunction<Terminal[]>("listTerminals", "GET");
}

export async function apiUpdateTerminal(terminalId: string, data: Partial<Terminal>) {
  return callFunction<Terminal>("updateTerminal", "PUT", data, { terminalId });
}

export async function apiDeleteTerminal(terminalId: string) {
  return callFunction<void>("deleteTerminal", "DELETE", undefined, { terminalId });
}

// Users / auth
export async function apiBootstrapUser() {
  return callFunction<AppUser>("bootstrapUser", "POST");
}

export async function apiListUsers() {
  return callFunction<AppUser[]>("listUsers", "GET");
}

export async function apiInviteUser(data: { email: string; role: UserRole; assignedSectorIds?: string[] }) {
  return callFunction<AppUser>("inviteUser", "POST", data);
}

export async function apiUpdateUserRole(
  userId: string,
  data: { role?: UserRole; assignedSectorIds?: string[]; status?: UserStatus }
) {
  return callFunction<AppUser>("updateUserRole", "PUT", data, { userId });
}

export async function apiDeleteUser(userId: string) {
  return callFunction<void>("deleteUser", "DELETE", undefined, { userId });
}

// ─── Agenda (independent appointment-scheduling module) ───

export interface AppointmentSlot {
  date: string;
  startTime: string;
  remainingCapacity: number;
}

// Public — client booking / self-service
export async function getAvailableSlots(serviceId: string, dateFrom: string, dateTo: string) {
  return callFunction<AppointmentSlot[]>("getAvailableSlots", "GET", undefined, { serviceId, dateFrom, dateTo });
}

export async function createAppointment(data: {
  serviceId: string;
  date: string;
  startTime: string;
  memberNumber: number;
  contactName: string;
  contact?: string;
}) {
  return callFunction<Appointment>("createAppointment", "POST", data);
}

export async function getAppointment(appointmentId: string, memberNumber: number) {
  return callFunction<Appointment>("getAppointment", "GET", undefined, {
    appointmentId,
    memberNumber: String(memberNumber),
  });
}

export async function cancelAppointment(appointmentId: string, memberNumber: number) {
  return callFunction<void>("cancelAppointment", "POST", { appointmentId, memberNumber });
}

export async function rescheduleAppointment(
  appointmentId: string,
  memberNumber: number,
  newDate: string,
  newStartTime: string
) {
  return callFunction<Appointment>("rescheduleAppointment", "POST", { appointmentId, memberNumber, newDate, newStartTime });
}

// Staff — "Agenda del día"
export async function callAppointment(appointmentId: string) {
  return callFunction<Appointment>("callAppointment", "POST", { appointmentId });
}

export async function recallAppointment(appointmentId: string) {
  return callFunction<Appointment>("recallAppointment", "POST", { appointmentId });
}

export async function startAppointment(appointmentId: string) {
  return callFunction<Appointment>("startAppointment", "POST", { appointmentId });
}

export async function finishAppointment(appointmentId: string) {
  return callFunction<Appointment>("finishAppointment", "POST", { appointmentId });
}

export async function noShowAppointment(appointmentId: string) {
  return callFunction<Appointment>("noShowAppointment", "POST", { appointmentId });
}

export async function getAppointmentsByDate(date: string, serviceId?: string) {
  return callFunction<Appointment[]>(
    "getAppointmentsByDate",
    "GET",
    undefined,
    serviceId ? { date, serviceId } : { date }
  );
}

// Admin — Servicio / Bloqueo config
export async function apiCreateAppointmentService(data: {
  name: string;
  durationMinutes: number;
  capacityPerSlot: number;
  availabilityRules?: AppointmentService["availabilityRules"];
}) {
  return callFunction<AppointmentService>("createAppointmentService", "POST", data);
}

export async function apiListAppointmentServices() {
  return callFunction<AppointmentService[]>("listAppointmentServices", "GET");
}

export async function apiUpdateAppointmentService(serviceId: string, data: Partial<AppointmentService>) {
  return callFunction<AppointmentService>("updateAppointmentService", "PUT", data, { serviceId });
}

export async function apiCreateAppointmentBlock(data: {
  serviceId?: string | null;
  date: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}) {
  return callFunction<AppointmentBlock>("createAppointmentBlock", "POST", data);
}

export async function apiListAppointmentBlocks() {
  return callFunction<AppointmentBlock[]>("listAppointmentBlocks", "GET");
}

export async function apiDeleteAppointmentBlock(blockId: string) {
  return callFunction<void>("deleteAppointmentBlock", "DELETE", undefined, { blockId });
}

export async function apiPreviewAppointmentBlockImpact(params: {
  serviceId?: string | null;
  date: string;
  startTime?: string;
  endTime?: string;
}) {
  const query: Record<string, string> = { date: params.date };
  if (params.serviceId) query.serviceId = params.serviceId;
  if (params.startTime) query.startTime = params.startTime;
  if (params.endTime) query.endTime = params.endTime;
  return callFunction<{ count: number; appointments: Appointment[] }>(
    "previewAppointmentBlockImpact",
    "GET",
    undefined,
    query
  );
}
