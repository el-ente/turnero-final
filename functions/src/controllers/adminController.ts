import {onRequest} from "firebase-functions/v2/https";
import {UserRole} from "shared";
import {getQueueStats, getSectorStats, getTerminalStatsForQueue} from "../services/statsService";
import {getQueueDailyStatsRange, backfillDailyStats} from "../services/dailyStatsService";
import {getHourlyStats} from "../services/hourlyStatsService";
import {
  createSector, listSectors, updateSector, deleteSector,
  createQueue, listQueues, updateQueue, deleteQueue,
  createTerminal, listTerminals, updateTerminal, deleteTerminal,
} from "../services/adminService";
import {BusinessError} from "../utils/errors";
import {logger} from "../config/firebase-admin";
import {requireRole} from "../middleware/auth";

const MAX_DAILY_STATS_DAYS = 90;
const DEFAULT_HOURLY_STATS_DAYS = 7;
const DEFAULT_BACKFILL_DAYS = 30;
const MAX_BACKFILL_DAYS = 365;

function parseDays(raw: unknown, fallback: number, max: number): number | null {
  const days = raw === undefined || raw === "" ? fallback : Number(raw);
  return Number.isInteger(days) && days >= 1 && days <= max ? days : null;
}

function handleError(res: any, error: unknown) {
  if (error instanceof BusinessError) {
    res.status(error.statusCode).json({error: error.message, code: error.code});
  } else {
    logger.error("Internal error:", error);
    res.status(500).json({error: "Internal server error"});
  }
}

// ─── Stats (existing) ───

export const getQueueStatsHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN, UserRole.SUPERVISOR], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {queueId} = req.query;
    if (!queueId || typeof queueId !== "string") {
      res.status(400).json({error: "queueId query parameter is required"}); return;
    }
    const stats = await getQueueStats(queueId);
    res.status(200).json(stats);
  } catch (error) {
    handleError(res, error);
  }
}));

export const getSectorStatsHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN, UserRole.SUPERVISOR], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {sectorId} = req.query;
    if (!sectorId || typeof sectorId !== "string") {
      res.status(400).json({error: "sectorId query parameter is required"}); return;
    }
    const stats = await getSectorStats(sectorId);
    res.status(200).json(stats);
  } catch (error) {
    handleError(res, error);
  }
}));

export const getTerminalStatsHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN, UserRole.SUPERVISOR], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {queueId} = req.query;
    if (!queueId || typeof queueId !== "string") {
      res.status(400).json({error: "queueId query parameter is required"}); return;
    }
    const stats = await getTerminalStatsForQueue(queueId);
    res.status(200).json(stats);
  } catch (error) {
    handleError(res, error);
  }
}));

export const getQueueDailyStatsHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN, UserRole.SUPERVISOR], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {queueIds, days} = req.query;
    if (!queueIds || typeof queueIds !== "string") {
      res.status(400).json({error: "queueIds query parameter is required"}); return;
    }
    const parsedDays = days ? Number(days) : 7;
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > MAX_DAILY_STATS_DAYS) {
      res.status(400).json({error: `days must be an integer between 1 and ${MAX_DAILY_STATS_DAYS}`}); return;
    }
    const results = await getQueueDailyStatsRange(queueIds.split(","), parsedDays);
    res.status(200).json({results});
  } catch (error) {
    handleError(res, error);
  }
}));

export const getHourlyStatsHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN, UserRole.SUPERVISOR], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {sectorId, queueId, days} = req.query;
    if (!sectorId || typeof sectorId !== "string") {
      res.status(400).json({error: "sectorId query parameter is required"}); return;
    }
    const parsedDays = parseDays(days, DEFAULT_HOURLY_STATS_DAYS, MAX_DAILY_STATS_DAYS);
    if (parsedDays === null) {
      res.status(400).json({error: `days must be an integer between 1 and ${MAX_DAILY_STATS_DAYS}`}); return;
    }
    const stats = await getHourlyStats(sectorId, parsedDays, typeof queueId === "string" && queueId ? queueId : null);
    res.status(200).json(stats);
  } catch (error) {
    handleError(res, error);
  }
}));

export const backfillDailyStatsHandler = onRequest({cors: true, invoker: "public", timeoutSeconds: 540}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const parsedDays = parseDays(req.body?.days, DEFAULT_BACKFILL_DAYS, MAX_BACKFILL_DAYS);
    if (parsedDays === null) {
      res.status(400).json({error: `days must be an integer between 1 and ${MAX_BACKFILL_DAYS}`}); return;
    }
    const result = await backfillDailyStats(parsedDays);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

// ─── Sectors ───

export const createSectorHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await createSector(req.body);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const listSectorsHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await listSectors();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const updateSectorHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "PUT") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {sectorId} = req.query;
    if (!sectorId || typeof sectorId !== "string") {
      res.status(400).json({error: "sectorId query parameter is required"}); return;
    }
    const result = await updateSector(sectorId, req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const deleteSectorHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "DELETE") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {sectorId} = req.query;
    if (!sectorId || typeof sectorId !== "string") {
      res.status(400).json({error: "sectorId query parameter is required"}); return;
    }
    await deleteSector(sectorId);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
}));

// ─── Queues ───

export const createQueueHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await createQueue(req.body);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const listQueuesHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await listQueues();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const updateQueueHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "PUT") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {queueId} = req.query;
    if (!queueId || typeof queueId !== "string") {
      res.status(400).json({error: "queueId query parameter is required"}); return;
    }
    const result = await updateQueue(queueId, req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const deleteQueueHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "DELETE") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {queueId} = req.query;
    if (!queueId || typeof queueId !== "string") {
      res.status(400).json({error: "queueId query parameter is required"}); return;
    }
    await deleteQueue(queueId);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
}));

// ─── Terminals ───

export const createTerminalHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await createTerminal(req.body);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const listTerminalsHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await listTerminals();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const updateTerminalHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "PUT") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {terminalId} = req.query;
    if (!terminalId || typeof terminalId !== "string") {
      res.status(400).json({error: "terminalId query parameter is required"}); return;
    }
    const result = await updateTerminal(terminalId, req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const deleteTerminalHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "DELETE") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {terminalId} = req.query;
    if (!terminalId || typeof terminalId !== "string") {
      res.status(400).json({error: "terminalId query parameter is required"}); return;
    }
    await deleteTerminal(terminalId);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
}));
