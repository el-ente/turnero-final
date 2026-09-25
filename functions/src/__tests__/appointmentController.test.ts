jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (optsOrHandler: unknown, handler?: unknown) => handler ?? optsOrHandler,
}));

import {
  createAppointmentHandler, getAvailableSlotsHandler, getAppointmentHandler,
  cancelAppointmentHandler, rescheduleAppointmentHandler,
} from "../controllers/appointmentController";
import {checkRateLimit} from "../utils/rateLimit";
import {TooManyRequestsError} from "../utils/errors";

jest.mock("../config/firebase-admin");
jest.mock("../utils/rateLimit");

function req(method: string, body: Record<string, unknown> = {}) {
  return {headers: {}, body, query: {}, method} as any;
}

function res() {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

const HANDLERS: Record<string, {handler: (req: any, res: any) => void | Promise<void>; method: string}> = {
  createAppointment: {handler: createAppointmentHandler, method: "POST"},
  getAvailableSlots: {handler: getAvailableSlotsHandler, method: "GET"},
  getAppointment: {handler: getAppointmentHandler, method: "GET"},
  cancelAppointment: {handler: cancelAppointmentHandler, method: "POST"},
  rescheduleAppointment: {handler: rescheduleAppointmentHandler, method: "POST"},
};

describe("appointment endpoints rate limiting", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(Object.entries(HANDLERS))("%s -> 429 when the caller is rate-limited", async (_name, {handler, method}) => {
    (checkRateLimit as jest.Mock).mockRejectedValue(new TooManyRequestsError());

    const response = res();
    await handler(req(method), response);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({code: "TOO_MANY_REQUESTS"})
    );
  });
});

describe("createAppointment rate limiting by member number", () => {
  beforeEach(() => jest.clearAllMocks());

  it("checks the IP limit and the member-number limit before creating", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue(undefined);
    const response = res();

    await createAppointmentHandler(
      req("POST", {
        serviceId: "svc-1", date: "2026-09-28", startTime: "09:00",
        memberNumber: 4213, contactName: "Ana",
      }),
      response
    );

    expect(checkRateLimit).toHaveBeenCalledWith("member:4213");
  });

  it("rejects when the member-number limit is hit, even if the IP limit passed", async () => {
    (checkRateLimit as jest.Mock)
      .mockResolvedValueOnce(undefined) // IP check passes
      .mockRejectedValueOnce(new TooManyRequestsError()); // member check fails
    const response = res();

    await createAppointmentHandler(
      req("POST", {
        serviceId: "svc-1", date: "2026-09-28", startTime: "09:00",
        memberNumber: 4213, contactName: "Ana",
      }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(429);
  });
});
