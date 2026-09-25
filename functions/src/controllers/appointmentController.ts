import {onRequest} from "firebase-functions/v2/https";
import {
  createAppointment, getAvailableSlots, getAppointment, cancelAppointment, rescheduleAppointment,
} from "../services/appointmentService";
import {BusinessError} from "../utils/errors";
import {logger} from "../config/firebase-admin";
import {checkRateLimit, getClientIp} from "../utils/rateLimit";

export const createAppointmentHandler = onRequest({cors: true}, async (req, res) => {
  try {
    await checkRateLimit(getClientIp(req));

    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {serviceId, date, startTime, memberNumber, contactName, contact} = req.body;

    if (!serviceId || !date || !startTime || !memberNumber || !contactName) {
      res.status(400).json({error: "serviceId, date, startTime, memberNumber and contactName are required"});
      return;
    }

    await checkRateLimit(`member:${memberNumber}`);

    const appointment = await createAppointment({serviceId, date, startTime, memberNumber, contactName, contact});
    res.status(201).json(appointment);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error creating appointment:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
});

export const getAvailableSlotsHandler = onRequest({cors: true}, async (req, res) => {
  try {
    await checkRateLimit(getClientIp(req));

    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {serviceId, dateFrom, dateTo} = req.query;
    if (!serviceId || !dateFrom || !dateTo ||
        typeof serviceId !== "string" || typeof dateFrom !== "string" || typeof dateTo !== "string") {
      res.status(400).json({error: "serviceId, dateFrom and dateTo query parameters are required"});
      return;
    }

    const slots = await getAvailableSlots(serviceId, dateFrom, dateTo);
    res.status(200).json(slots);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error getting available slots:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
});

export const getAppointmentHandler = onRequest({cors: true}, async (req, res) => {
  try {
    await checkRateLimit(getClientIp(req));

    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {appointmentId} = req.query;
    const memberNumber = Number(req.query.memberNumber);

    if (!appointmentId || typeof appointmentId !== "string" || !Number.isInteger(memberNumber)) {
      res.status(400).json({error: "appointmentId and memberNumber query parameters are required"});
      return;
    }

    const appointment = await getAppointment(appointmentId, memberNumber);
    res.status(200).json(appointment);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error getting appointment:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
});

export const cancelAppointmentHandler = onRequest({cors: true}, async (req, res) => {
  try {
    await checkRateLimit(getClientIp(req));

    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {appointmentId, memberNumber} = req.body;
    if (!appointmentId || !memberNumber) {
      res.status(400).json({error: "appointmentId and memberNumber are required"});
      return;
    }

    await checkRateLimit(`member:${memberNumber}`);

    await cancelAppointment(appointmentId, memberNumber);
    res.status(200).json({success: true});
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error cancelling appointment:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
});

export const rescheduleAppointmentHandler = onRequest({cors: true}, async (req, res) => {
  try {
    await checkRateLimit(getClientIp(req));

    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {appointmentId, memberNumber, newDate, newStartTime} = req.body;
    if (!appointmentId || !memberNumber || !newDate || !newStartTime) {
      res.status(400).json({error: "appointmentId, memberNumber, newDate and newStartTime are required"});
      return;
    }

    await checkRateLimit(`member:${memberNumber}`);

    const appointment = await rescheduleAppointment(appointmentId, memberNumber, newDate, newStartTime);
    res.status(200).json(appointment);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error rescheduling appointment:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
});
