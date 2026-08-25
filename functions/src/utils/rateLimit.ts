import {db} from "../config/firebase-admin";
import {TooManyRequestsError} from "./errors";

// Fixed-window rate limit: a real customer/kiosk takes at least a few
// seconds per action (select service, confirm on-screen), and even a store
// with several kiosks or customers sharing one public IP won't cluster more
// than a handful of genuine requests in a short burst. A scripted loop fires
// far faster than that, so a short window with a generous-but-bounded cap
// lets real usage through untouched while capping an attacker's effective
// rate to MAX_REQUESTS per WINDOW_MS.
const WINDOW_MS = 20_000;
const MAX_REQUESTS = 8;

interface RateLimitDoc {
  count: number;
  windowStart: number;
}

// Minimal structural shape of an incoming request — avoids depending on
// express's types being resolvable from this file while still matching the
// real (express.Request) object passed in by onRequest handlers.
export interface RequestLike {
  headers: { [key: string]: string | string[] | undefined };
  ip?: string;
  socket?: { remoteAddress?: string };
}

// Best-effort extraction of the caller's IP. Cloud Functions v2 runs on
// Cloud Run behind Google's front end (GFE): Cloud Run appends the IP it
// observed for the immediate caller as the LAST entry of `x-forwarded-for`
// before invoking our code. Everything before that last entry is whatever
// the client itself sent and is fully spoofable — a client can send
// `x-forwarded-for: 1.2.3.4` and pick any value there, so the FIRST entry
// must never be trusted. `req.ip` alone reflects the immediate peer unless
// Express's `trust proxy` is configured, which onRequest does not do for
// us. Falls back to `req.ip` / the socket address, and finally a shared
// bucket if nothing is available.
export function getClientIp(req: RequestLike): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (forwardedValue) {
    const parts = forwardedValue.split(",").map((part) => part.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// Firestore-backed fixed-window rate limiter, keyed by an arbitrary string
// (typically the caller's IP). Throws TooManyRequestsError once `key` has
// made MAX_REQUESTS requests within the current WINDOW_MS window; the
// window resets (and the request is allowed) once it has expired.
export async function checkRateLimit(key: string): Promise<void> {
  const ref = db.collection("rateLimits").doc(key);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.exists ? (snap.data() as RateLimitDoc) : null;

    if (!data || now - data.windowStart >= WINDOW_MS) {
      transaction.set(ref, {count: 1, windowStart: now});
      return;
    }

    if (data.count >= MAX_REQUESTS) {
      throw new TooManyRequestsError();
    }

    transaction.update(ref, {count: data.count + 1});
  });
}
