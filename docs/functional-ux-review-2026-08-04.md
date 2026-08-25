# Turnero — Functional & UX/UI Review (2026-08-04)

Functional-analyst pass over the four screens: what the system lets a user do, where the flow breaks down or leaves them stuck, and where the interface could communicate more clearly. Separate from the earlier code review (`app-review-2026-08-04.md`, correctness/security) and the visual redesign (this session) — this is about behavior and workflow, verified against the running app.

---

## Totem (customer self-service)

**1. Shared-kiosk identity model doesn't fit a shared kiosk.** `getOrCreateMemberId` stores the customer's identity in the *device's* `localStorage` (`TotemView.tsx:9-15`). That's correct for a personal phone, but "Totem" implies a physical kiosk multiple customers share. On mount, the app checks for an existing active turn tied to that stored ID and — if found — immediately shows *whoever used the kiosk last*, not a fresh ticket screen (`TotemView.tsx:53-68`). A second customer approaching the totem while the first person's ticket is still `waiting`/`called`/`attending` sees a stranger's ticket and has no way to take their own. It only clears 5 seconds after the previous ticket resolves. On a real shared device this blocks the line. Worth deciding: is Totem meant to be one-device-per-customer (phone, in which case this is fine) or a physical shared kiosk (in which case identity needs to reset per interaction, e.g. a "not you? start over" affordance, or a session that expires when the customer walks away)?

**2. No way to cancel your own turn.** Once taken, a ticket can only be watched, not withdrawn. If a customer changes their mind, the ticket sits `waiting` until staff eventually calls it and it goes unanswered — consuming a No-Show cycle instead of just freeing the slot immediately.

**3. No queue position or wait estimate.** The customer sees their own number and status, but not "3 people ahead of you" or an estimated wait. `getQueueStats` already computes `waitingCount` and `avgWaitTimeSeconds` for Admin — the same data would directly answer the question every waiting customer has.

**4. Accessibility priority is opt-in and easy to miss.** Priority routing depends entirely on the customer picking the right queue from a plain list (now correctly labeled "Atención Prioritaria" rather than "VIP" — see prior fix). Nothing on the totem explains *who* that queue is for, so it relies on the customer self-identifying correctly from the label alone. A short explanatory line ("personas mayores, embarazadas, con discapacidad") next to that option would reduce misuse in both directions — able-bodied customers taking the fast lane, or eligible customers not realizing it's for them.

---

## Public Display (waiting-room screen)

**5. Shows a raw terminal ID, not a name.** `{currentTurn.terminalId || "—"}` (`PublicDisplay.tsx:60,78`) renders the literal document ID (`terminal-1`) instead of the human-readable name (`Módulo 1`) that Admin and Terminal both use. A customer watching the board has no way to know which physical counter `terminal-1` refers to. This needs a `terminals` listener (the same pattern `TerminalSelector.tsx` already uses) to resolve ID → name.

**6. Silent-only alerts.** A new call is purely visual (number swap + subtle animation). Waiting-room displays are background furniture — people are on their phones, not watching the screen. No chime/tone means called customers who aren't looking miss it entirely, which is the display's whole job. Even a simple audio cue on state change would help.

**7. No sense of overall queue depth.** The display shows who's being served and the next 5 called — but nothing about how many people are still waiting behind them, so someone walking in can't gauge whether it's worth waiting at all.

**8. Single global feed, no per-sector view.** All turns across every sector feed into one "now serving" panel. That's fine for one location with one waiting area, but if `Perfumería` and `Atención General` are physically separate areas (which the data model's sector concept implies), a shared customer in one area currently sees calls for a counter they're not waiting for, with no way to filter the display to just their sector.

---

## Terminal (operator console)

