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
  method: "GET" | "POST" | "PUT" = "POST",
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

  return (await response.json()) as T;
}

// Turn API
export async function createTurn(
  queueId: string,
  memberId: string,
  channel: "totem" | "whatsapp" | "mobile" = "totem"
) {
  return callFunction("createTurn", "POST", {
    queueId,
    memberId,
    channel,
  });
}

export async function getCurrentTurn(memberId: string) {
  return callFunction("getCurrentTurn", "GET", undefined, { memberId });
}

// Terminal API
export async function getNextTurn(terminalId: string) {
  return callFunction("nextTurn", "POST", { terminalId });
}

export async function callTurn(terminalId: string, turnId: string) {
  return callFunction("callTurn", "POST", { terminalId, turnId });
}

export async function startTurn(terminalId: string, turnId: string) {
  return callFunction("startTurn", "POST", { terminalId, turnId });
}

export async function finishTurn(terminalId: string, turnId: string) {
  return callFunction("finishTurn", "POST", { terminalId, turnId });
}

export async function recallTurn(terminalId: string, turnId: string) {
  return callFunction("recallTurn", "POST", { terminalId, turnId });
}

export async function noShowTurn(terminalId: string, turnId: string) {
  return callFunction("noShow", "POST", { terminalId, turnId });
}

// Admin API
export async function getQueueStats(queueId: string) {
  return callFunction("getQueueStats", "GET", undefined, { queueId });
}

export async function updateQueueConfig(queueId: string, config: any) {
  return callFunction("updateQueueConfig", "PUT", config, { queueId });
}
