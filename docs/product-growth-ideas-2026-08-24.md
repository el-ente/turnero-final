# Turnero — Product & Growth Ideas (2026-08-24)

Independent brainstorm, business-value focus (not UX polish — see `docs/functional-ux-review-2026-08-24.md` for that). Grounded in the actual data model (`shared/src/models/*.ts`), `statsService.ts`, and `AdminView.tsx` as they exist today. Does not re-propose anything already scoped in `docs/whatsapp-integration-plan-2026-08-11.md` / `-v1-...md`.

Two facts shape most of this list:
1. **No `Business`/`Location` entity exists.** `Sector` has no address/location field; each Firebase project (`dev`/`qa`/`prod`) is an environment, not a tenant. Today's model fits exactly one physical site.
2. **`memberNumber` is not an anonymous ticket number — it's the customer's own ID**, reused across visits and not reset daily. That's unusual for a queue system and is the biggest untapped asset in the schema (see #5).

---

## Analytics / insights for the business owner

**1. Cross-channel funnel stat (small)** — `Turn.channel` (`totem`/`whatsapp`/`mobile`) is already written on every ticket but never aggregated or shown. A groupby in `statsService.ts` + a stat card ("62% of today's tickets came via WhatsApp") turns channel adoption into a visible number. This is also the number that sells a business on upgrading to a paid channel tier (#8) — right now they have no evidence WhatsApp/web is worth paying for.

**2. Fix the dead "No presentados" stat first (small, prerequisite)** — `turn.ts`'s own doc comment says it: `handleNoShow` never sets `TurnStatus.NO_SHOW`, it only requeues (back to `waiting`) or cancels. So the "No presentados" card in `AdminView.tsx`'s stats grid is structurally always 0 — it's not a low-traffic queue, it's dead code. Any no-show analytics idea (including #10) needs this fixed first: either write a real `NO_SHOW` status transition, or stop asking `statsService` to count something no code path produces.

**3. Historical trend / hourly demand heatmap (medium)** — `getQueueStats` does a live Firestore query scoped to `createdAt >= todayMidnight`; there is no rollup collection, so "how was last Tuesday" isn't just unbuilt, it's unanswerable without scanning the whole `turns` collection. A scheduled Cloud Function writing a daily-summary doc per queue (count, avg wait, no-show rate, channel mix) turns "today only" into a real staffing tool — "you're overstaffed Mon/Tue mornings, understaffed Fri afternoons" is the single most concrete pitch for why a business would trust this over a paper dispenser.

**4. Cross-queue "floor overview" (small-medium)** — Admin stats show one queue at a time (`selectedQueueId`, single `getQueueStats` call). A batch endpoint returning stats for every active queue at once gives the "how's the whole store doing right now" view every multi-counter competitor (bank/DMV systems) leads with. Straightforward extension of code that already exists.

**5. Customer-identity analytics off `memberNumber` (medium)** — Because tickets are keyed to the customer's own persistent number rather than an anonymous daily sequence, the business already has, for free, the ability to see: visit frequency per customer, days-since-last-visit, and per-member no-show habit. No competitor using sequential daily tickets can offer this without building a separate loyalty system. Turning it into a "frequent visitor" or "flight risk" (long time since last visit) view in Admin is a genuine differentiator, not a generic CRM bolt-on — it falls directly out of a design decision already made.

**6. Operator/staff performance (medium, needs a schema field)** — `Turn` records `terminalId` but not *who* was logged in at that terminal when the turn was served. RBAC login already exists (`AppUser`, role, `assignedSectorIds`), so the identity is available at call time — it's just not captured on the turn. Adding `servedByUserId?: string` to `Turn` (written in `callTurn`) unlocks turns-per-cashier and avg-service-time-per-cashier — useful for a business with several cashiers per sector deciding who needs coaching or more hours.

**7. Surface `reenqueueConfig` effectiveness (medium)** — `reenqueueConfig` (`maxAttempts`, `positionsBack`) is a static, manually-set per-queue config. Once #2 is fixed, feeding actual outcomes back — "with maxAttempts=2, 30% of no-shows exhaust retries and get cancelled, i.e. lost customers" — turns a config knob into a data-backed recommendation instead of a guess an admin sets once and forgets.

---

## Retention / engagement

**8. Web push on `/mi-turno` (small-medium)** — Today's UX review already flags that the just-shipped web-ticket page has no notification and the customer must keep the tab visible. WhatsApp's recall alert is the paid-tier answer; **Web Push is the free-tier equivalent** — no Meta Graph API cost, works on the same page that already does `onSnapshot`. This matters commercially: it lets the free/base tier still feel "alive" (not just screen-watching) without forcing every business onto the metered WhatsApp tier, which widens the top of the funnel for #8's paid upsell.

**9. Post-service rating on `/mi-turno` (small)** — The WhatsApp plan explicitly deprioritized CSAT ("mostly benefits the business, low priority... deferred to v2"). That reasoning doesn't apply to the web page: it's already subscribed to the turn doc, already showing state transitions, and adding a single 1–5 tap after `finishedAt` costs no messaging budget. Gives the business a satisfaction metric a paper-ticket dispenser structurally cannot offer, cheaply.

**10. Priority-claim trust (small-medium)** — `Queue.type: "priority"` exists but nothing validates who's entitled to use it; README is explicit that `memberNumber` is "external ... no se valida contra ningún padrón." For a PAMI/elderly-skewing user base (the WhatsApp doc's own framing), an unpoliced priority lane is a fairness problem that erodes trust in the digital system versus a physical priority line staff enforces by eyeballing. A lightweight staff-only override at Terminal (flag/demote a claimed-priority turn) is cheap and protects adoption among the exact demographic this system is built for.

---

## Multi-location / franchise readiness

**11. `Business`/`Location` entity is the real blocker, not a feature (large, foundational)** — Today a chain with 3 pharmacies literally cannot be represented: `Sector` has no location/address field, `Admin` lists sectors/queues/terminals/users flat with no location scope, Firestore rules and `statsService` aren't location-partitioned, and public read access (Totem/Display are unauthenticated) has no location boundary either. Selling to any multi-branch customer requires this as prerequisite architecture, not an add-on — flagging it now because it changes how much of the current single-tenant assumption (one Firebase project = one business) can be preserved versus needs a real tenant model.

**12. White-label branding config (medium)** — Totem/Display/Terminal each have a hardcoded, distinct visual identity (brutal cyan/magenta Display, industrial green Terminal). Commercial queue SaaS competitors (Qminder, Waitwhile-style) universally offer logo/color branding per customer. A `Business.branding` config (logo, primary color) surfaced on the public-facing views is a standard checkbox enterprise buyers expect and is cheap relative to #11 once that entity exists.

---

## Monetization

**13. Tiered pricing aligned to what already costs money (medium, mostly a business/packaging decision)** — The WhatsApp plan doc already flags "per-conversation messaging budget/cost ceiling" as an open question — i.e., the cost driver for metering is already identified in the spec. Natural tiers:
   - **Free/Base**: Totem + Display + Terminal, screen-only alerts (what exists today).
   - **Growth**: adds `/mi-turno` web channel + web push (#8) + cross-channel stats (#1).
   - **Pro**: adds WhatsApp (metered per Meta conversation cost) + historical analytics (#3).
   - **Enterprise**: multi-location (#11), branding (#12), operator performance (#6), data export.
   This also gives a reason for #1's channel-mix stat to exist — it's the usage meter that justifies Pro-tier billing.

**14. Booked-slot hybrid (large, aspirational — not v1)** — Pure walk-in today. Competing systems in this space commonly blend "reserve a time" with walk-in to let a business smooth demand spikes (visible directly in #3's hourly heatmap once built). Given WhatsApp is becoming a conversational channel anyway, "book a slot via WhatsApp" is a plausible v2/v3 extension — but it changes turn semantics enough (a turn with a future `scheduledAt` rather than immediate `queuedAt`) that it shouldn't be scoped until the heatmap data (#3) shows it's actually needed.

---

## Priority read

Cheapest, highest-signal first: **#2 (fix dead stat) → #1 (channel stat) → #4 (floor overview) → #8 (web push)** — all small/medium, all build directly on data or code that already exists, and #1+#8 together make the case for #13's tier packaging. **#11 (Business/Location)** is the one item that should be decided early even if not built soon, since it constrains how much of the current schema survives a multi-location push.
