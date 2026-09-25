import {Appointment, AppointmentStatus, AppointmentCall, AppointmentService as AppointmentServiceModel} from "shared";
import {Query} from "firebase-admin/firestore";
import {db} from "../config/firebase-admin";
import {NotFoundError, ConflictError} from "../utils/errors";

// Staff-facing actions for "Agenda del día" — deliberately separate from
// Terminal's Turn lifecycle (no dispatch engine here: the order is already
// fixed by startTime, staff just works down a known list). See
// docs/turnos-agendados-spec-2026-09-25.md section 4 for why.

async function getAppointmentOrThrow(appointmentId: string): Promise<Appointment> {
  const doc = await db.collection("appointments").doc(appointmentId).get();
  if (!doc.exists) throw new NotFoundError(`Appointment ${appointmentId} not found`);
  return doc.data() as Appointment;
}

export async function callAppointment(appointmentId: string): Promise<Appointment> {
  return db.runTransaction(async (transaction) => {
    const ref = db.collection("appointments").doc(appointmentId);
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new NotFoundError(`Appointment ${appointmentId} not found`);

    const appointment = doc.data() as Appointment;
    if (appointment.status !== AppointmentStatus.RESERVADA) {
      throw new ConflictError(`Appointment is not in RESERVADA status (current: ${appointment.status})`);
    }

    const serviceDoc = await transaction.get(db.collection("appointmentServices").doc(appointment.serviceId));
    const serviceName = serviceDoc.exists ?
      (serviceDoc.data() as AppointmentServiceModel).name :
      appointment.serviceId;

    const calledAt = new Date();
    transaction.update(ref, {status: AppointmentStatus.LLAMADA, calledAt});

    const call: AppointmentCall = {
      appointmentId, serviceName, startTime: appointment.startTime, calledAt, recallCount: 0,
    };
    transaction.set(db.collection("appointmentCalls").doc(appointmentId), call);

    return {...appointment, status: AppointmentStatus.LLAMADA, calledAt};
  });
}

export async function recallAppointment(appointmentId: string): Promise<Appointment> {
  return db.runTransaction(async (transaction) => {
    const ref = db.collection("appointments").doc(appointmentId);
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new NotFoundError(`Appointment ${appointmentId} not found`);

    const appointment = doc.data() as Appointment;
    if (appointment.status !== AppointmentStatus.LLAMADA) {
      throw new ConflictError(`Appointment is not in LLAMADA status (current: ${appointment.status})`);
    }

    const recallCount = appointment.recallCount + 1;
    const calledAt = new Date();
    transaction.update(ref, {recallCount, calledAt});
    transaction.update(db.collection("appointmentCalls").doc(appointmentId), {calledAt, recallCount});

    return {...appointment, recallCount, calledAt};
  });
}

export async function startAppointment(appointmentId: string): Promise<Appointment> {
  const appointment = await getAppointmentOrThrow(appointmentId);
  if (appointment.status !== AppointmentStatus.LLAMADA) {
    throw new ConflictError(`Appointment is not in LLAMADA status (current: ${appointment.status})`);
  }
  const attendingAt = new Date();
  await Promise.all([
    db.collection("appointments").doc(appointmentId).update({status: AppointmentStatus.ATENDIENDO, attendingAt}),
    // Person showed up — the public screen no longer needs to announce them.
    db.collection("appointmentCalls").doc(appointmentId).delete(),
  ]);
  return {...appointment, status: AppointmentStatus.ATENDIENDO, attendingAt};
}

export async function finishAppointment(appointmentId: string): Promise<Appointment> {
  const appointment = await getAppointmentOrThrow(appointmentId);
  if (appointment.status !== AppointmentStatus.ATENDIENDO) {
    throw new ConflictError(`Appointment is not in ATENDIENDO status (current: ${appointment.status})`);
  }
  const finishedAt = new Date();
  await db.collection("appointments").doc(appointmentId).update({status: AppointmentStatus.FINALIZADA, finishedAt});
  return {...appointment, status: AppointmentStatus.FINALIZADA, finishedAt};
}

// Manual only, by explicit staff decision — no automatic expiry. See
// decision 3 in docs/turnos-agendados-spec-2026-09-25.md.
export async function noShowAppointment(appointmentId: string): Promise<Appointment> {
  const appointment = await getAppointmentOrThrow(appointmentId);
  if (appointment.status !== AppointmentStatus.LLAMADA) {
    throw new ConflictError(`Appointment is not in LLAMADA status (current: ${appointment.status})`);
  }
  await Promise.all([
    db.collection("appointments").doc(appointmentId).update({status: AppointmentStatus.NO_SHOW}),
    db.collection("appointmentCalls").doc(appointmentId).delete(),
  ]);
  return {...appointment, status: AppointmentStatus.NO_SHOW};
}

export async function getAppointmentsByDate(date: string, serviceId?: string): Promise<Appointment[]> {
  let query: Query = db.collection("appointments").where("date", "==", date);
  if (serviceId) query = query.where("serviceId", "==", serviceId);
  const snap = await query.orderBy("startTime", "asc").get();
  return snap.docs.map((d) => d.data() as Appointment);
}
