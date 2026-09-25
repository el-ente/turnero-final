import {
  Appointment, AppointmentStatus, ACTIVE_APPOINTMENT_STATUSES,
  AppointmentService as AppointmentServiceModel, AppointmentBlock,
} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError, ConflictError, ValidationError, ForbiddenError} from "../utils/errors";
import {isPastInArgentina} from "../utils/argentinaTime";
import {computeCandidateSlots, applyBlocks, subtractCounts, slotKey, SlotAvailability} from "./appointmentAvailability";

async function getActiveServiceOrThrow(serviceId: string): Promise<AppointmentServiceModel> {
  const doc = await db.collection("appointmentServices").doc(serviceId).get();
  if (!doc.exists) throw new NotFoundError(`Appointment service ${serviceId} not found`);
  const service = doc.data() as AppointmentServiceModel;
  if (!service.active) throw new ConflictError(`Appointment service ${serviceId} is not active`);
  return service;
}

// Blocks are queried by date only (single-field range, no composite index
// needed) and matched in memory against serviceId/global — simpler than
// running two queries for "this service" and "all services".
function blockCovers(block: AppointmentBlock, serviceId: string, startTime: string): boolean {
  if (block.serviceId !== null && block.serviceId !== serviceId) return false;
  if (!block.startTime || !block.endTime) return true; // sin horario = todo el día
  return startTime >= block.startTime && startTime < block.endTime;
}

export async function getAvailableSlots(
  serviceId: string,
  dateFrom: string,
  dateTo: string
): Promise<SlotAvailability[]> {
  if (!serviceId || !dateFrom || !dateTo) {
    throw new ValidationError("serviceId, dateFrom and dateTo are required");
  }

  const service = await getActiveServiceOrThrow(serviceId);
  const candidates = computeCandidateSlots(service.availabilityRules, service.durationMinutes, dateFrom, dateTo);

  const blocksSnap = await db.collection("appointmentBlocks")
    .where("date", ">=", dateFrom).where("date", "<=", dateTo).get();
  const blocks = blocksSnap.docs.map((d) => d.data() as AppointmentBlock);

  const open = applyBlocks(candidates, blocks.filter((b) => b.serviceId === null || b.serviceId === serviceId))
    .filter((slot) => !isPastInArgentina(slot.date, slot.startTime));

  const activeSnap = await db.collection("appointments")
    .where("serviceId", "==", serviceId)
    .where("date", ">=", dateFrom).where("date", "<=", dateTo)
    .where("status", "in", ACTIVE_APPOINTMENT_STATUSES)
    .get();

  const countsByDateTime: Record<string, number> = {};
  for (const doc of activeSnap.docs) {
    const appt = doc.data() as Appointment;
    const key = slotKey({date: appt.date, startTime: appt.startTime});
    countsByDateTime[key] = (countsByDateTime[key] || 0) + 1;
  }

  return subtractCounts(open, service.capacityPerSlot, countsByDateTime);
}

export async function createAppointment(data: {
  serviceId: string;
  date: string;
  startTime: string;
  memberNumber: number;
  contactName: string;
  contact?: string;
}): Promise<Appointment> {
  const {serviceId, date, startTime, memberNumber, contactName, contact} = data;
  if (!serviceId || !date || !startTime || !contactName) {
    throw new ValidationError("serviceId, date, startTime and contactName are required");
  }
  if (!Number.isInteger(memberNumber) || memberNumber < 1 || memberNumber > 99999) {
    throw new ValidationError("memberNumber must be an integer between 1 and 99999");
  }
  if (isPastInArgentina(date, startTime)) {
    throw new ConflictError("Cannot book a slot in the past");
  }

  return db.runTransaction(async (transaction) => {
    const serviceRef = db.collection("appointmentServices").doc(serviceId);
    const serviceDoc = await transaction.get(serviceRef);
    if (!serviceDoc.exists) throw new NotFoundError(`Appointment service ${serviceId} not found`);
    const service = serviceDoc.data() as AppointmentServiceModel;
    if (!service.active) throw new ConflictError(`Appointment service ${serviceId} is not active`);

    const candidates = computeCandidateSlots(service.availabilityRules, service.durationMinutes, date, date);
    if (!candidates.some((c) => c.startTime === startTime)) {
      throw new ValidationError("Requested slot is not offered by this service");
    }

    const blocksSnap = await transaction.get(db.collection("appointmentBlocks").where("date", "==", date));
    const blocked = blocksSnap.docs.some((d) => blockCovers(d.data() as AppointmentBlock, serviceId, startTime));
    if (blocked) throw new ConflictError("Requested slot is blocked");

    const capacitySnap = await transaction.get(
      db.collection("appointments")
        .where("serviceId", "==", serviceId)
        .where("date", "==", date)
        .where("startTime", "==", startTime)
        .where("status", "in", ACTIVE_APPOINTMENT_STATUSES)
    );
    if (capacitySnap.size >= service.capacityPerSlot) {
      throw new ConflictError("Requested slot is full");
    }

    const duplicateSnap = await transaction.get(
      db.collection("appointments")
        .where("serviceId", "==", serviceId)
        .where("memberNumber", "==", memberNumber)
        .where("status", "in", ACTIVE_APPOINTMENT_STATUSES)
    );
    if (!duplicateSnap.empty) {
      throw new ConflictError("This member number already has an active appointment for this service");
    }

    const ref = db.collection("appointments").doc();
    const appointment: Appointment = {
      id: ref.id,
      serviceId,
      date,
      startTime,
      memberNumber,
      contactName,
      contact,
      status: AppointmentStatus.RESERVADA,
      recallCount: 0,
      createdAt: new Date(),
    };
    transaction.set(ref, appointment);
    return appointment;
  });
}

