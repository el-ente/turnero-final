# Turnero — Cross-Cutting Consistency Audit (2026-08-24)

## Why this pass is different

`functional-ux-review-2026-08-24.md` (same day, earlier pass) reviewed each view against a checklist of UX gaps (missing features, dead ends, no-confirm actions) — reading files in isolation. That method caught real gaps but missed the Totem-navbar issue, which only surfaces by asking "what category of view is this, and is it treated consistently with its peers?"

This pass uses that method deliberately: (1) group views by audience (public/unattended vs staff/authenticated) and check the layout treats them consistently, (2) for every on/off toggle exposed in Admin/Terminal, trace it from the UI control down into the Cloud Function that's supposed to enforce it, instead of trusting that a control existing means the rule is enforced. All findings below are verified against current source, not inferred.

---

## 1. Sector deletion cascades past the active-turns guard — orphans live tickets

**Resolved** — `02f2414` added the same active-turns guard `deleteSector` was missing.

`deleteQueue` (`functions/src/services/adminService.ts:152-180`) blocks deletion when the queue has any `waiting`/`called`/`attending` turn (`ConflictError("Cannot delete queue with active turns")`).

`deleteSector`'s cascade (`adminService.ts:42-88`) batch-deletes every queue in the sector **without that same check**. Turn docs aren't touched by the cascade — so if a queue in the sector has an active ticket:
- the queue doc is deleted and stripped from every terminal's `activeQueueIds`
- the turn doc survives, still `status: "waiting"`, still pointing at a `queueId` that no longer resolves
- no terminal will ever query for it again (its queue is gone from every `activeQueueIds`), so it can never be called
- a customer watching that ticket on `/mi-turno/{id}` (`WebTicketView.tsx`) just keeps seeing "esperando" — no error, no explanation, forever

Same underlying business rule ("don't delete a queue out from under someone waiting"), enforced on one deletion path and not the other. Reachable from Admin → Sectores → Eliminar with zero warning that it can strand a customer's ticket.

## 2. Two operational toggles are UI-only, not enforced by the API

**Resolved** — `ed5281b` added server-side checks: `createTurn` now rejects closed queues (`active === false`), `getNextTurn`/`callTurn` now reject offline terminals.

**Queue "Cerrada"**: Admin's Activa/Cerrada toggle (`AdminView.tsx:176-182`) sets `queue.active = false`. The only place that flag is read is the client-side filter in `TotemView.tsx:37` and `WebTicketView.tsx:44` (`.filter(q => q.active !== false)`) — it just hides the queue from the picker. `createTurn` (`functions/src/services/turnService.ts:5-37`) never reads `active`; it only checks the queue document exists. A stale tab that already loaded the queue list, or any direct call to the create-turn endpoint, can still add tickets to a queue Admin believes is closed.

**Terminal "Pausar"**: `TerminalView.tsx:193` disables "Llamar siguiente" client-side via `canCallNext = ... terminal.status !== "offline"`. `getNextTurn`/`callTurn` (`functions/src/services/terminalService.ts:27-155`) never check `terminal.status` at all. A paused terminal can still be dispatched to via direct API call or a second stale tab on the same terminal.

Same root cause both times: the state that looks like a business rule ("this queue/terminal is closed") only lives in the frontend's rendering logic, not in the write path. Worth a deliberate decision on whether these need backend guards, since right now they're UX affordances a determined or buggy client can bypass.

## 3. The app has one layout for two audiences, and it's applied inconsistently

**Resolved** — Totem was already fixed same-day (`c0f9e19`, bare top-level route, no wrapper). `/mi-turno` and `/login` got the same treatment (bare top-level routes, sibling of `/`/`/display`) instead of a new shared `PublicLayout` component: both views already render their own self-contained branding header, so a wrapping layout component would have just duplicated chrome. Same outcome (no staff nav on public routes) via the simpler, already-proven mechanism.

`App.tsx` has exactly two layout states: the `nav`-wrapped `/*` route (full staff navbar: Totem / Mi Turno / Pantalla Pública / Terminal / Admin + auth status) and `/display`, which opts out entirely for a fullscreen unattended kiosk.

Everything else defaults into the nav-wrapped layout regardless of audience:
- **Totem** (`/`) — unattended public kiosk, same category as `/display`, but inherits the full staff navbar. Already logged as a task (see `docs/local/tasks.md`).
- **`/mi-turno`** (WebTicketView) — public, frequently unauthenticated, yet shows Terminal/Admin links that dead-end at a login wall.
- **`/login`** — shows the same full nav (minus `AuthStatus`, since there's no user yet) to someone who by definition isn't signed in.

The existing 08-24 review flagged the symptom ("nav bar shows Admin/Terminal to everyone") as a role-based visibility fix. The actual shape of the problem is one level up: there's no "public-facing" layout distinct from "staff" layout — just "full staff chrome" or "no chrome at all." A `PublicLayout` (minimal branding, no staff links) covering `/`, `/mi-turno`, `/login`, alongside the existing staff layout for `/terminal*` and `/admin`, would fix all three call-outs at once instead of patching the navbar's link-visibility per role.

## 4. No terminal session ownership

`TerminalSelector.tsx:39-53` lets any staff member with access to a sector navigate straight to `/terminal/:id`. Nothing records or checks who currently has that terminal open — two cashiers can independently open the same terminal and both see "Llamar siguiente" enabled. Backend transactions (`terminalService.ts` `callTurn`) keep turn state itself consistent, so this isn't a correctness bug, but neither operator is told the counter is already staffed — confusing in practice (both think they're driving it), and worth a product call rather than a silent gap.

---

## Suggested priority

1 and 2 are data-integrity / business-rule bypasses — worth fixing regardless of product direction. 3 is a structural fix that closes three separate open items from the same-day review in one change. 4 is a product decision (is concurrent terminal access ever intentional, e.g. handoff during a shift change?) before it's a code change.
