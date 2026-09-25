import {onRequest} from "firebase-functions/v2/https";
import {UserRole} from "shared";
import {
  createAppointmentService, listAppointmentServices, updateAppointmentService,
  createAppointmentBlock, listAppointmentBlocks, deleteAppointmentBlock, previewAppointmentBlockImpact,
} from "../services/appointmentConfigService";
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

// ─── Appointment Services ───

export const createAppointmentServiceHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await createAppointmentService(req.body);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const listAppointmentServicesHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await listAppointmentServices();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const updateAppointmentServiceHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "PUT") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {serviceId} = req.query;
    if (!serviceId || typeof serviceId !== "string") {
      res.status(400).json({error: "serviceId query parameter is required"}); return;
    }
    const result = await updateAppointmentService(serviceId, req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

// ─── Appointment Blocks ───

export const createAppointmentBlockHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await createAppointmentBlock(req.body);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const listAppointmentBlocksHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const result = await listAppointmentBlocks();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));

export const deleteAppointmentBlockHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "DELETE") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {blockId} = req.query;
    if (!blockId || typeof blockId !== "string") {
      res.status(400).json({error: "blockId query parameter is required"}); return;
    }
    await deleteAppointmentBlock(blockId);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
}));

export const previewAppointmentBlockImpactHandler = onRequest({cors: true, invoker: "public"}, requireRole([UserRole.ADMIN], async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {serviceId, date, startTime, endTime} = req.query;
    if (!date || typeof date !== "string") {
      res.status(400).json({error: "date query parameter is required"}); return;
    }
    const result = await previewAppointmentBlockImpact({
      serviceId: typeof serviceId === "string" ? serviceId : null,
      date,
      startTime: typeof startTime === "string" ? startTime : undefined,
      endTime: typeof endTime === "string" ? endTime : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
}));
