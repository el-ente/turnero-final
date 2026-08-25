# Turnero — Code Review (2026-08-04)

Based entirely on reading the source (`shared/`, `functions/src/`, `app/src/`, `firestore.rules`, `firebase.json`) — not on the repo's own `.md` docs.

## What this app is

A queue-management system ("turnero" = ticket/turn dispenser) for businesses with multiple service counters. Four surfaces, all in one React app (`app/src/views/`):

- **Totem** (`/`) — customer picks a queue, gets a ticket number, watches its status live.
- **Public Display** (`/display`) — waiting-room screen showing the currently-called number and the next 5.
- **Terminal** (`/terminal/:id`) — operator console: pull next turn, call/start/finish/recall/no-show.
- **Admin** (`/admin`) — CRUD for sectors, queues, terminals, plus per-queue stats.

Backend is Firebase Cloud Functions (`functions/src/`), one HTTP function per operation, talking to Firestore. The frontend calls functions for writes (`app/src/lib/api.ts`) and listens to Firestore directly for reads (`onSnapshot` in every view).

Domain model (`shared/src/models/`): `Sector` → `Queue` → `Turn`, plus `Terminal`s that serve one or more queues. A turn has a daily-reset number, a status lifecycle (`waiting → called → attending → finished`, or `no_show`/`cancelled`), and can be "requeued" (bumped back N positions) up to a configured max attempts on no-show.

Two dispatch strategies a terminal can run: `fifo_across_queues` (global order by turn number) and `ratio_based` (alternate normal/priority turns by a configured ratio, state tracked as counters on the terminal doc).

## What's actually implemented

Solid and complete:
- Turn lifecycle end-to-end (create → call → start → finish), no-show handling with requeue-or-cancel
- Both dispatch strategies, wired into the terminal UI
- Admin CRUD for sectors/queues/terminals, with cascade cleanup (deleting a sector deletes its queues and unlinks terminals; deleting a terminal/queue unlinks the other side)
- Real-time UI everywhere via Firestore listeners — totem ticket, display board, terminal queue list all update live
- Per-queue stats (counts by status, avg wait time)
- Daily turn-number reset, Argentina timezone handled explicitly

Not implemented (visible as dead ends in the type system or absent entirely):
- **Auth**: `Channel` type includes `"whatsapp"` and `"mobile"`, `getAuth()`/`connectAuthEmulator` is wired in `app/src/lib/firebase.ts`, `firebase.json` has Google Sign-In configured — but nothing in the app calls `signInWithPopup` or reads `auth.currentUser` anywhere. No login screen, no route guard, no user-facing auth at all.
- **WhatsApp/mobile intake**: `channel` field exists on every turn, only `"totem"` is ever produced.
- **Firestore security rules**: see below — effectively "allow all."
- Member identity is a random string in `localStorage` (`TotemView.tsx:8-14`) — no way to recover a ticket from a second device or after clearing storage, no printed/displayed lookup code.

## Correctness bugs found

