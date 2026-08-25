import {checkRateLimit, getClientIp} from "../utils/rateLimit";
import {db} from "../config/firebase-admin";
import {mockRunTransaction} from "./helpers";

jest.mock("../config/firebase-admin");

describe("rateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.collection as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue({id: "rate-limit-key"}),
    });
  });

  describe("checkRateLimit", () => {
    it("allows a request under the limit and increments the count", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({count: 3, windowStart: Date.now()}),
      });

      await expect(checkRateLimit("1.2.3.4")).resolves.toBeUndefined();
      expect(transaction.update).toHaveBeenCalledWith(expect.anything(), {count: 4});
      expect(transaction.set).not.toHaveBeenCalled();
    });

    it("starts a fresh window on the first request for a key", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({exists: false});

      await checkRateLimit("1.2.3.4");

      expect(transaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({count: 1})
      );
    });

    it("rejects once the count is at the limit within the window", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({count: 8, windowStart: Date.now()}),
      });

      await expect(checkRateLimit("1.2.3.4")).rejects.toThrow();
      expect(transaction.update).not.toHaveBeenCalled();
      expect(transaction.set).not.toHaveBeenCalled();
    });

    it("resets and allows again once the window has expired", async () => {
      const transaction = mockRunTransaction();
      transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({count: 8, windowStart: Date.now() - 30_000}),
      });

      await expect(checkRateLimit("1.2.3.4")).resolves.toBeUndefined();
      expect(transaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({count: 1})
      );
      expect(transaction.update).not.toHaveBeenCalled();
    });
  });

  describe("getClientIp", () => {
    it("uses the last entry of x-forwarded-for (the hop Cloud Run itself appended)", () => {
      expect(getClientIp({headers: {"x-forwarded-for": "1.1.1.1, 2.2.2.2"}})).toBe("2.2.2.2");
    });

    it("is not fooled by a client-prepended fake IP", () => {
      expect(getClientIp({headers: {"x-forwarded-for": "attacker-fake-ip, real-trusted-ip"}})).toBe("real-trusted-ip");
    });

    it("handles x-forwarded-for arriving as an array", () => {
      expect(getClientIp({headers: {"x-forwarded-for": ["3.3.3.3, 4.4.4.4"]}})).toBe("4.4.4.4");
    });

    it("falls back to req.ip when there is no x-forwarded-for header", () => {
      expect(getClientIp({headers: {}, ip: "9.9.9.9"})).toBe("9.9.9.9");
    });

    it("falls back to the socket's remoteAddress when neither is present", () => {
      expect(getClientIp({headers: {}, socket: {remoteAddress: "8.8.8.8"}})).toBe("8.8.8.8");
    });

    it("falls back to a shared bucket when nothing is available", () => {
      expect(getClientIp({headers: {}})).toBe("unknown");
    });
  });
});
