# Turnero — Backend/Security Review (2026-08-24)

Independent re-audit of `functions/src/` against the 2026-08-04 review's findings, plus new ground (RBAC, `/mi-turno`, ratio dispatch, indexes). RBAC and Firestore rules are confirmed real and correctly wired — that part of the old review is resolved. This review does not repeat it.

## Status of the 2026-08-04 correctness bugs

| # | Old finding | Status |
|---|---|---|
| 1 | Turn-numbering collision | **N/A — domain changed.** `createTurn` no longer auto-generates a sequential ticket number; the caller supplies `memberNumber` (a self-entered id, 1–99999, validated `turnService.ts:10-12`). No counter, no collision class left. |
| 2 | Returned `createdAt` mismatch | **Fixed.** `turnService.ts:30-36` stores and returns the same `createdAt` instance, no separate midnight recompute. |
| 3 | `handleNoShow` non-atomic | **Fixed.** `terminalService.ts:224-287` now does every read/write through the single `transaction` object, including the requeue's waiting-list query (`:258-263`). |
| 4 | `callTurn` check-then-act race | **Fixed.** Status is read and validated inside the transaction (`terminalService.ts:126-134`) immediately before the write — a concurrent second caller now hits `ConflictError` instead of double-assigning. |
| 5 | Hooks-rule violation (`TerminalView.tsx`) | Not re-checked (frontend, out of this review's lane). |
| 6 | Ratio counters never reset / inconsistent | **Partially changed, still worth a look** — see below. |
| — | Test suite: placeholders, zero `adminService`/ratio coverage | **Fixed.** `adminService.test.ts` (352 lines), `terminalService.test.ts` (791 lines incl. dedicated `nextRatioCounterState` and `getNextTurnRatioBased` suites). No `toBeDefined`-only tests found anywhere in `__tests__/`. |

Ratio counter detail: increment now happens in `callTurn` (`terminalService.ts:148-156`), not `finishTurn`, and the reset condition (`nextRatioCounterState`, `:9-17`) resets both counters only once *both* have reached their configured ratio — this is more defensible than before. But a turn that's called-then-cancelled-via-noShow-without-requeue (config disabled or attempts exhausted) still counts against the ratio permanently since nothing decrements it — not a regression, just a pre-existing design gap now easier to see clearly. Low priority.

## New/current findings

### Security

**1. `getCurrentTurnHandler` and `createTurnHandler` are unauthenticated and unrestricted — full member-number enumeration.** `functions/src/controllers/turnController.ts:32-57`, `:6-30`
`GET .../getCurrentTurn?memberNumber=N` takes no auth and no ownership proof, returning *any* member's live ticket (queue, status, timestamps) for `N` in 1..99999. No rate limit, no App Check (`grep` for `appCheck`/`AppCheck` across `functions/` and `app/` returns nothing). A trivial script iterating 1..99999 dumps the full day's active-ticket state across every queue in seconds. Combine with `createTurn` (same file) accepting any `queueId`/`memberNumber` pair with no CAPTCHA/App Check/rate limit, and the same script can also mass-create tickets — this is the abuse surface the UX review flagged for `/mi-turno` (`app/src/views/WebTicketView.tsx:121`), but it's not `/mi-turno`-specific: Totem hits the identical public endpoint. Fix needs to be at the Cloud Function layer (App Check + per-IP/per-memberNumber rate limiting), not in the new view.
Effort: medium (App Check enrollment + a rate-limit layer, e.g. Firestore-backed token bucket or `firebase-functions` rate-limiter).

**2. `cancelTurnHandler` has no ownership check beyond knowing the `turnId`.** `functions/src/controllers/turnController.ts:59-83`
Firestore auto-IDs aren't easily guessable, so this is lower severity than #1, but any leak of a turn id (referrer header, shared screenshot, browser history sync from `/mi-turno/:turnId`) lets a third party cancel that ticket with zero auth. Worth a lightweight mitigation (e.g. require the `memberNumber` in the cancel body and check it matches) since the data's already on the turn doc.
Effort: small.

**3. `firestore.indexes.json` is empty while multiple production query paths need composite indexes.** `firestore.indexes.json` (just the template, `"indexes": []`)
Every one of these is a multi-field or range query that Firestore does not auto-index and will throw `FAILED_PRECONDITION` in production unless the index was created out-of-band via console (and thus isn't captured in IaC — drift risk on next environment/project):
- `turnService.ts:19-24` — `memberNumber ==`, `queueId ==`, `status in`
- `turnService.ts:40-46` — `memberNumber ==`, `status in`, `orderBy createdAt desc`
- `queueService.ts:4-13`, `:15-28` — `queueId ==`/`queueId in`, `status ==`, `orderBy queuedAt asc`
- `statsService.ts:45-49` — `queueId ==`, `createdAt >=` (range)
- `terminalService.ts:258-263` — `queueId ==`, `status ==`, `orderBy queuedAt asc` (inside the no-show transaction)
- `adminService.ts:158-161` — `queueId ==`, `status in`
If these indexes exist only in the live Firebase project console today, they're invisible to code review and will silently vanish on a fresh project/emulator run, breaking every one of the above at first use. Verify they're actually deployed, then commit them to `firestore.indexes.json` so `firebase deploy` keeps them in sync.
Effort: small (once confirmed missing, `firebase firestore:indexes` can bootstrap the file from what's live, or emulator query errors give you the exact index links to click).

**4. No guard against re-calling a terminal that's already serving a turn.** `terminalService.ts:116-160` (`callTurn`)
The transaction never checks `terminal.currentTurnId` before overwriting it with the new `turnId` (`:146`). Nothing server-side stops a second `callTurn` on the same terminal while the first turn is still `called`/`attending` — the orphaned turn is left dangling (never `finished`, never cleared), and stats/queue-length reads will silently miscount it as active forever. Currently relies entirely on the Terminal UI not offering the action; the endpoint itself doesn't enforce the invariant, so a stray script/replayed request/race breaks it.
Effort: small (one extra check inside the existing transaction).

**5. `Terminal.status` (`available`/`busy`) is dead data — `deleteTerminal`'s safety check never fires.** `shared/src/models/terminal.ts:20-24`, `adminService.ts:262-264`
Search across `functions/src/` shows `status: "available"` is set once at creation (`adminService.ts:208`) and never transitions to `"busy"` anywhere — `callTurn`/`startTurn`/`finishTurn`/`handleNoShow` in `terminalService.ts` only ever touch `currentTurnId`, never `status`. So `deleteTerminalHandler`'s `if (data.status === "busy") throw ConflictError` (`adminService.ts:262-264`) is unreachable: an admin can delete a terminal mid-service (with a customer already called/attending) with no pushback. Either wire `status` into the call/finish lifecycle, or drop the field and check `currentTurnId` directly in `deleteTerminal`.
Effort: small.

### Data integrity / correctness

**6. `getNextTurn` suggests a turn without reserving it.** `terminalService.ts:27-42`
Two terminals sharing overlapping `activeQueueIds` (e.g. both serving a shared normal queue) can be handed the *same* "next" turn by `getNextTurn`, since it's a plain read with no lock. This resolves safely today because `callTurn`'s transaction now re-checks status (fix #4 from the old review), so the loser gets a clean `ConflictError` — but the UI/operator experience is "click call, get an error," not prevented at suggestion time. Not a data-integrity bug anymore, just a UX/efficiency note for whoever owns the Terminal flow — flagging here since it touches the dispatch algorithms in this file.
Effort: n/a (no action needed unless the UX cost matters).

### Scalability

**7. `getWaitingTurnsAcrossQueues` uses Firestore `where(..., "in", queueIds)`.** `queueService.ts:15-28`, called from `terminalService.ts:45`, `:94`, `:99`, `:103`, `:108`
Firestore's `in` operator caps at 30 values. A terminal configured with >30 `activeQueueIds` will throw at query time. Fine at demo scale (a handful of queues per terminal), but there's no validation anywhere (`adminService.ts` `createTerminal`/`updateTerminal`) capping `activeQueueIds` length, so this is a landmine an admin could hit by misconfiguration, not just future scale.
Effort: small (validate length ≤30 in `adminService.ts`, or add batching if larger fleets are expected).

**8. `getNextTurnRatioBased` does a fresh queue-type lookup on every dispatch call.** `terminalService.ts:76-81`
Every "get next turn" click on a ratio-based terminal does a `where(FieldPath.documentId(), "in", activeQueueIds)` read to classify queues as normal/priority — data that's static until an admin edits the terminal. At demo scale it's noise; at real traffic (an operator clicking "next" every 30-60s per terminal, all day) it's a steady, avoidable read-cost multiplier. Cache it on the terminal doc (already has `strategyConfig`) or on `queueTypeById` with a short TTL.
Effort: small.

**9. No pagination on `listSectors`/`listQueues`/`listTerminals`.** `adminService.ts:23-26`, `:126-129`, `:220-223`
Still true from the old review; still low-risk at current scale (admin-only, small collections), flagging only because it wasn't fixed and will matter if sector/queue counts grow into the hundreds.
Effort: small, low priority.

### Minor / cleanup

**10. `createQueue`/`updateQueue`/`createTerminal`/`updateTerminal` still accept loosely-typed `Record<string, any>` bodies with no schema validation beyond a few explicit field checks** (`adminService.ts:92-124`, `131-150`, `184-218`, `225-254`). `reenqueueConfig`, `strategyConfig`, `sectorIds`/`activeQueueIds` arrays are passed through untyped and unvalidated (no check that array elements are strings, that `reenqueueConfig.maxAttempts`/`positionsBack` are sane non-negative numbers, etc.). Garbage here lands directly in Firestore and can break `handleNoShow`'s math (`terminalService.ts:265-267`, e.g. negative `positionsBack`) or `getNextTurnRatioBased`'s ratio math (division by `normalQueueRatio + priorityQueueRatio` — zero/negative ratios aren't rejected, `terminalService.ts:66`, `:69`, so a bad admin config can produce `NaN`/`Infinity` comparisons silently). Since only `ADMIN` can hit these endpoints the blast radius is small, but it's a single bad config away from silently wedging the dispatch algorithm.
Effort: small-medium (add a validation pass — even a hand-rolled one — for the numeric/array shapes before writing).

## Priority order

1. #1 member-number enumeration / unauthenticated flood on `createTurn`+`getCurrentTurn` — real abuse surface, exploitable today, no code changes needed to demonstrate it
2. #3 verify/commit the missing composite indexes — could already be silently broken in a fresh deploy or about to break on the next `firebase deploy` that touches indexes
3. #4 and #5 (terminal call/delete guards) — cheap, closes real data-integrity gaps
4. #2 cancel-by-id ownership check — cheap, closes a minor leak vector
5. #6–#9 — opportunistic, no urgency at current scale
6. #10 — do alongside any other admin-service touch, not urgent standalone
