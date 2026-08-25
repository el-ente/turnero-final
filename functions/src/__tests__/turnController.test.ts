// onRequest() is mocked to hand back the wrapped handler as-is (same
// approach as authGating.test.ts) so it can be invoked directly with plain
// req/res doubles instead of needing full Express plumbing.
jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (optsOrHandler: unknown, handler?: unknown) => handler ?? optsOrHandler,
}));

import {createTurnHandler, getCurrentTurnHandler, cancelTurnHandler} from "../controllers/turnController";
import {checkRateLimit} from "../utils/rateLimit";
import {TooManyRequestsError} from "../utils/errors";

jest.mock("../config/firebase-admin");
jest.mock("../utils/rateLimit");

function req(method: string) {
  return {headers: {}, body: {}, query: {}, method} as any;
}

function res() {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

const HANDLERS: Record<string, {handler: (req: any, res: any) => void | Promise<void>; method: string}> = {
  createTurn: {handler: createTurnHandler, method: "POST"},
  getCurrentTurn: {handler: getCurrentTurnHandler, method: "GET"},
  cancelTurn: {handler: cancelTurnHandler, method: "POST"},
};

describe("turn endpoints rate limiting", () => {
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
