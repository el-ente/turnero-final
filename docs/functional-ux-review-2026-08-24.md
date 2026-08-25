# Turnero — Functional & UX/UI Review (2026-08-24)

Refresh of `functional-ux-review-2026-08-04.md` and `app-review-2026-08-04.md` against the app as it stands today (post RBAC/auth, post Totem reset-flow change). Verified against source, not against the old docs' claims — several of those are now stale and are marked fixed below rather than repeated.

---

## Fixed since 2026-08-04 (no longer issues)

- **Totem shared-kiosk identity (#1)** — resolved, then re-solved differently. `localStorage`-based identity is gone; customer now types a member number each time. As of today's change, Totem also auto-resets to number-entry a few seconds after issuing a ticket (and on idle), so the kiosk is free for the next customer without a manual "not you?" tap.
- **Terminal shows raw ID, not name (#5)** — `PublicDisplay.tsx` now renders `terminal.name` and a resolved sector label, not the document ID.
- **Pull/call two-step friction (#9)** — `handleCallNext` in `TerminalView.tsx` now pulls and calls in one action.
- **Dispatch conflict dead end (#10)** — same function auto-retries (`handleCallNext()` recurses) on a losing race instead of surfacing a raw error.
- **Terminal status decorative (#11)** — operators now have an explicit Pausar/Reanudar control (`term-pause-btn`), and it drives real `available`/`offline` state.
- **No confirm on "No presentó" (#12)** — two-step confirm (`confirmingNoShow`) is in place.
- **Admin new-install dead end (#14)** — empty states now cross-link ("Primero necesitás un sector" → "Ir a Sectores →", same pattern for terminals needing queues).
- **No pause without delete (#15)** — queues have an Activa/Cerrada toggle in Admin; terminals have Pausar/Reanudar in Terminal. Neither requires deleting the entity.
- **No role separation (#17)** — full RBAC now exists: `/admin` gated to `ADMIN`, `/terminal` to any staff role, cashiers scoped to `assignedSectorIds` via `canAccessTerminal`, with a graceful "no tenés permiso" message rather than a crash.
- **No loading state distinct from empty (#19)** — Admin now shows an explicit "Cargando..." before the real empty/data state.
- **Firestore rules / function auth (app-review #security)** — real rules keyed off `request.auth` and `requireRole` guards on every mutating endpoint, not the `allow write: if false`-bypassing "allow all" from the old review. The Oct-31 rules cliff mentioned in the old doc is gone.

Good sign: nearly every "high impact, small effort" and "needs a product decision" item from the last review has actually landed.

---

## Still open

**Totem**
- **No way to cancel a mistaken/abandoned ticket.** This was already true before today's change and remains true after it — today's change was scoped narrowly to kiosk turnaround speed. Explicitly accepted as a gap for now (per this session's discussion): more intake channels are coming, and self-service cancel likely belongs on one of those rather than back on the totem. Worth revisiting once a phone/web channel exists, since right now a bad ticket can only be cleared by staff calling it and marking no-show.
- **No queue position or wait estimate anywhere in the app**, not just on Totem — see Public Display below. `getQueueStats` computes `waitingCount`/`avgWaitTimeSeconds` already, just not surfaced anywhere a waiting customer can see it.
- **Priority queue still unexplained on first glance.** The queue list shows a "Prioritaria" tag but nothing describing who it's for until you're already deep in the flow (`totem-priority-note` only appears once that queue is selected). A customer scanning the list doesn't get the context before choosing.

**Public Display**
- **No overall queue depth.** Shows who's being served per terminal, nothing about how many are waiting behind them. Someone walking in still can't gauge the wait.
- **Silent-only alerts, no per-sector filtering** — both still true as in the last review; not reverified line-by-line this pass but nothing in the diffs since 08-04 touches this.

**Terminal**
- **No way to look up a specific ticket by number.** Still only "current turn" + next-10 waiting are visible — no search-by-number for the "I have number 7, the app crashed" support case.
- **Nav bar shows Admin/Terminal links to everyone regardless of role.** A cashier sees an "Admin" tab, clicks it, and only then learns they can't use it (`RequireAuth`'s "No tenés permiso" message). Minor, but the nav could just hide links the signed-in role can't reach instead of exposing then denying.

**Admin**
- **Stats are still single-queue, today-only.** No cross-queue "how's the floor doing right now" overview, no historical range. Confirmed by re-reading the Stats tab render — one queue at a time, values come straight from a single `getQueueStats(queueId)` call, no date picker.
- **Form validation is still silent** — Save buttons disable on invalid input with no inline reason shown (not reverified against every modal this pass, but nothing suggests this changed).

**Cross-cutting**
- **No visible keyboard focus styling** beyond the odd default browser ring / one `:focus` rule on Totem's number input. Worth a deliberate pass given Admin is a real back-office surface now with more forms than before.
- **Notification is still entirely screen-based.** `channel` supports `"whatsapp"`/`"mobile"` in the type system, nothing implemented yet (tracked as README Phase 14/15, and as the WhatsApp plan docs already in this repo).

---

## New channel: a web page to pick a ticket — shipped

Originally written up here as a concept; now implemented at `/mi-turno` (`app/src/views/WebTicketView.tsx`). Third intake channel alongside Totem (in-person kiosk) and the planned WhatsApp flow, using the `"mobile"` channel literal that already existed in `Channel` but was unimplemented until now.

**Why it's a different problem than Totem, not a reskin of it.** Totem's whole design (as of today) optimizes for kiosk turnaround: strip away tracking, reset fast, assume the next person at the tablet is a stranger to whatever just happened. A web page is the opposite shape — one visitor, on their own device, who's going to sit with that tab open (or come back to it) for the whole wait. So the state-tracking and cancel functionality intentionally *removed* from Totem today is exactly what belongs here instead:

- Pick a queue, get a ticket — same `createTurn` call, `channel: "mobile"`.
- **Live status while waiting**: position in queue, "you're being called," a way to actually see progress — the `onSnapshot` + `aheadCount` logic just deleted from `TotemView` is a near-exact fit for this page, just moved to a context where lingering on one customer's turn is correct, not a bug.
- **Self-service cancel** — closes the gap flagged above. This is the one place it's safe: it's the customer's own device and own tab, no "who's cancelling whom" ambiguity like a shared kiosk would have.
- **Identity**: needs a stable way to reload the same ticket if the tab closes — a shareable/bookmarkable URL (e.g. `/t/{turnId}` or a short code) beats re-typing a member number, since a phone browser isn't a shared device the way Totem is.
- **Notification** is the real value-add over Totem: a browser push or at minimum a loud on-page/audio cue when called, since the customer isn't standing in front of a screen watching Public Display — this is the "even a narrower version" push-notification idea from the prior review, now with a concrete home.

**What it does:** `/mi-turno` — number entry → queue pick → `createTurn(..., "mobile")` → redirects (`replace`) to `/mi-turno/{turnId}`, which subscribes directly to that turn doc via Firestore `onSnapshot` (turns are already publicly readable, so no new backend endpoint was needed) and shows live status, queue position (`aheadCount`, same query Totem used to run), and a self-service cancel button (reuses the existing, already-built `cancelTurn` API — it had gone unused once Totem stopped calling it). Reloading the bare URL later re-subscribes and shows the same ticket — verified by hard-reloading the exact `/mi-turno/{id}` URL in a fresh page load. A bogus/expired id shows a "no encontramos ese turno" state with a way to start over. No backend or API-surface changes, so no README/Bruno updates were needed.

**Still open** (not addressed in this pass, worth a follow-up):
- Auth/abuse: nothing gates who can call `createTurn` — a web page makes it trivially scriptable to mass-create tickets. Worth a lightweight guard (e.g. one active ticket per browser/session) later. Not worse than Totem's existing exposure today, so not blocking.
- Notification (push/audio when called) — the real differentiator over Totem — isn't built yet; today the customer still has to keep the tab visible or check back.
- Same priority-queue clarity problem as Totem applies here too, probably worse on a small phone screen.
- Does this replace or sit alongside a future native "mobile app" (README Phase 15)? Worth deciding once this is in use.
