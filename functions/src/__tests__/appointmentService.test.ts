import {createAppointment, cancelAppointment, rescheduleAppointment, getAppointment} from "../services/appointmentService";
import {db} from "../config/firebase-admin";
import {AppointmentStatus} from "shared";
import {mockRunTransaction} from "./helpers";

jest.mock("../config/firebase-admin");

function chainable(overrides: Record<string, unknown> = {}) {
  const obj: any = {id: "new-appointment-id", ...overrides};
  obj.doc = jest.fn().mockReturnValue(obj);
  obj.where = jest.fn().mockReturnValue(obj);
  obj.orderBy = jest.fn().mockReturnValue(obj);
  return obj;
}

const activeService = {
  id: "svc-1", name: "Trámite", active: true, durationMinutes: 30, capacityPerSlot: 1,
  availabilityRules: [{daysOfWeek: [1], startTime: "09:00", endTime: "10:00"}], // Monday
};

describe("appointmentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.collection as jest.Mock).mockImplementation(() => chainable());
  });

  describe("createAppointment", () => {
    // 2026-09-28 is a Monday
    const baseInput = {
      serviceId: "svc-1", date: "2026-09-28", startTime: "09:00", memberNumber: 4213, contactName: "Ana",
    };

    it("creates a RESERVADA appointment when the slot is open", async () => {
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => activeService}) // service
        .mockResolvedValueOnce({docs: []}) // blocks
        .mockResolvedValueOnce({size: 0}) // capacity
        .mockResolvedValueOnce({empty: true}); // duplicate guard

      const result = await createAppointment(baseInput);

      expect(result.status).toBe(AppointmentStatus.RESERVADA);
      expect(transaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({serviceId: "svc-1", date: "2026-09-28", startTime: "09:00", memberNumber: 4213})
      );
    });

    it("rejects an out-of-range memberNumber before touching Firestore", async () => {
      await expect(createAppointment({...baseInput, memberNumber: 0})).rejects.toThrow("memberNumber");
    });

    it("rejects booking a slot already in the past", async () => {
      await expect(createAppointment({...baseInput, date: "2020-01-01"})).rejects.toThrow();
    });

    it("rejects when the service does not exist", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: false});

      await expect(createAppointment(baseInput)).rejects.toThrow();
      expect(transaction.set).not.toHaveBeenCalled();
    });

    it("rejects when the service is not active", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: true, data: () => ({...activeService, active: false})});

      await expect(createAppointment(baseInput)).rejects.toThrow();
      expect(transaction.set).not.toHaveBeenCalled();
    });

    it("rejects a startTime not produced by the service's availability rules", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: true, data: () => activeService});

      await expect(createAppointment({...baseInput, startTime: "23:00"})).rejects.toThrow();
      expect(transaction.set).not.toHaveBeenCalled();
    });

    it("rejects a slot covered by a block", async () => {
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => activeService})
        .mockResolvedValueOnce({docs: [{data: () => ({serviceId: null, date: "2026-09-28"})}]});

      await expect(createAppointment(baseInput)).rejects.toThrow();
      expect(transaction.set).not.toHaveBeenCalled();
    });

    it("rejects when the slot is already at capacity", async () => {
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => activeService})
        .mockResolvedValueOnce({docs: []})
        .mockResolvedValueOnce({size: 1}); // capacityPerSlot is 1

      await expect(createAppointment(baseInput)).rejects.toThrow();
      expect(transaction.set).not.toHaveBeenCalled();
    });

    it("rejects a second active appointment for the same member in the same service", async () => {
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => activeService})
        .mockResolvedValueOnce({docs: []})
        .mockResolvedValueOnce({size: 0})
        .mockResolvedValueOnce({empty: false});

      await expect(createAppointment(baseInput)).rejects.toThrow();
      expect(transaction.set).not.toHaveBeenCalled();
    });
  });

  describe("getAppointment", () => {
    it("returns the appointment when memberNumber matches", async () => {
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: true, data: () => ({memberNumber: 4213, status: AppointmentStatus.RESERVADA})}),
      }));

      const result = await getAppointment("appt-1", 4213);
      expect(result.memberNumber).toBe(4213);
    });

    it("throws when memberNumber does not match", async () => {
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: true, data: () => ({memberNumber: 4213})}),
      }));

      await expect(getAppointment("appt-1", 9999)).rejects.toThrow();
    });

    it("throws when the appointment does not exist", async () => {
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: false}),
      }));

      await expect(getAppointment("appt-1", 4213)).rejects.toThrow();
    });
  });

  describe("cancelAppointment", () => {
    it("cancels a RESERVADA appointment when memberNumber matches", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true, data: () => ({status: AppointmentStatus.RESERVADA, memberNumber: 4213}),
      });

      await cancelAppointment("appt-1", 4213);

      expect(transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({status: AppointmentStatus.CANCELADA})
      );
    });

    it("throws if the appointment does not exist", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({exists: false});

      await expect(cancelAppointment("appt-1", 4213)).rejects.toThrow();
    });

    it("throws and does not cancel if memberNumber does not match", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true, data: () => ({status: AppointmentStatus.RESERVADA, memberNumber: 4213}),
      });

      await expect(cancelAppointment("appt-1", 9999)).rejects.toThrow();
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("throws if the appointment is not RESERVADA", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true, data: () => ({status: AppointmentStatus.LLAMADA, memberNumber: 4213}),
      });

      await expect(cancelAppointment("appt-1", 4213)).rejects.toThrow();
      expect(transaction.update).not.toHaveBeenCalled();
    });
  });

  describe("rescheduleAppointment", () => {
    const reserved = {
      id: "appt-1", serviceId: "svc-1", date: "2026-09-28", startTime: "09:00",
      memberNumber: 4213, contactName: "Ana", status: AppointmentStatus.RESERVADA, recallCount: 0,
      createdAt: new Date("2026-09-01"),
    };
    // 2026-09-29 is a Tuesday
    const tuesdayService = {...activeService, availabilityRules: [{daysOfWeek: [2], startTime: "09:00", endTime: "10:00"}]};

    it("moves the appointment to a new open slot", async () => {
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => reserved})
        .mockResolvedValueOnce({exists: true, data: () => tuesdayService})
        .mockResolvedValueOnce({docs: []})
        .mockResolvedValueOnce({size: 0});

      const result = await rescheduleAppointment("appt-1", 4213, "2026-09-29", "09:00");

      expect(result.date).toBe("2026-09-29");
      expect(transaction.update).toHaveBeenCalledWith(expect.anything(), {date: "2026-09-29", startTime: "09:00"});
    });

    it("short-circuits without re-validating when rescheduling to the same slot", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: true, data: () => reserved});

      const result = await rescheduleAppointment("appt-1", 4213, reserved.date, reserved.startTime);

      expect(result).toEqual(reserved);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("leaves the original appointment untouched when the new slot is full", async () => {
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({exists: true, data: () => reserved})
        .mockResolvedValueOnce({exists: true, data: () => tuesdayService})
        .mockResolvedValueOnce({docs: []})
        .mockResolvedValueOnce({size: 1});

      await expect(rescheduleAppointment("appt-1", 4213, "2026-09-29", "09:00")).rejects.toThrow();
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("throws and does not update if memberNumber does not match", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: true, data: () => reserved});

      await expect(rescheduleAppointment("appt-1", 9999, "2026-09-29", "09:00")).rejects.toThrow();
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it("rejects rescheduling an appointment that already passed RESERVADA", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: true, data: () => ({...reserved, status: AppointmentStatus.LLAMADA})});

      await expect(rescheduleAppointment("appt-1", 4213, "2026-09-29", "09:00")).rejects.toThrow();
      expect(transaction.update).not.toHaveBeenCalled();
    });
  });
});
