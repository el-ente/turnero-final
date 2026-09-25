import {
  createAppointmentService, updateAppointmentService, createAppointmentBlock, deleteAppointmentBlock,
  previewAppointmentBlockImpact,
} from "../services/appointmentConfigService";
import {db} from "../config/firebase-admin";
import {ACTIVE_APPOINTMENT_STATUSES} from "shared";

jest.mock("../config/firebase-admin");

function chainable(overrides: Record<string, unknown> = {}) {
  const obj: any = {id: "generated-id", ...overrides};
  obj.doc = jest.fn().mockReturnValue(obj);
  obj.where = jest.fn().mockReturnValue(obj);
  obj.orderBy = jest.fn().mockReturnValue(obj);
  return obj;
}

describe("appointmentConfigService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.collection as jest.Mock).mockImplementation(() => chainable());
  });

  describe("createAppointmentService", () => {
    it("creates an active service with the given rules", async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      (db.collection as jest.Mock).mockImplementation(() => chainable({set: setSpy}));

      const result = await createAppointmentService({
        name: "Trámite", durationMinutes: 30, capacityPerSlot: 2,
        availabilityRules: [{daysOfWeek: [1], startTime: "09:00", endTime: "10:00"}],
      });

      expect(result.active).toBe(true);
      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({name: "Trámite", capacityPerSlot: 2}));
    });

    it.each([0, -1, 1.5])("rejects a non-positive-integer durationMinutes (%p)", async (durationMinutes) => {
      await expect(createAppointmentService({name: "X", durationMinutes, capacityPerSlot: 1}))
        .rejects.toThrow();
    });

    it("rejects a rule where startTime is not before endTime", async () => {
      await expect(createAppointmentService({
        name: "X", durationMinutes: 30, capacityPerSlot: 1,
        availabilityRules: [{daysOfWeek: [1], startTime: "10:00", endTime: "09:00"}],
      })).rejects.toThrow();
    });

    it("rejects a rule with an out-of-range day of week", async () => {
      await expect(createAppointmentService({
        name: "X", durationMinutes: 30, capacityPerSlot: 1,
        availabilityRules: [{daysOfWeek: [7], startTime: "09:00", endTime: "10:00"}],
      })).rejects.toThrow();
    });
  });

  describe("updateAppointmentService", () => {
    it("throws when the service does not exist", async () => {
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: false}),
      }));

      await expect(updateAppointmentService("svc-1", {name: "Nuevo"})).rejects.toThrow();
    });

    it("merges only the provided fields", async () => {
      const updateSpy = jest.fn().mockResolvedValue(undefined);
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: true, data: () => ({name: "Old", active: true})}),
        update: updateSpy,
      }));

      await updateAppointmentService("svc-1", {active: false});

      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({active: false}));
      expect(updateSpy.mock.calls[0][0]).not.toHaveProperty("name");
    });
  });

  describe("createAppointmentBlock", () => {
    it("creates a full-day block when no times are given", async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      (db.collection as jest.Mock).mockImplementation(() => chainable({set: setSpy}));

      const result = await createAppointmentBlock({date: "2026-12-25", reason: "Feriado"});

      expect(result.serviceId).toBeNull();
      expect(result.startTime).toBeUndefined();
    });

    it("rejects when only one of startTime/endTime is given", async () => {
      await expect(createAppointmentBlock({date: "2026-12-25", startTime: "12:00"})).rejects.toThrow();
    });

    it("rejects when startTime is not before endTime", async () => {
      await expect(createAppointmentBlock({date: "2026-12-25", startTime: "14:00", endTime: "12:00"}))
        .rejects.toThrow();
    });
  });

  describe("deleteAppointmentBlock", () => {
    it("throws when the block does not exist", async () => {
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: false}),
      }));

      await expect(deleteAppointmentBlock("block-1")).rejects.toThrow();
    });
  });

  describe("previewAppointmentBlockImpact", () => {
    const appointments = [
      {serviceId: "svc-1", startTime: "09:00"},
      {serviceId: "svc-1", startTime: "13:00"},
      {serviceId: "svc-2", startTime: "09:00"},
    ];

    it("counts only appointments matching serviceId and the time range", async () => {
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({docs: appointments.map((a) => ({data: () => a}))}),
      }));

      const result = await previewAppointmentBlockImpact({
        serviceId: "svc-1", date: "2026-09-28", startTime: "08:00", endTime: "10:00",
      });

      expect(result.count).toBe(1);
      expect(result.appointments).toEqual([appointments[0]]);
    });

    it("counts all services for a full-day, all-services block", async () => {
      const getSpy = jest.fn().mockResolvedValue({docs: appointments.map((a) => ({data: () => a}))});
      (db.collection as jest.Mock).mockImplementation(() => chainable({get: getSpy}));

      const result = await previewAppointmentBlockImpact({date: "2026-09-28"});

      expect(result.count).toBe(3);
      const collectionInstance = (db.collection as jest.Mock).mock.results[0].value;
      expect(collectionInstance.where).toHaveBeenCalledWith("status", "in", ACTIVE_APPOINTMENT_STATUSES);
    });
  });
});