export async function getAppointment(appointmentId: string, memberNumber: number): Promise<Appointment> {
  if (!Number.isInteger(memberNumber)) throw new ValidationError("memberNumber must be an integer");
  const doc = await db.collection("appointments").doc(appointmentId).get();
  if (!doc.exists) throw new NotFoundError(`Appointment ${appointmentId} not found`);
  const appointment = doc.data() as Appointment;
  if (appointment.memberNumber !== memberNumber) {
    throw new ForbiddenError("memberNumber does not match this appointment");
  }
  return appointment;
}

export async function cancelAppointment(appointmentId: string, memberNumber: number): Promise<void> {
  if (!Number.isInteger(memberNumber)) throw new ValidationError("memberNumber must be an integer");

  await db.runTransaction(async (transaction) => {
    const ref = db.collection("appointments").doc(appointmentId);
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new NotFoundError(`Appointment ${appointmentId} not found`);

    const appointment = doc.data() as Appointment;
    if (appointment.memberNumber !== memberNumber) {
      throw new ForbiddenError("memberNumber does not match this appointment");
    }
    if (appointment.status !== AppointmentStatus.RESERVADA) {
      throw new ConflictError(`Appointment is not in RESERVADA status (current: ${appointment.status})`);
    }

    transaction.update(ref, {status: AppointmentStatus.CANCELADA, cancelledAt: new Date()});
  });
}

export async function rescheduleAppointment(
  appointmentId: string,
  memberNumber: number,
  newDate: string,
  newStartTime: string
): Promise<Appointment> {
  if (!Number.isInteger(memberNumber)) throw new ValidationError("memberNumber must be an integer");
  if (!newDate || !newStartTime) throw new ValidationError("newDate and newStartTime are required");
  if (isPastInArgentina(newDate, newStartTime)) throw new ConflictError("Cannot reschedule to a slot in the past");

  return db.runTransaction(async (transaction) => {
    const ref = db.collection("appointments").doc(appointmentId);
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new NotFoundError(`Appointment ${appointmentId} not found`);

    const appointment = doc.data() as Appointment;
    if (appointment.memberNumber !== memberNumber) {
      throw new ForbiddenError("memberNumber does not match this appointment");
    }
    if (appointment.status !== AppointmentStatus.RESERVADA) {
      throw new ConflictError(`Appointment is not in RESERVADA status (current: ${appointment.status})`);
    }

    // No-op reschedule to the same slot — skip re-validation so it can't
    // spuriously fail "slot full" by counting the appointment against itself.
    if (appointment.date === newDate && appointment.startTime === newStartTime) {
      return appointment;
    }

    const serviceDoc = await transaction.get(db.collection("appointmentServices").doc(appointment.serviceId));
    if (!serviceDoc.exists) throw new NotFoundError(`Appointment service ${appointment.serviceId} not found`);
    const service = serviceDoc.data() as AppointmentServiceModel;
    if (!service.active) throw new ConflictError(`Appointment service ${appointment.serviceId} is not active`);

    const candidates = computeCandidateSlots(service.availabilityRules, service.durationMinutes, newDate, newDate);
    if (!candidates.some((c) => c.startTime === newStartTime)) {
      throw new ValidationError("Requested slot is not offered by this service");
    }

    const blocksSnap = await transaction.get(db.collection("appointmentBlocks").where("date", "==", newDate));
    const blocked = blocksSnap.docs.some(
      (d) => blockCovers(d.data() as AppointmentBlock, appointment.serviceId, newStartTime)
    );
    if (blocked) throw new ConflictError("Requested slot is blocked");

    const capacitySnap = await transaction.get(
      db.collection("appointments")
        .where("serviceId", "==", appointment.serviceId)
        .where("date", "==", newDate)
        .where("startTime", "==", newStartTime)
        .where("status", "in", ACTIVE_APPOINTMENT_STATUSES)
    );
    if (capacitySnap.size >= service.capacityPerSlot) {
      throw new ConflictError("Requested slot is full");
    }

    transaction.update(ref, {date: newDate, startTime: newStartTime});
    return {...appointment, date: newDate, startTime: newStartTime};
  });
}
