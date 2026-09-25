/**
 * Appointment module: fully independent of Sector/Queue/Terminal/Turn.
 * Clients book a Cita for a specific date/time slot of an AppointmentService;
 * staff work it from a separate "Agenda del día" screen (see appointmentStaffService),
 * not from Terminal — there is no shared queue/dispatch concept here.
 */
export const AppointmentStatus = {
  RESERVADA: "reservada",
  LLAMADA: "llamada",
  ATENDIENDO: "atendiendo",
  FINALIZADA: "finalizada",
  CANCELADA: "cancelada",
  NO_SHOW: "no_show",
} as const;

export type AppointmentStatus = typeof AppointmentStatus[keyof typeof AppointmentStatus];

export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.RESERVADA,
  AppointmentStatus.LLAMADA,
  AppointmentStatus.ATENDIENDO,
];

export interface AvailabilityRule {
  daysOfWeek: number[]; // 0 = domingo .. 6 = sábado
  startTime: string; // "09:00"
  endTime: string; // "17:00"
}

export interface AppointmentService {
  id: string;
  name: string;
  active: boolean;
  durationMinutes: number;
  capacityPerSlot: number;
  availabilityRules: AvailabilityRule[];
  bookingHorizonDays: number; // how many days ahead a client may book, e.g. 14
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentBlock {
  id: string;
  serviceId: string | null; // null = aplica a todos los Servicios
  date: string; // "YYYY-MM-DD"
  startTime?: string; // sin horario = todo el día
  endTime?: string;
  reason?: string;
  createdAt: Date;
}

export interface Appointment {
  id: string;
  serviceId: string;
  date: string; // "YYYY-MM-DD", TZ Argentina
  startTime: string; // "HH:mm", TZ Argentina
  memberNumber: number;
  contactName: string;
  contact?: string;
  status: AppointmentStatus;
  recallCount: number;
  createdAt: Date;
  calledAt?: Date;
  attendingAt?: Date;
  finishedAt?: Date;
  cancelledAt?: Date;
}

// Publicly readable mirror of a called Cita, without PII, to feed the
// module's own public announcement screen (appointments itself is not
// publicly readable because it holds contactName/contact).
export interface AppointmentCall {
  appointmentId: string;
  serviceName: string;
  startTime: string;
  calledAt: Date;
  recallCount: number;
}
