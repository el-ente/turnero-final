import {onRequest} from "firebase-functions/v2/https";
import {UserRole} from "shared";
import {
  callAppointment, recallAppointment, startAppointment, finishAppointment, noShowAppointment,
  getAppointmentsByDate,
} from "../services/appointmentStaffService";
import {BusinessError} from "../utils/errors";
import {logger} from "../config/firebase-admin";
import {requireRole} from "../middleware/auth";

const STAFF_ROLES = [UserRole.CASHIER, UserRole.SUPERVISOR, UserRole.ADMIN];

export const callAppointmentHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {appointmentId} = req.body;
    if (!appointmentId) {
      res.status(400).json({error: "appointmentId is required"});
      return;
    }

    const appointment = await callAppointment(appointmentId);
    res.status(200).json(appointment);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error calling appointment:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const recallAppointmentHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {appointmentId} = req.body;
    if (!appointmentId) {
      res.status(400).json({error: "appointmentId is required"});
      return;
    }

    const appointment = await recallAppointment(appointmentId);
    res.status(200).json(appointment);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error recalling appointment:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const startAppointmentHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {appointmentId} = req.body;
    if (!appointmentId) {
      res.status(400).json({error: "appointmentId is required"});
      return;
    }

    const appointment = await startAppointment(appointmentId);
    res.status(200).json(appointment);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error starting appointment:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const finishAppointmentHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {appointmentId} = req.body;
    if (!appointmentId) {
      res.status(400).json({error: "appointmentId is required"});
      return;
    }

    const appointment = await finishAppointment(appointmentId);
    res.status(200).json(appointment);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error finishing appointment:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const noShowAppointmentHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {appointmentId} = req.body;
    if (!appointmentId) {
      res.status(400).json({error: "appointmentId is required"});
      return;
    }

    const appointment = await noShowAppointment(appointmentId);
    res.status(200).json(appointment);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error marking appointment as no-show:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const getAppointmentsByDateHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {date, serviceId} = req.query;
    if (!date || typeof date !== "string") {
      res.status(400).json({error: "date query parameter is required"});
      return;
    }
    if (serviceId !== undefined && typeof serviceId !== "string") {
      res.status(400).json({error: "serviceId query parameter must be a string"});
      return;
    }

    const appointments = await getAppointmentsByDate(date, serviceId);
    res.status(200).json(appointments);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error listing appointments by date:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));
