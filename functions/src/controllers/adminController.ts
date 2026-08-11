import {onRequest} from "firebase-functions/v2/https";
import {UserRole} from "shared";
import {getQueueStats} from "../services/statsService";
import {
  createSector, listSectors, updateSector, deleteSector,
  createQueue, listQueues, updateQueue, deleteQueue,
  createTerminal, listTerminals, updateTerminal, deleteTerminal,
} from "../services/adminService";
import {BusinessError} from "../utils/errors";
import {logger} from "../config/firebase-admin";
import {requireRole} from "../middleware/auth";

function handleError(res: any, error: unknown) {
  if (error instanceof BusinessError) {
    res.status(error.statusCode).json({error: error.message, code: error.code});
  } else {
    logger.error("Internal error:", error);
    res.status(500).json({error: "Internal server error"});
  }
}

// ─── Stats (existing) ───

export const getQueueStatsHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN, UserRole.SUPERVISOR], async (req, res) => {
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

// ─── Sectors ───

export const createSectorHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const listSectorsHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const updateSectorHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const deleteSectorHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const createQueueHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const listQueuesHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const updateQueueHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const deleteQueueHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const createTerminalHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const listTerminalsHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const updateTerminalHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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

export const deleteTerminalHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
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
