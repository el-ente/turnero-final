import {
  AppointmentService, AppointmentBlock, Appointment, ACTIVE_APPOINTMENT_STATUSES, AvailabilityRule,
} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError, ValidationError} from "../utils/errors";

function validateAvailabilityRules(rules: AvailabilityRule[]) {
  for (const rule of rules) {
    if (!Array.isArray(rule.daysOfWeek) || rule.daysOfWeek.length === 0 ||
        rule.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new ValidationError("daysOfWeek must be a non-empty array of integers between 0 and 6");
    }
    if (!rule.startTime || !rule.endTime || rule.startTime >= rule.endTime) {
      throw new ValidationError("Each availability rule needs startTime before endTime");
    }
  }
}

// ─── Appointment Services ───

const DEFAULT_BOOKING_HORIZON_DAYS = 14;

export async function createAppointmentService(data: {
  name: string;
  durationMinutes: number;
  capacityPerSlot: number;
  availabilityRules?: AvailabilityRule[];
  bookingHorizonDays?: number;
}): Promise<AppointmentService> {
  if (!data.name) throw new ValidationError("name is required");
  if (!Number.isInteger(data.durationMinutes) || data.durationMinutes <= 0) {
    throw new ValidationError("durationMinutes must be a positive integer");
  }
  if (!Number.isInteger(data.capacityPerSlot) || data.capacityPerSlot <= 0) {
    throw new ValidationError("capacityPerSlot must be a positive integer");
  }
  if (data.bookingHorizonDays !== undefined &&
      (!Number.isInteger(data.bookingHorizonDays) || data.bookingHorizonDays <= 0)) {
    throw new ValidationError("bookingHorizonDays must be a positive integer");
  }
  const availabilityRules = data.availabilityRules || [];
  validateAvailabilityRules(availabilityRules);

  const ref = db.collection("appointmentServices").doc();
  const service: AppointmentService = {
    id: ref.id,
    name: data.name,
    active: true,
    durationMinutes: data.durationMinutes,
    capacityPerSlot: data.capacityPerSlot,
    availabilityRules,
    bookingHorizonDays: data.bookingHorizonDays || DEFAULT_BOOKING_HORIZON_DAYS,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await ref.set(service);
  return service;
}

export async function listAppointmentServices(): Promise<AppointmentService[]> {
  const snap = await db.collection("appointmentServices").orderBy("name").get();
  return snap.docs.map((d) => d.data() as AppointmentService);
}

export async function updateAppointmentService(
  serviceId: string,
  data: Record<string, unknown>
): Promise<AppointmentService> {
  const ref = db.collection("appointmentServices").doc(serviceId);
  const doc = await ref.get();
  if (!doc.exists) throw new NotFoundError("Appointment service not found");

  if (data.availabilityRules !== undefined) {
    validateAvailabilityRules(data.availabilityRules as AvailabilityRule[]);
  }
  if (data.bookingHorizonDays !== undefined &&
      (!Number.isInteger(data.bookingHorizonDays) || (data.bookingHorizonDays as number) <= 0)) {
    throw new ValidationError("bookingHorizonDays must be a positive integer");
  }

  const updateData: Record<string, unknown> = {updatedAt: new Date()};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.durationMinutes !== undefined) updateData.durationMinutes = data.durationMinutes;
  if (data.capacityPerSlot !== undefined) updateData.capacityPerSlot = data.capacityPerSlot;
  if (data.availabilityRules !== undefined) updateData.availabilityRules = data.availabilityRules;
  if (data.bookingHorizonDays !== undefined) updateData.bookingHorizonDays = data.bookingHorizonDays;
  if (data.active !== undefined) updateData.active = data.active;

  await ref.update(updateData);
  const updated = await ref.get();
  return updated.data() as AppointmentService;
}

// ─── Appointment Blocks ───

export async function createAppointmentBlock(data: {
  serviceId?: string | null;
  date: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}): Promise<AppointmentBlock> {
  if (!data.date) throw new ValidationError("date is required");
  if ((data.startTime && !data.endTime) || (!data.startTime && data.endTime)) {
    throw new ValidationError("startTime and endTime must be provided together");
  }
  if (data.startTime && data.endTime && data.startTime >= data.endTime) {
    throw new ValidationError("startTime must be before endTime");
  }

  const ref = db.collection("appointmentBlocks").doc();
  const block: AppointmentBlock = {
    id: ref.id,
    serviceId: data.serviceId ?? null,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    reason: data.reason,
    createdAt: new Date(),
  };
  await ref.set(block);
  return block;
}

export async function listAppointmentBlocks(): Promise<AppointmentBlock[]> {
  const snap = await db.collection("appointmentBlocks").orderBy("date").get();
  return snap.docs.map((d) => d.data() as AppointmentBlock);
}

export async function deleteAppointmentBlock(blockId: string): Promise<void> {
  const ref = db.collection("appointmentBlocks").doc(blockId);
  const doc = await ref.get();
  if (!doc.exists) throw new NotFoundError("Appointment block not found");
  await ref.delete();
}

// Shown to the admin BEFORE they confirm a Block — never blocks the save,
// per the spec's "warn but don't prevent" decision. createAppointmentBlock
// does not call this itself and never cancels affected appointments.
export async function previewAppointmentBlockImpact(params: {
  serviceId?: string | null;
  date: string;
  startTime?: string;
  endTime?: string;
}): Promise<{ count: number; appointments: Appointment[] }> {
  if (!params.date) throw new ValidationError("date is required");

  const snap = await db.collection("appointments")
    .where("date", "==", params.date)
    .where("status", "in", ACTIVE_APPOINTMENT_STATUSES)
    .get();

  const affected = snap.docs
    .map((d) => d.data() as Appointment)
    .filter((appt) => {
      if (params.serviceId && appt.serviceId !== params.serviceId) return false;
      if (!params.startTime || !params.endTime) return true;
      return appt.startTime >= params.startTime && appt.startTime < params.endTime;
    });

  return {count: affected.length, appointments: affected};
}
