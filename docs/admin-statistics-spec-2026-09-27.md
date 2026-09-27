# Estadísticas / Statistics — First-Pass Spec

**Date:** 2026-09-27
**Status:** draft for discussion, not approved
**Author:** functional analyst (subagent pass)

## 0. Correction to the framing

This is **not** a brand-new feature area. It's a generalization of something that already exists:

- `GET /getQueueStats?queueId=...` (`functions/src/services/statsService.ts`) already returns, live, for **one queue, today only**: counts by status (waiting/called/attending/finished/no_show/cancelled), total created today, and `avgWaitTimeSeconds`.
- Admin already surfaces this as a "Estadísticas" tab (`app/src/views/AdminView.tsx`), reached by clicking "Stats" on one queue at a time — a flat grid of numbers, no chart, no history, no cross-queue view.
- Both `admin` and `supervisor` roles are already allowed to call it (`requireRole([ADMIN, SUPERVISOR])`); `cajero` is not.

So the real ask is: **widen scope (multi-queue/sector, date range, deeper metrics) of an existing narrow view**, not build stats from zero. That changes the effort estimate — some of this ships cheap by extending what's there; the historical/trend part is the genuinely new, genuinely costly piece (see §4).

## 1. Value read

- **Who**: admin today (confirmed consumer); supervisor has read access to the same endpoint already but no dedicated UI for it (README roadmap flags this as a known gap, unrelated to this ask). Cajero currently has zero visibility into stats, even for their own assigned sector.
- **Why**: the current view answers "how is *this one queue* doing *right now, since midnight*?" It cannot answer "which sector is overloaded," "is Tuesday afternoon worse than Monday morning," "is cashier X slower than cashier Y," or anything spanning more than the current calendar day (Argentina timezone) — because it's an un-persisted live scan of `turns`, not a report.
- **Why now**: no external trigger evident from the code/README (no complaint ticket, no support-load doc). This looks like a "we should be able to answer basic operational questions" ask, not a fix for a broken workflow. Worth confirming with the user whether there's a concrete question driving it (e.g. "we need to justify adding a terminal to Sector X") — the shape of the answer changes a lot depending on whether this is for daily floor management (today's admin, in real time) or for monthly capacity-planning review (historical, batch).

## 2. Brainstorm — what "statistics" could mean here

| Shape | What it is | Cost | Tradeoff |
|---|---|---|---|
| **A. Operational-today dashboard** | Generalize the existing per-queue "Stats" tab into a cross-queue/cross-sector view, still scoped to "today," still live-queried (no new collection) | Low — extends `statsService.ts` query pattern, no schema change | Fast to ship, matches existing precedent. Doesn't answer any question about yesterday, last week, or trends. |
| **B. Historical/trend reporting** | Date-range picker, busiest-hour/day view, week-over-week comparison, per-terminal throughput over time | High — needs the aggregate/rollup collection the user already flagged as the working hypothesis, and a decision on write path (instrument every turn-mutating transaction, or a scheduled daily snapshot job) | This is where the real value likely is (capacity planning, staffing decisions) but it's a genuine new subsystem, not a UI tweak. |
| **C. Live floor-monitoring/alerting** | Real-time SLA view for supervisors — "avg wait right now is above threshold," idle terminals — refresh-driven like Display/Terminal, not a report you pull up | Medium, different UI pattern entirely (push, not pull) | Solves a different problem (in-the-moment staffing) than "stats section." Likely scope creep for a first cut unless explicitly wanted. |

**Recommendation**: ship **A first** (cheap, extends existing code/pattern, immediately useful), treat **B** as an explicit phase 2 the user should sign off on separately once the aggregate-collection design is settled (out of my scope per the brief — flagging it exists, not designing it). Leave **C** out unless the user says the real need is real-time floor supervision, not reporting.

## 3. User stories

Grounded in what `Turn` actually records (`id, memberNumber, queueId, queuedAt, status, channel, recallCount, createdAt, calledAt?, attendingAt?, finishedAt?, lastRequeueAt?, lastRecallAt?, terminalId?`):

1. **As an admin**, I want turn counts and status breakdown across *all* queues in a sector (not one queue at a time), so I can see sector-level load without clicking into each queue individually.
2. **As an admin/supervisor**, I want **average wait time** (`createdAt → calledAt`) *and* **average service time** (`attendingAt → finishedAt`) shown separately per queue, so I can tell "customers wait too long to be called" apart from "attention itself is slow" — today only wait time is computed; service time isn't computed anywhere.
3. **As an admin**, I want per-terminal turn counts (using `Turn.terminalId`, written by `callTurn`) for a chosen queue/sector, so I can see whether one terminal/cashier is a bottleneck relative to others serving the same queue.
4. **As an admin**, I want a "busiest hour of day" view (e.g. across the last N days) to help with staffing decisions — **this requires the historical rollup (Shape B)**; a live scan over raw `turns` gets slower and more expensive as the collection grows with no retention policy today.
5. **As an admin**, I want a no-show/abandonment rate — **flagged as not currently deliverable honestly**: `handleNoShow` never writes `TurnStatus.NO_SHOW` (confirmed dead code path, per the comment in `shared/src/models/turn.ts`); a no-show either gets silently requeued back to `waiting` (indistinguishable from a turn that was never called late) or written as `CANCELLED` — the same status a customer's own voluntary `cancelTurn` produces. **Any "no-show rate" built today would silently conflate operator no-shows with customer self-cancellations.** This needs a data-model fix (actually write a no-show marker) before it can be a real metric, not a UI decision.