**9. Pull and call are two separate steps with no explanation of why.** "Próximo turno" fetches a candidate; "Llamar" is a second click to actually announce it. If this separation is intentional (letting an operator glance at who's next before committing), that's reasonable — but nothing in the UI communicates that's the reason, so it reads as friction rather than a deliberate hold-before-call step. Worth confirming this is the intended workflow, or collapsing it to one action if not.

**10. A lost race gives a dead end, not a retry.** If two terminals are both fed the same next turn (a real possibility — `getNextTurn` only reads, it doesn't reserve), the loser's `Llamar` click surfaces a raw `ConflictError` toast and nothing else. The operator has to manually click "Próximo turno" again to get a different candidate. The UI already knows this failure mode is possible; it could recover automatically by re-fetching instead of leaving the operator to figure out what to do next.

**11. `terminal.status` (available/busy/offline) is decorative.** It's set once at creation in Admin and never updated by anything — `callTurn`/`finishTurn`/etc. never touch it, and there's no control in the Terminal UI to change it either. The colored status dot on `TerminalSelector` (and the pill in Admin) therefore shows stale, meaningless state. Either wire it to real activity (auto-`busy` while attending, `available` when idle) or add an explicit operator control for it (e.g. "Salir / Pausa") — right now it's UI that lies.

**12. No confirmation on "No presentó."** Every destructive action in Admin (delete sector/queue/terminal) goes through a confirmation modal. In Terminal, "No presentó" — which either bumps the customer back in line or cancels them outright depending on config — fires immediately on click, with no undo. A misclick against a customer who's mid-conversation with staff has real consequences (they lose their place or get cancelled).

**13. No way to look up a specific ticket.** If a customer says "I have number 7 but the app crashed," staff has no lookup — only the current turn and the next-10 waiting list are visible. There's no search-by-number for support situations.

---

## Admin (back office)

**14. New-installation dead end.** Sectors, queues, and terminals have a strict dependency order (a queue needs a sector; a terminal references queues). A first-time admin landing on the "Colas" tab with zero sectors sees the empty-state CTA ("Creá la primera"), opens the modal, and hits an empty/unusable sector dropdown with no hint to go create a sector first. There's no guided setup order or cross-linking between the empty states (e.g. the Queues empty state, if no sectors exist yet, could say so and link to the Sectores tab instead of assuming one exists).

**15. No way to pause a queue or terminal without deleting it.** Queues and terminals are permanent once created — no "closed for lunch" / inactive toggle. A queue that needs to temporarily stop accepting new turns (end of day, staff shortage) has to either stay open or be deleted and rebuilt later, losing its `reenqueueConfig` and `servedBy` links in the process.

**16. Stats are single-queue and today-only.** No cross-queue overview (a manager wants "how's the whole floor doing right now," not four separate lookups), and no historical range — only "today." No trend visibility means yesterday's bad day is invisible by the time anyone checks.

**17. No role separation.** Everything under `/admin` is reachable by anyone who can reach the route (this overlaps with the security gap already flagged separately, but functionally: there's no distinction between an operator who should only touch Terminal and an admin who should configure the system — one flat surface for both).

**18. Form validation is silent.** The only feedback for an invalid form is a disabled Save button — no inline message explaining *why* it's disabled (empty name, no sector picked). A user who doesn't notice the button is greyed out gets no signal at all.

---

## Cross-cutting

**19. No loading state distinct from empty state.** Every list (`queues`, `terminals`, `sectors`) starts as `[]` and stays that way until the fetch resolves — so on a slow connection, the real empty-state UI ("Todavía no hay colas...") flashes before actual data arrives, which is misleading on first paint.

**20. No visible keyboard focus styling anywhere.** All interactive elements rely on browser-default focus rings (or none, depending on the browser/OS). For a system that includes an admin back-office, keyboard navigability and visible focus are worth a deliberate pass rather than leaving it to defaults.

**21. Notification is entirely screen-based.** Nothing pushes information *to* the customer — no "you're 2 away" ping, no way to step away from the waiting room and come back. The `channel` field already has `whatsapp`/`mobile` variants defined in the type system for exactly this, unimplemented. Even a narrower version — a browser push/SMS when the customer is next — would meaningfully change the waiting experience without building the full WhatsApp intake channel.

---

## Suggested priority

Grouped by effort vs. impact, not by section:

- **High impact, likely small**: #5 (terminal name on Display), #2 (cancel own turn), #12 (confirm No-Show), #3 (show queue position/wait estimate) — all additive, don't touch existing flows.
- **Needs a product decision first**: #1 (Totem shared-kiosk identity) — this shapes how much work the fix is; worth deciding the intended device model before touching code.
- **Medium effort, real operational gaps**: #10 (retry on dispatch conflict), #11 (make terminal status real or controllable), #15 (pause instead of delete), #14 (guided setup order).
- **Larger/roadmap-shaped**: #16 (cross-queue + historical stats), #17 (role separation, overlaps the deferred security work), #21 (push notifications).
