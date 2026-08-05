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

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
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

import type { Turn, Sector, Queue, Terminal } from "shared";

// Turn API
export async function createTurn(
  queueId: string,
  memberId: string,
  channel: "totem" | "whatsapp" | "mobile" = "totem"
): Promise<Turn> {
  return callFunction<Turn>("createTurn", "POST", {
    queueId,
    memberId,
    channel,
  });
}

export async function getCurrentTurn(memberId: string): Promise<Turn> {
  return callFunction<Turn>("getCurrentTurn", "GET", undefined, { memberId });
}

export async function cancelTurn(turnId: string): Promise<void> {
  return callFunction<void>("cancelTurn", "POST", { turnId });
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

// Admin API
export async function getQueueStats(queueId: string) {
  return callFunction("getQueueStats", "GET", undefined, { queueId });
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