## 4. Functional requirements (Shape A — the recommended first cut)

1. Admin and supervisor can view stats for a chosen sector, aggregating all queues in that sector (in addition to the existing single-queue view — not replacing it).
2. Stats view shows, per queue and rolled up per sector: total created, counts by status (waiting/called/attending/finished/cancelled — no_show excluded per §3.5 until fixed), average wait time, average service time.
3. Stats are scoped to "today" (Argentina midnight, same convention as the existing `getTodayMidnightInArgentina`) for v1 — no date-range picker yet (that's Shape B).
4. Per-terminal breakdown: for a selected queue, show turn counts and avg service time grouped by `terminalId`.
5. Access stays as-is: `admin` and `supervisor` only. (Open question below on whether cajero should see their own sector.)
6. No new persisted collection for v1 — all computed live from `turns`, same pattern as today's `getQueueStats`.

## 5. Acceptance criteria

- [ ] Given a sector with 2+ queues, when an admin opens sector stats, then they see combined totals plus a per-queue breakdown, without navigating queue-by-queue.
- [ ] Given a finished turn with `attendingAt` and `finishedAt` set, when stats are computed, then avg service time reflects `finishedAt - attendingAt` in seconds, separate from avg wait time.
- [ ] Given turns served by 2 different terminals on the same queue, when the per-terminal view is opened, then counts and avg service time are shown split by `terminalId`.
- [ ] Given a turn with no `terminalId` (never called), it is excluded from the per-terminal breakdown, not counted as a phantom "unknown terminal."
- [ ] Given a supervisor (not admin), stats views are reachable and return the same data an admin sees.
- [ ] Given a cajero, stats endpoints continue to return 403 (unchanged) unless the open question below is resolved otherwise.
- [ ] No UI element in v1 claims to report a "no-show rate" or "no-show count" — that number is not honestly computable today.

## 6. Edge cases

- Sector with zero queues or zero turns today → show explicit zero-state, not an error.
- Queue that has turns but no *finished* turns today → avg wait/service time shows "—" or "n/a", not `0` (0 would misleadingly imply instant service).
- Turn requeued via `handleNoShow` (back to `waiting`, `queuedAt` bumped forward) and later finished normally same day → counts once as `finished`, with wait time measured from the *original* `createdAt` (already the existing behavior in `getQueueStats`) — worth confirming this is the intended semantic for "wait time" (time since ticket issued, including any no-show detour) vs. "wait time since last requeue."
- Terminal reassigned to different queues mid-day (`reassignTerminalQueues`) — per-terminal stats for "today" would span both old and new queue assignments; a terminal's turn count for queue X today is still accurate (turns keep their `terminalId`), but the UI shouldn't imply the terminal was dedicated to that queue all day.
- Multi-sector terminal (`Terminal.sectorIds` is an array) — per-terminal breakdown inside a single-sector stats view should only count turns from queues in *that* sector, not the terminal's total across all its sectors.

## 7. Data/API/business-rule impact

- **v1 (Shape A)**: no data model change. New/extended endpoint(s) in `statsService.ts`/`adminController.ts` (e.g. a sector-scoped variant of `getQueueStats`, or a param to aggregate multiple `queueId`s). **README.md's API Endpoints section and the Bruno collection must be updated in the same change** per CLAUDE.md — this is a real API surface change even without a schema change.
- **Shape B (historical/trend)**: real data-model impact — new aggregate/rollup collection, and a decision on whether it's written incrementally (extra write in every turn-mutating transaction: `createTurn`, `callTurn`, `finishTurn`, `handleNoShow`, `cancelTurn`) or via a scheduled daily snapshot job. Explicitly flagging this exists; not designing it here per the brief.
- **No-show metric**: requires actually writing `TurnStatus.NO_SHOW` (or an equivalent explicit marker) somewhere in `handleNoShow`'s requeue-exhausted branch, distinct from customer-initiated `CANCELLED`. This is a business-rule change to an existing, tested code path (`terminalService.test.ts` likely asserts current behavior) — flagging, not proposing the fix.

## 8. Open questions for the user

- Who consumes this — admin only, or does supervisor get a dedicated UI too (README already flags supervisor lacks any UI for capabilities it's authorized for)? Should cajero see stats scoped to their own `assignedSectorIds`?
- Is there a concrete question driving this (staffing justification, SLA reporting to someone external) that should shape which metrics matter most — or is it exploratory?
- Time granularity: is "today" (Shape A) enough for v1, or is the historical/trend piece (Shape B, busiest hour, week-over-week) the actual point of the ask, making Shape A a detour?
- Does any manual process exist today (someone eyeballing the Firestore console, a spreadsheet) that this is meant to replace? If so, what does that process currently report, as a sanity check on scope?
- Is a real no-show metric (vs. today's conflated cancelled/requeued) a must-have for v1, or acceptable to ship without it and fix later?

## 9. Management decision-value framing (pass 2)

Reframing away from "what's buildable" to "what does gerencia — sector/branch management, not the operators running Totem/Terminal day-to-day — need to actually decide." Ranked by decision impact. Known technical constraints (no-show conflation, missing service-time calc, `terminalId` already on `Turn`) are cited only as enablers/blockers, not re-derived.

**1. No-show rate vs. voluntary cancellation rate, split by *when* the customer left the process (cancelled while `waiting` vs. no-show after being `called`)**
- *Decision enabled*: these diagnose two different problems with two different fixes. High cancel-while-waiting → customers give up before being served, which is a capacity/wait-time problem (add a terminal, reduce demand, change hours). High no-show-after-called → the paging/floor process is broken (display not visible, no sound, tolerance window too short), which is an operations fix, not a staffing one. Today gerencia can't tell these apart at all.
- *Cadence*: weekly/monthly to justify a structural change; a daily figure has too much noise to act on for either decision. Phase 2 territory.
- *Cost of not having it*: total blind spot — not "imprecise," genuinely invisible. `TurnStatus.NO_SHOW` is dead code today, so this isn't even a matter of asking the right query; the underlying fact isn't recorded. Gerencia currently has no way to know if the queue is silently losing customers, let alone why.

**2. Wait-time and service-time trend by sector/queue, over weeks**
- *Decision enabled*: the core "staff this sector differently" / "add a terminal" / "change operating hours" call. A single day's average is not enough to justify budget for a new terminal or a shift change — gerencia needs to see a sustained pattern, not a snapshot.
- *Cadence*: weekly/monthly. Note the mismatch: the ingredients (wait/service time per queue) are computable *today, live* (Shape A / phase 1), but the *decision* itself only becomes justifiable once you can see it trending over time (phase 2's rollup). Shipping phase 1 alone gives gerencia a number to look at, not a decision to make.
- *Cost of not having it*: decisions get made on anecdote or complaint volume ("people say Farmacia is slow") instead of a measured, sustained pattern — risk of over/under-correcting based on a bad week or a vocal customer rather than reality.

**3. Per-terminal / per-operator service-time comparison, over weeks**
- *Decision enabled*: spot a consistently underperforming terminal/operator (retrain, reassign) vs. a structurally overloaded queue (everyone assigned to it is slow, not just one person) — different diagnosis, different action. Also the evidence needed to justify moving a terminal from an underused sector to a busy one.
- *Cadence*: monthly comparison across operators — a single bad day is normal variance, not signal. Phase 2.
- *Cost of not having it*: gerencia can't distinguish "this specific cashier is slow" from "this queue is just hard," so performance conversations, if they happen at all, are based on manager impression/floor-walking rather than data. `terminalId` is already recorded on `Turn` (confirmed), so this is a rollup/aggregation gap, not a data-capture gap.

**4. Busiest hour-of-day / day-of-week, by sector**
- *Decision enabled*: reallocate terminal coverage by time block (e.g. extra terminal Monday mornings, one fewer Sunday afternoon) — a scheduling decision, not a headcount decision.
- *Cadence*: monthly/seasonal review of a pattern built from many days. Squarely phase 2 — a live "today" view cannot answer "is this hour typically the busiest," only "is this hour busy right now."
- *Cost of not having it*: shift schedules get set once and never revisited, or revisited by gut feel — likely mismatched to real demand peaks, either idling a terminal or leaving a queue understaffed at predictable times.

**5. Sector/queue volume comparison, today (live)**
- *Decision enabled*: lowest-impact item here — mostly situational awareness ("is PAMI busier than Perfumería right now") rather than a standalone decision. Useful as context alongside #2, not on its own.
- *Cadence*: daily/live — this is the one candidate that's actually well-served by a live dashboard. Phase 1, ships now, no schema change (§4).
- *Cost of not having it*: today this exists but is buried one queue at a time; gerencia (or a supervisor on their behalf) would have to click through every queue to reconstruct a same-day picture that a single combined view would show at a glance. Low cost today, but cheap to fix — good phase-1 filler, not the pitch's main event.

**Not worth building now**: channel breakdown (`totem`/`whatsapp`/`mobile`) — WhatsApp isn't built and mobile isn't a channel yet, so this dimension has no variance to report on. Terminal idle/utilization over time — would need tracking terminal status history, which doesn't exist at all today (bigger gap than anything above, flagging only, not scoping).

**Bottom line to pitch**: the decisions gerencia actually cares about (#1–#4) are gated on the phase 2 rollup and, for #1 specifically, on fixing the no-show data-capture bug first — not on Admin UI work. Shipping phase 1 (extend today's live view, §4) is cheap and worth doing, but it mostly delivers #5, the lowest-impact item on this list. If the goal is genuine management decision support rather than a nicer today-view, the honest recommendation is to treat the phase 2 rollup design + the no-show fix as the real project, and phase 1 as a small, separate, low-stakes warm-up.