**1. Turn numbering can collide** — `functions/src/services/turnService.ts:40-56`
`createTurn` determines the next number by querying the single most-recently-*created* turn today and taking `max(originalTurnNumber, currentTurnNumber)` off *that one document*. But requeuing bumps `currentTurnNumber` without changing `createdAt`. Sequence: turn A (created 1st, #1) gets requeued +5 → `currentTurnNumber=6`; turn B (created 2nd, #2) is still the most-recently-created. A new turn C then gets `#3` (from B), not `#7`. Turns #3–#6 will eventually collide with A's `#6`. This needs a true max over all of today's turns for the queue (or a counter document), not "the last-created one."

**2. Returned `createdAt` doesn't match what was stored** — `functions/src/services/turnService.ts:68` vs `:87`
Inside the transaction the turn is stored with `createdAt: new Date()` (actual creation instant). The value returned to the caller is recomputed separately as `getTodayMidnightInArgentina()` — always midnight, never the real timestamp. The totem ticket's displayed time (`TotemView.tsx:205`) will be wrong on the initial response (self-corrects once the Firestore listener delivers the real doc).

**3. `handleNoShow`'s "transaction" isn't atomic** — `functions/src/services/terminalService.ts:212-219`
`db.runTransaction(async (transaction) => { await noShowTurn(turnId); transaction.update(...) })` — `noShowTurn` (`turnService.ts:145-169`) does its own independent `db.collection(...).update()` calls outside the `transaction` object it was handed. If Firestore retries the outer transaction due to contention on the terminal doc, `noShowTurn`'s already-committed side effects (recall count increment, or cancellation) re-run on each retry — not idempotent, breaks the atomicity the code is visibly trying to achieve.

**4. `callTurn` has a check-then-act race** — `functions/src/services/terminalService.ts:90-117`
Status is read and validated (`turn.status !== WAITING`) *before* the transaction opens, then the transaction writes unconditionally without re-checking status inside itself. Two concurrent `callTurn` calls for the same turn (e.g. two operators clicking simultaneously) can both pass the pre-check and both commit, silently double-assigning the turn.

**5. React Hooks rule violation** — `app/src/views/TerminalView.tsx:17-19`
```tsx
if (!terminalId) return <Navigate to="/terminal" replace />;
const [terminal, setTerminal] = useState<Terminal | null>(null);
```
The early return sits before six `useState`/`useEffect` calls — hooks must be unconditional. Currently masked because the route always supplies `terminalId`, but it's a landmine (and an ESLint `react-hooks/rules-of-hooks` violation) waiting for a route change.

**6. Ratio-based counters never reset and are updated inconsistently** — `functions/src/services/terminalService.ts:155-176`
`normalCounterState`/`priorityCounterState` only increment on `finishTurn`, not on no-show/cancel, so a priority turn that no-shows never counts against the ratio. The counters also grow forever with no reset, so the ratio math's sensitivity to a live config change shrinks the longer a terminal has been running.

## Security

**This is the biggest issue in the codebase.** `firestore.rules`:
```
allow read, write: if request.time < timestamp.date(2026, 10, 31);
```
Anyone with the Firebase web config (not a secret — it's shipped in the client bundle) can read and write *any* document in Firestore directly, bypassing every service-layer rule: fabricate turns, mark them finished, delete terminals, rewrite stats — all from a browser console, no Cloud Function involved. And on 2026-10-31 this flips to deny-all, taking the entire app offline app-wide with no rules to fall back on.

On top of that, **every Cloud Function is a public `onRequest` with `cors: true` and zero auth check** (`functions/src/controllers/*.ts`) — no `req.auth`, no App Check, no API key. Every admin CRUD endpoint (`createSector`, `deleteTerminal`, `updateQueueConfig`, ...) is reachable by anyone who finds the function URL.

Given Auth is wired up client-side but never used (see above), the fix isn't starting from scratch — it's finishing what's half-built: real Firestore rules keyed off `request.auth`, and either `onCall` functions (which get auth context for free) or manual ID-token verification in the existing `onRequest` handlers.

## Other things worth fixing

- **`updateQueueConfigHandler` and `updateQueueHandler`** (`adminController.ts:38-52`, `:138-152`) are two different endpoints calling the exact same service function — pick one.
- **No input validation on enum-like fields** — `createQueue`/`updateQueue` accept any string for `type`, `createTerminal`/`updateTerminal` accept any string for `servingStrategy` (`adminService.ts`). Nothing rejects garbage before it lands in Firestore; downstream code just silently treats unrecognized values as the "else" branch.
- **`getNextTurnRatioBased`** (`terminalService.ts:32-88`) does one Firestore read per queue in `terminal.activeQueueIds` on every single "next turn" click, and is the most algorithmically dense function in the codebase — it has zero test coverage.
- **Test suite is thinner than it looks.** 20 tests exist, but several are placeholders that assert nothing meaningful: `expect(createTurn).toBeDefined()`, `expect(noShowTurn).toBeDefined()` (`turnService.test.ts:38`, `:127-133`), a `getNextTurn` test that sets up mocks and then never calls the function (`terminalService.test.ts:26-52`). `adminService.ts` — the largest service, with cascading deletes and `servedBy` sync logic — has no test file at all.
- **No pagination** on `listSectors`/`listQueues`/`listTerminals` — fine at seed-data scale, will matter later.
- **Member identity** (`TotemView.tsx:12`) is `Math.random().toString(36)` in `localStorage`, not a stable or recoverable identifier.

## Suggested priority order

1. Firestore rules + function auth (security hole, and the Oct 31 rules expiry is an operational cliff, not just a risk)
2. Turn-numbering collision fix (#1 above) — silent data corruption under normal use, not just an edge case
3. `handleNoShow` transaction bug (#3) — data corruption under contention
4. Fill in real tests for `adminService` and the ratio-based dispatch algorithm before touching either
5. Everything else in "other things worth fixing" is low-risk cleanup, do opportunistically
