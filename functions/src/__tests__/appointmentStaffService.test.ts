import {
  callAppointment, recallAppointment, startAppointment, finishAppointment, noShowAppointment,
  getAppointmentsByDate,
} from "../services/appointmentStaffService";
import {db} from "../config/firebase-admin";
import {AppointmentStatus} from "shared";
import {mockRunTransaction} from "./helpers";

jest.mock("../config/firebase-admin");

function chainable(overrides: Record<string, unknown> = {}) {
  const obj: any = {id: "appt-1", delete: jest.fn().mockResolvedValue(undefined), ...overrides};
  obj.doc = jest.fn().mockReturnValue(obj);
  obj.where = jest.fn().mockReturnValue(obj);
  obj.orderBy = jest.fn().mockReturnValue(obj);
  return obj;
}

describe("appointmentStaffService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.collection as jest.Mock).mockImplementation(() => chainable());
  });

  describe("callAppointment", () => {
    it("moves a RESERVADA appointment to LLAMADA and writes an appointmentCalls mirror", async () => {
      const transaction = mockRunTransaction();
      transaction.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            id: "appt-1", status: AppointmentStatus.RESERVADA, serviceId: "svc-1",
            startTime: "09:00", recallCount: 0,
          }),
        })
        .mockResolvedValueOnce({exists: true, data: () => ({name: "Trámite"})});

      const result = await callAppointment("appt-1");

      expect(result.status).toBe(AppointmentStatus.LLAMADA);
      expect(transaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({appointmentId: "appt-1", serviceName: "Trámite", recallCount: 0})
      );
    });

    it("rejects calling an appointment that is not RESERVADA", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValueOnce({exists: true, data: () => ({status: AppointmentStatus.LLAMADA})});

      await expect(callAppointment("appt-1")).rejects.toThrow();
      expect(transaction.set).not.toHaveBeenCalled();
    });
  });

  describe("recallAppointment", () => {
    it("increments recallCount while staying in LLAMADA", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({exists: true, data: () => ({status: AppointmentStatus.LLAMADA, recallCount: 1})});

      const result = await recallAppointment("appt-1");

      expect(result.recallCount).toBe(2);
      expect(transaction.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({recallCount: 2}));
    });

    it("rejects recalling an appointment that was never called", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({exists: true, data: () => ({status: AppointmentStatus.RESERVADA})});

      await expect(recallAppointment("appt-1")).rejects.toThrow();
    });
  });

  describe("startAppointment / finishAppointment / noShowAppointment status guards", () => {
    it("startAppointment requires LLAMADA", async () => {
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: true, data: () => ({status: AppointmentStatus.RESERVADA})}),
      }));

      await expect(startAppointment("appt-1")).rejects.toThrow();
    });

    it("startAppointment succeeds from LLAMADA and updates status", async () => {
      const updateSpy = jest.fn().mockResolvedValue(undefined);
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: true, data: () => ({status: AppointmentStatus.LLAMADA})}),
        update: updateSpy,
      }));

      const result = await startAppointment("appt-1");

      expect(result.status).toBe(AppointmentStatus.ATENDIENDO);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({status: AppointmentStatus.ATENDIENDO}));
    });

    it("finishAppointment requires ATENDIENDO", async () => {
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: true, data: () => ({status: AppointmentStatus.LLAMADA})}),
      }));

      await expect(finishAppointment("appt-1")).rejects.toThrow();
    });

    it("noShowAppointment requires LLAMADA", async () => {
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: true, data: () => ({status: AppointmentStatus.RESERVADA})}),
      }));

      await expect(noShowAppointment("appt-1")).rejects.toThrow();
    });

    it("noShowAppointment succeeds from LLAMADA without any automatic timing check", async () => {
      const updateSpy = jest.fn().mockResolvedValue(undefined);
      (db.collection as jest.Mock).mockImplementation(() => chainable({
        get: jest.fn().mockResolvedValue({exists: true, data: () => ({status: AppointmentStatus.LLAMADA})}),
        update: updateSpy,
      }));

      const result = await noShowAppointment("appt-1");

      expect(result.status).toBe(AppointmentStatus.NO_SHOW);
    });
  });

  describe("getAppointmentsByDate", () => {
    it("orders by startTime and optionally filters by serviceId", async () => {
      const getSpy = jest.fn().mockResolvedValue({docs: []});
      (db.collection as jest.Mock).mockImplementation(() => chainable({get: getSpy}));

      await getAppointmentsByDate("2026-09-28", "svc-1");

      const collectionInstance = (db.collection as jest.Mock).mock.results[0].value;
      expect(collectionInstance.where).toHaveBeenCalledWith("date", "==", "2026-09-28");
      expect(collectionInstance.where).toHaveBeenCalledWith("serviceId", "==", "svc-1");
      expect(collectionInstance.orderBy).toHaveBeenCalledWith("startTime", "asc");
    });
  });
});
