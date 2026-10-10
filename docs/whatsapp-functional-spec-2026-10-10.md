# WhatsApp Integration — Functional Spec (2026-10-10)

Supersedes `docs/whatsapp-integration-v1-2026-08-11.md` and `docs/whatsapp-integration-plan-2026-08-11.md`. Reasoned from current code, not from those docs.

**Owner decisions taken as given:** walk-in turns AND appointments in scope; Meta WhatsApp Cloud API direct (no BSP); no WhatsApp Business Account (WABA) exists yet; Argentina, elderly/PAMI-skewed customers, Spanish (rioplatense) copy.

> **Pricing addendum (2026-10-10, after platform research — see `docs/whatsapp-platform-research-2026-10-10.md` §1).** This spec was drafted assuming free-form replies inside the 24 h customer-service window are free. Since **2026-10-01** Meta charges them at the market's utility rate after **1,000 free delivered service messages per business phone number per month**, and utility templates are charged even inside the window. The shape recommendation (customer-initiated for walk-ins, templates for appointments) still holds — it stays the cheapest and the only policy-safe option — but "free" below should be read as "~US$0.012–0.026 per message after the monthly allowance". Budget target carried into the technical plan: ≤4 outbound messages per linked walk-in turn, 2 per appointment.

---

## 1. Where the product stands today (grounding)

| Capability | Exists? | Where |
|---|---|---|
| Walk-in ticket from kiosk | Yes | `app/src/views/TotemView.tsx` → `createTurn(queueId, memberNumber, "totem")`. Confirmation screen auto-dismisses after 5 s (`CONFIRM_DISPLAY_MS`), hint is "Mirá el panel para seguir tu turno". No QR, no link to Mi Turno. |
| Walk-in ticket from own phone + live tracking | Yes | `app/src/views/WebTicketView.tsx` (`/mi-turno`): channel `"mobile"`, live `onSnapshot` on the public `turns` doc, turns-ahead count + estimated call range via `app/src/hooks/useTurnEstimate.ts` (uses `queues.avgCallIntervalSeconds`, written by `terminalService.callTurn`). Cancel while `waiting`. Recovery = "save this link". |
| Ticket recovery without link | Yes | `GET /getCurrentTurn?memberNumber=` (`functions/src/services/turnService.ts`) — latest active turn across all queues. |
| Same-queue duplicate guard | Yes | `turnService.createTurn` returns the existing active turn for same `memberNumber` + `queueId` instead of creating a second one. Different queue → second turn allowed. |
| Call / recall / no-show / requeue | Yes | `functions/src/services/terminalService.ts`: `callTurn` (sets `calledAt`, `terminalId`), `recallTurn` (`recallCount++`, `lastRecallAt`), `handleNoShow` (requeue `positionsBack` while `requeueCount < maxAttempts`, else `NO_SHOW`). All operator-initiated; no timers. |
| `channel` on Turn | Field exists, unused | `shared/src/models/turn.ts` has `Channel = "totem" \| "whatsapp" \| "mobile"`. Controller accepts any string (`channel \|\| "totem"`, `functions/src/controllers/turnController.ts`). Not displayed in Terminal/Admin/Display (grep: zero hits). |
| Appointments | Yes | `functions/src/services/appointmentService.ts` / `appointmentStaffService.ts`. `reservada → llamada → atendiendo → finalizada`; `cancelada`; `no_show` is **manual** from `llamada`. Cancel/reschedule only while `reservada`. No reminders of any kind. No live listener (PII) — customer refreshes `/agenda/:id`. |
| Contact data on appointments | Free text, unvalidated | `Appointment.contact?: string`, form label "Contacto (opcional)", placeholder "Teléfono o email" (`AppointmentBookingView.tsx:242-248`). Staff view shows `contactName` only (`AppointmentAgendaView.tsx:161`). |
| PII posture | Split | `turns` is **publicly readable** (`firestore.rules`) — Display/Totem/Mi Turno listen to it directly. `appointments` is **not** public because it holds `contactName`/`contact`. |
| Scheduled jobs | Pattern exists | `functions/src/controllers/scheduledController.ts` (`onSchedule`, Argentina TZ). |
| Secrets | `process.env` only | `ADMIN_ALLOWLIST` in `userService.ts`. No Secret Manager usage yet. |
| Rate limiting | Yes | Firestore fixed window by IP / `member:<n>` (`functions/src/utils/rateLimit.ts`). |

Hard constraint derived from this: **a phone number can never be written onto a `turns` document** — that collection is public by design and three views depend on it. Phone data for walk-in turns must live in a non-public collection keyed by turn id or by phone.

---

## 2. Value read — honest version

**Who benefits and how:**

- **Elderly / PAMI walk-in customer.** Real friction today: must stay in the room watching/hearing the display; Mi Turno solves this *only* for people who will type a URL and keep a tab open — a minority of this demographic. WhatsApp's unique contribution is not information (Mi Turno already shows position + ETA live) but **(a) push delivery with the tab closed, (b) a channel they already use daily, (c) zero URL typing**. This is the core value; everything else is secondary.
- **Appointment customer.** Nothing reminds anyone today. Reminders are the single highest-leverage feature in this spec: they reduce no-shows (a business win — each `no_show` today costs staff a call + recall + manual decision) and help a forgetful customer (a customer win). Days-ahead booking means these must be paid Meta templates — unavoidable.
- **Cashier.** Indirect: a customer who knows they were called shows up faster; fewer recalls/no-shows. A "notified via WhatsApp" badge tells the operator the person may be stepping back in from outside, so recall before no-show is the right reflex.
- **Admin.** Marginal in v1. No dashboard needed to capture the value above.

**What is marginal (say so):**

- *Taking a ticket via WhatsApp vs. Mi Turno:* functionally identical outcome; the delta is purely interface familiarity. For this demographic that delta is the point, so it stays in — but it is the most expensive v1 item (conversation state machine) for the least *new* capability.
- *"Called" alert for appointment customers:* they are on-site at a known time and `/agenda/pantalla` already announces them. Cheap given the plumbing; low value. Last in the v1 ranking, cut first.
- *On-demand "where am I":* redundant once heads-up + called alerts exist; kept because it is ~10 lines and pull-based (no cost/spam).
- *Totem QR → WhatsApp:* scanning a QR is itself friction for many elderly users. Still cheaper than a kiosk phone keypad and avoids the "is this number on WhatsApp?" problem. Modest adoption expected; include because the implementation is trivial once deep-link linking exists.
- *WhatsApp does not change throughput.* It changes where the customer waits, not how fast they are served. Do not sell it as "faster".

**Cheaper alternative the owner should know exists:** a plain QR to `/mi-turno/:turnId` on the Totem ticket screen gives live tracking to smartphone users with zero WhatsApp dependency. It does not give push. This spec folds that idea in as the deep-link carrier rather than a separate feature.

---

## 3. Shape alternatives and recommendation

| Shape | What it is | Tradeoff |
|---|---|---|
| **A. Notifications-only, phone typed at Totem/Mi Turno/booking form** | Customer types phone; system sends templates (called/requeued/reminder). No inbound handling beyond opt-out. | Simplest bot (none). But: every first message is a paid template; number may not be on WhatsApp (silent failure); kiosk phone typing is error-prone for elderly; Meta still requires an inbound webhook for opt-out/status. Argentine phone normalization burden lands on every input. |
| **B. Conversational intake only** | Customer messages the business number; bot asks member number + queue; creates turn; all alerts ride the 24 h service window. | Best fit for elderly ("mandá HOLA al número del cartel"), free-form messages are free inside the window, consent and WhatsApp-reachability are proven by construction. Cost: a small state machine. Does nothing for Totem/Mi Turno tickets or appointments. |
| **C. Click-to-chat deep links** | Totem/Mi Turno show a `wa.me/<biz>?text=TURNO <id>` QR/button; customer taps "send"; webhook links phone→turn. | No phone typing, no template, proves reachability, opens the window. Covers existing tickets. Needs the same inbound webhook as B. Doesn't cover appointments (window closes before the date). |
| **D. Opt-in via web forms (phone field + checkbox)** | Phone captured in Mi Turno / booking form; templates sent. | Mandatory for appointments (nothing else works days ahead). Redundant for Mi Turno once C exists (the customer is already holding their phone — a tap beats typing). |

**Recommendation: B + C for walk-in turns, D for appointments.** One webhook, one sender, one session store serve all three. Walk-in customers never type a phone number anywhere and never receive a paid template; appointment customers type a phone once at booking and receive two templates (confirmation, reminder). A is rejected as the primary shape because it combines the worst UX (kiosk phone entry) with the worst economics (template-first) and a silent-failure mode (number not on WhatsApp).

---

## 4. Ranked v1 scope

Ranked by value ÷ cost. Items 1-2 are the foundation; 3-4 are the walk-in value; 5-6 the appointment value; 7 is optional.

1. **Platform plumbing** — WABA, webhook (verify + inbound + delivery status), outbound sender, `whatsappSessions`, `whatsappMessages` log, signature verification, secrets, opt-out keyword. No customer-visible feature on its own; everything depends on it.
2. **Walk-in lifecycle alerts for linked turns** — heads-up at ≤3 ahead, called (with counter name), re-called, requeued after no-show, final no-show, confirmation of own cancel. Hooks in `terminalService.callTurn/recallTurn/handleNoShow`, `turnService.cancelTurn`.
3. **Link an existing ticket by click-to-chat** — Mi Turno button + Totem QR with prefilled `TURNO <turnId>`; `whatsappLinked` badge in Terminal.
4. **Take a ticket via WhatsApp** — numeric/list-driven intake; reuses `createTurn` with `channel: "whatsapp"`; `ESTADO`/`CANCELAR` commands.
5. **Appointment phone capture + booking confirmation template** — structured `phone` + `whatsappOptIn` in the booking form replaces free-text `contact`.
6. **Appointment reminder template (day before) with buttons** — "Cancelar cita" (button payload → confirm → `cancelAppointment`) and "Ver / reprogramar" (URL button to `/agenda/:id?memberNumber=`).
7. **Appointment "called" / "no-show" notices** — same hook pattern on `appointmentStaffService.callAppointment/recallAppointment/noShowAppointment`. Low value; cut first if time-boxed.

### Not in v1 (and why)

- **Reschedule via chat.** Slot picking over text is a multi-step state machine for a flow the web already does well. Reminder carries a URL button instead.
- **"Confirmo asistencia" button + `confirmedAt` on Appointment.** Real staff value, but a model + Agenda UI change on top of everything else. v2 once reminders prove out.
- **Phone keypad at Totem.** Template-first, error-prone, unverifiable reachability. Replaced by QR deep link.
- **Business-initiated first contact for walk-in turns.** Never needed with B + C; avoids template cost and policy exposure.
- **Multiple active WhatsApp-linked turns per phone.** One phone ↔ one active turn in v1. A helper taking tickets for two relatives is a known gap (see edge cases).
- **Admin WhatsApp dashboard / stats by channel.** Failures visible in Cloud Logging + `whatsappMessages`; a tab can come later.
- **Broadcasts (closures, delays), CSAT, PAMI/priority routing by phone, booking appointments via chat, human handoff, WhatsApp Flows, multi-language, voice-note handling, automatic no-show timers.** Speculative or contradict existing "no-show is a staff decision" rule.
- **Replacing the public display or the `memberNumber` identity.** Out of scope; WhatsApp is an additional channel.

---

## 5. User stories

- **US1** As an elderly walk-in customer, I send "hola" to the branch's WhatsApp number from the poster, answer two prompts, and get my ticket — so I can wait outside without using the kiosk or a website.
- **US2** As a customer who already has a ticket (Totem or Mi Turno), I tap/scan one thing and get WhatsApp alerts for it — so I can leave the room.
- **US3** As a linked walk-in customer, I'm told when I'm 3 away, when I'm called (and to which counter), when I'm re-called, and what happened if I missed it (requeued / lost) — so I don't lose my place through not hearing the display.
- **US4** As a linked walk-in customer, I can ask "ESTADO" or send "CANCELAR" from the chat — so I never need to return to the kiosk.
- **US5** As a cashier, I see which turn in my list/current panel is notified via WhatsApp — so I re-call before no-show for someone likely stepping back in.
- **US6** As an appointment customer, I leave my mobile at booking and receive a confirmation and a reminder the evening before, with a cancel button — so I don't forget, and I free the slot if I can't make it.
- **US7** As any customer, I can reply "BAJA" and never hear from the number again.
- **US8** As an admin/operator, nothing in Terminal, Totem, Mi Turno, or Agenda breaks or slows down when WhatsApp is unreachable.

---

## 6. Functional requirements

### 6.1 Platform (feature 1)

- **FR-1.1** New HTTPS Cloud Function `whatsappWebhook`: `GET` answers Meta's verification challenge using a configured verify token; `POST` receives message/status events, validates `X-Hub-Signature-256` (HMAC-SHA256 with the app secret), rejects invalid signatures with 403, and returns 200 within Meta's timeout **before** doing heavy work (process after ack or keep processing < ~5 s).
- **FR-1.2** Inbound processing is idempotent on Meta `message.id` (Meta retries deliveries). Store the last N processed ids per session or check `whatsappMessages`.
- **FR-1.3** Outbound sender: single service `whatsappService.sendText / sendTemplate / sendInteractive` over Graph API `/{phoneNumberId}/messages` with native `fetch`. Every send writes a `whatsappMessages` doc (`to`, `kind`, `refType` turn|appointment, `refId`, `status` sent|failed|delivered|read, `waMessageId?`, `error?`, `createdAt`). Delivery-status webhooks update `status` by `waMessageId`.
- **FR-1.4** Sends are **never** inside a Firestore transaction and never block or fail the triggering business action. Failure → `logger.error` + `whatsappMessages.status = "failed"`. No retry queue in v1.
- **FR-1.5** Secrets (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) via Firebase Functions secrets (`defineSecret`) — **new pattern** in this repo (today only `process.env.ADMIN_ALLOWLIST`).
- **FR-1.6** Phone identity = Meta `wa_id` digits. Any phone typed by a customer (appointments) is normalized to the same canonical form before storage/comparison (see 6.5 and edge cases for the Argentine "9" quirk).
- **FR-1.7** Opt-out: inbound `BAJA` (also accept `STOP`, `NO`, `BASTA` as synonyms) sets `whatsappSessions/{phone}.optedOut = true`, replies once with a short confirmation, and suppresses every future send to that phone (turns and appointments) until the customer messages again with anything other than an opt-out word (which clears the flag — they re-engaged).
- **FR-1.8** New non-public collection `whatsappSessions/{phone}`: `{ phone, state: "idle"|"awaiting_member"|"awaiting_queue"|"awaiting_cancel_confirm", draft?: { memberNumber?, queueId?, cancelTarget?: {type, id} }, turnId?: string, optedOut: boolean, lastInboundAt, lastInboundMessageId, updatedAt }`. Readable by staff roles only (rules), writable only by functions.
- **FR-1.9** All customer copy in Spanish, "vos" form, short lines, no jargon, numbers spelled as digits. Sample copy in §9.

### 6.2 Walk-in lifecycle alerts (feature 2)

Applies to any turn with a session whose `turnId` equals the turn (linked via 6.3 or created via 6.4), unless `optedOut`.

- **FR-2.1 Called.** After `terminalService.callTurn` commits: send "Te están llamando. Acercate a **{terminal.name}**." Look up the session by `turnId` (single-field query). Resolve terminal name from the `terminals` doc; fall back to no counter name if missing.
- **FR-2.2 Re-called.** After `terminalService.recallTurn`: "Te volvieron a llamar en {terminal.name}. Si no te presentás, podés perder el turno."
- **FR-2.3 Requeued.** After `handleNoShow` requeue branch: "No te encontraron. Te pusimos de vuelta en la fila, {n} personas por delante." where `n` = count of waiting turns in the queue with `queuedAt <` the turn's new `queuedAt` (same math as `useTurnEstimate`). Include remaining attempts if `maxAttempts - requeueCount > 0`: "Te queda {k} aviso más."
- **FR-2.4 Lost.** After `handleNoShow` NO_SHOW branch: "Tu turno {memberNumber} se dio por perdido. Para sacar otro, mandá HOLA." Then clear `session.turnId`.
- **FR-2.5 Heads-up.** After every `callTurn` commit, for the called turn's `queueId`: read the waiting list (ordered `queuedAt asc`), take the turn at index 2 (3rd in line). If it has a linked session and `session.headsUpSentForTurnId !== turnId`, send "Quedan 3 personas antes que vos. Si saliste, empezá a volver." and set that marker. Threshold fixed at 3 in v1. If the turn was requeued and is again at position 3, it is sent again (marker is per `turnId` + `requeueCount`).
- **FR-2.6 Cancelled by customer.** On `turnService.cancelTurn` success for a linked turn: "Listo, cancelamos tu turno {memberNumber}." and clear `session.turnId`. Triggered whether cancel came from Mi Turno or chat.
- **FR-2.7** Finishing a turn sends nothing. `session.turnId` is cleared lazily: any lookup that finds the turn in `finished|cancelled|no_show` clears it.
- **FR-2.8** No message is sent for `attending` transitions.

### 6.3 Link an existing ticket (feature 3)

- **FR-3.1** Mi Turno ticket view (`WebTicketView.tsx`, tracking state, while turn is `waiting|called`): button "Avisarme por WhatsApp" → `https://wa.me/{businessNumber}?text=TURNO%20{turnId}`. Opens WhatsApp with the message prefilled; customer taps send. Hide the button once the session reports linked? — not knowable from the public turn doc; instead show the button until the turn ends and let the bot handle re-links idempotently.
- **FR-3.2** Totem confirmation screen (`TotemView.tsx`): render a QR encoding the same `wa.me` URL plus the caption "Escaneá para recibir avisos por WhatsApp". `CONFIRM_DISPLAY_MS` (5 s) is too short to scan; raise to ≥ 20 s **for this screen only**, keeping the "Nuevo turno" manual reset so the kiosk is not blocked. **New frontend dependency** for QR rendering (none exists in `app/package.json`) — implementer to pick a small one.
- **FR-3.3** Inbound `TURNO <id>` (case-insensitive, tolerate extra spaces): load turn; if not found or not `waiting|called` → "Ese turno ya no está activo. Para sacar uno nuevo, mandá HOLA." If the session already has a different active `turnId` → ask "Ya tenés avisos para el turno {a}. ¿Querés cambiarlos al turno {b}? Respondé SÍ." Else link: `session.turnId = id`, set `turns/{id}.whatsappLinked = true`, reply with the status summary (6.4 FR-4.6).
- **FR-3.4** `Turn.whatsappLinked?: boolean` (new, **non-PII** flag on the public doc). Terminal (`TerminalView.tsx`) shows a small "WhatsApp" badge on the current turn panel and on waiting-list rows when true. Display and Totem ignore it.
- **FR-3.5** Linking is allowed even if the turn was created at the Totem with a different `channel`; `channel` is never rewritten.

### 6.4 Take a ticket via WhatsApp (feature 4)

- **FR-4.1** Any inbound text from a phone with no active `turnId` and no pending draft, that is not a recognized command, starts intake: reply "Hola. Para sacar turno, mandá tu número de socio (de 1 a 5 cifras)." → `state = awaiting_member`.
- **FR-4.2** In `awaiting_member`: accept 1-5 digits (strip spaces/dots). Invalid → repeat prompt once with example. Valid → store in `draft.memberNumber`, list active queues (`queues.active !== false`) as a WhatsApp **interactive list** when ≤ 10 queues (one row per queue, title = queue name, description = sector name) else a numbered text menu. `state = awaiting_queue`.
- **FR-4.3** In `awaiting_queue`: accept list selection or the row number. Call `createTurn(queueId, memberNumber, "whatsapp")`. On success link session + set `whatsappLinked`, reply with the status summary (FR-4.6) plus "Mandá ESTADO para ver cuánto falta, CANCELAR para cancelar." `state = idle`.
- **FR-4.4** Duplicate guard: `createTurn` already returns the existing turn for same member + queue (`turnService.ts`). Detect by comparing `createdAt` to now (> a few seconds old) and reply "Ya tenías el turno {memberNumber} en {queue}. Te avisamos por acá cuando te llamen." — then link it. This is the free "link my Totem ticket by member number" path.
- **FR-4.5** `createTurn` errors map to copy: queue closed (409) → "Esa fila está cerrada ahora."; other → "No pudimos sacar el turno. Probá de nuevo en un momento." State stays `awaiting_queue` on closed-queue error, resets on others.
- **FR-4.6 Status summary** (used after create, link, and for `ESTADO`): "Turno {memberNumber} — {queue}. {n} personas por delante. Te llamarían aprox. entre {hh:mm} y {hh:mm}." using the same math as `useTurnEstimate.estimateCallTime` ported server-side (`queue.lastCalledAt`, `avgCallIntervalSeconds`, default 10 min, 5-min floor + 10-min range). When `called`: "Te están llamando en {terminal}." When ended: status + "Para sacar otro, mandá HOLA."
- **FR-4.7 Commands** (case/accent-insensitive): `ESTADO` / `POSICION` / `DONDE` → FR-4.6. `CANCELAR` → if active turn is `waiting`: "¿Confirmás que querés cancelar el turno {memberNumber}? Respondé SÍ." (`state = awaiting_cancel_confirm`, `draft.cancelTarget = {turn, id}`); `SÍ`/`SI` → `cancelTurn(turnId, turn.memberNumber)`; anything else → "No cancelamos nada." If turn is `called|attending` → "Ya te llamaron, no se puede cancelar desde acá." `HOLA` / `TURNO` (bare) with active turn → status summary; without → intake. `AYUDA` → command list.
- **FR-4.8** Drafts expire: if `state !== idle` and `updatedAt` older than 30 min, treat the next inbound as a fresh start (say so: "Empecemos de nuevo.").
- **FR-4.9** One active linked turn per phone. Intake requested while `turnId` is active → reply status summary + "Si querés otro turno, primero cancelá este o esperá a que termine." (See edge case E6.)
- **FR-4.10** Priority queues are offered exactly as the Totem offers them (self-declared). Open question Q3 if the owner wants them hidden on WhatsApp.
- **FR-4.11** Rate limit: at most 1 turn created per phone per 60 s and reuse of the existing `checkRateLimit("wa:<phone>")` for inbound bursts (> 8 in 20 s → ignore silently, no reply storm).

### 6.5 Appointment phone capture + confirmation (feature 5)

- **FR-5.1** `Appointment` gains `phone?: string` (canonical digits, see FR-1.6) and `whatsappOptIn?: boolean`. Free-text `contact` stops being written by the form; kept readable for existing docs (deprecated, Q5).
- **FR-5.2** Booking form (`AppointmentBookingView.tsx`): field "Celular (WhatsApp)" with hint "Código de área sin 0 y número sin 15, ej. 11 5555 1234" + checkbox "Quiero recibir recordatorios por WhatsApp" (unchecked by default — explicit opt-in, Meta policy). Client validates 10 digits after stripping non-digits; server (`appointmentController` / `appointmentService.createAppointment`) re-validates and normalizes to `549{10 digits}`. Phone optional; opt-in requires phone.
- **FR-5.3** On successful `createAppointment` with opt-in: send approved template `cita_confirmacion` (es_AR): "Hola {contactName}. Tu cita de {serviceName} quedó reservada para el {fecha larga} a las {startTime}. Código: {appointmentId}." with URL button "Ver cita" → `/agenda/{id}?memberNumber={memberNumber}`. Not in the transaction.
- **FR-5.4** Template send failure with Meta error indicating undeliverable/not on WhatsApp → `whatsappMessages.status = failed`, no UI impact (the web confirmation screen is already shown). Nothing else retries.
- **FR-5.5** Agenda del Día (`AppointmentAgendaView.tsx`) shows a "WhatsApp" badge next to `contactName` when `whatsappOptIn && phone`. Phone number itself not shown (Q10).
- **FR-5.6** `rescheduleAppointment` by the customer on the web: no message (they just did it themselves on screen). Reminder picks up the new date automatically.

### 6.6 Appointment reminder with cancel (feature 6)

- **FR-6.1** Scheduled function `appointmentReminders` daily at 18:00 `America/Argentina/Buenos_Aires` (same pattern as `dailyStatsRollupHandler`). Selects `appointments` where `date == tomorrow (Argentina)`, `status == reservada`, `whatsappOptIn == true`, `phone` set, and no `whatsappMessages` doc with `kind == "cita_recordatorio"` + `refId == appointmentId` + `date == appointment.date` (idempotency; a second run sends nothing; the `date` component lets a rescheduled appointment be reminded again for its new date). Skips phones with `optedOut`.
- **FR-6.2** Template `cita_recordatorio` (es_AR): "Hola {contactName}, te recordamos tu cita de {serviceName} mañana {fecha} a las {startTime}. Si no podés venir, cancelá para liberar el lugar." Buttons: quick-reply **"Cancelar cita"** (payload `cancel_appt:{appointmentId}`), URL **"Ver / reprogramar"** → `/agenda/{id}?memberNumber={memberNumber}`.
- **FR-6.3** Inbound quick-reply payload `cancel_appt:{id}`: verify the phone matches `appointments/{id}.phone`; if status `reservada` → "¿Confirmás cancelar la cita del {fecha} {startTime}? Respondé SÍ." (`state = awaiting_cancel_confirm`, `cancelTarget = {appointment, id}`); `SÍ` → `cancelAppointment(id, appointment.memberNumber)` → "Cita cancelada. Podés reservar otra en {link}." If status is not `reservada` → "Esa cita ya no se puede cancelar desde acá."
- **FR-6.4** Plain-text `CANCELAR` from a phone with no active turn but one upcoming (`date >= today`, `reservada`) appointment → same confirm flow targeting that appointment, always restating date/time. With several → list "1) … 2) …" and accept the number.
- **FR-6.5** Reminder template send failures follow FR-1.4; the appointment is untouched.

### 6.7 Appointment called / no-show notices (feature 7, optional)

- **FR-7.1** After `callAppointment` / `recallAppointment`: "Te están llamando para tu cita de {serviceName}." (no counter concept exists for appointments).
- **FR-7.2** After `noShowAppointment`: "No te presentaste a tu cita de hoy. Podés reservar otra en {link}."
- **FR-7.3** Only when `whatsappOptIn && phone && !optedOut`. These are outside the 24 h window unless the customer replied to the reminder → implement as templates (`cita_llamada`, `cita_no_show`) or skip entirely. Cut first.

---

## 7. Acceptance criteria

### Platform
- [ ] `GET /whatsappWebhook?hub.mode=subscribe&hub.verify_token=<ok>&hub.challenge=X` → 200 body `X`; wrong token → 403.
- [ ] `POST` with invalid signature → 403 and nothing written. Valid → 200 in < 5 s even if Meta is slow on the outbound side.
- [ ] Same inbound `message.id` delivered twice → one state change, one reply.
- [ ] Outbound send with Graph API down (mock 5xx): `callTurn` still succeeds (200 to Terminal), `whatsappMessages` has `status: failed`, Cloud Logging has an error.
- [ ] `BAJA` → confirmation once; a subsequent `callTurn` for that phone's turn sends nothing; a later "hola" clears `optedOut` and starts intake.
- [ ] `firestore.rules`: anonymous read of `whatsappSessions` / `whatsappMessages` denied; cashier read of `whatsappSessions` allowed; all writes denied.

### Walk-in alerts
- [ ] Given linked turn `waiting`, when operator calls it from terminal "Caja 2", then within seconds the phone receives "…Acercate a Caja 2".
- [ ] Given linked turn `called`, recall → re-call message with `recallCount` unchanged in copy semantics (no count shown).
- [ ] Given `reenqueueConfig {enabled, maxAttempts: 2, positionsBack: 3}` and `requeueCount 0`, no-show → requeue message with correct "personas por delante" matching Mi Turno's count for the same turn, and "Te queda 1 aviso más."
- [ ] Given `requeueCount == maxAttempts`, no-show → "se dio por perdido" and `session.turnId` cleared; `ESTADO` afterwards → "Para sacar otro, mandá HOLA."
- [ ] Given 5 waiting turns in queue Q, the 3rd linked, when the 1st is called → 3rd receives the heads-up exactly once; calling the 2nd does **not** resend to the (now 2nd) turn.
- [ ] Cancel from Mi Turno on a linked turn → chat receives the cancel confirmation.
- [ ] Finishing a turn → no message.

### Linking
- [ ] Mi Turno tracking view shows the WhatsApp button only while `waiting|called`; URL contains the exact `turnId`.
- [ ] Totem confirmation shows a scannable QR; screen stays ≥ 20 s; manual reset still works; idle reset unaffected on other screens.
- [ ] `TURNO <id>` for a `finished` turn → "ya no está activo"; for a valid one → `whatsappLinked: true` on the turn and status summary reply; Terminal shows the badge within one listener tick.
- [ ] `TURNO <id>` from a phone already linked to a different active turn → asks SÍ; `SÍ` → relink; `NO` → unchanged.

### Intake
- [ ] "hola" → member prompt → "4213" → queue list (interactive when ≤ 10 active queues) → choose → turn exists in Firestore with `channel: "whatsapp"`, `whatsappLinked: true`; reply includes position and estimate range consistent with Mi Turno for the same turn (±1 rounding bucket).
- [ ] Same member + same queue already `waiting` (Totem ticket) → no new turn; reply "Ya tenías el turno…"; session linked to the Totem turn.
- [ ] Choose a queue with `active: false` → "Esa fila está cerrada ahora."; remains in `awaiting_queue`.
- [ ] "abc" in `awaiting_member` → re-prompt; second "abc" → re-prompt (no loop beyond one extra hint; third → help text).
- [ ] 31 min after a half-finished intake, "2" → "Empecemos de nuevo." + member prompt (not treated as a queue choice).
- [ ] `CANCELAR` → confirm prompt; `si` (no accent) → cancelled; `ESTADO` instead of SÍ → status summary, nothing cancelled, state back to `idle`.
- [ ] 9 inbound messages in 20 s → the 9th gets no reply and no error.

### Appointments
- [ ] Booking with phone "11 5555 1234" + opt-in → `appointments/{id}.phone == "5491155551234"`, `whatsappOptIn == true`, `contact` absent; confirmation template sent with correct name/service/date/time and URL button that opens `/agenda/{id}?memberNumber=…`.
- [ ] Booking with opt-in but no phone → 400 (server) and blocked client-side.
- [ ] Booking without opt-in → no `whatsappMessages` doc created.
- [ ] Reminder job at 18:00 for tomorrow's `reservada` opted-in appointments → one template each; rerunning the job → zero new sends; `cancelada` or `no_show` appointments → none; appointment rescheduled to tomorrow after the job already ran today → **not** reminded (accepted gap, Q4).
- [ ] Tap "Cancelar cita" → confirm prompt restating date/time; `SÍ` → status `cancelada`, `cancelledAt` set, slot capacity freed (`getAvailableSlots` shows it); confirmation reply with booking link.
- [ ] Tap "Cancelar cita" from a phone that doesn't match `appointment.phone` → "No encontramos esa cita para este número." and nothing changes.
- [ ] Agenda del Día shows the WhatsApp badge only for opted-in rows with a phone.

---

## 8. Edge cases (and what happens)

- **E1 Reply out of context** ("ok", "gracias", emoji, a photo, a voice note) with `state = idle`: if active turn → status summary; if upcoming appointment → one line with its date + "Mandá AYUDA para ver opciones"; else intake prompt. Media/audio → "Solo leo mensajes de texto. Mandá AYUDA." Never more than one reply per inbound message.
- **E2 Two active turns for one phone.** Prevented by FR-4.9 for WhatsApp-created turns. Still reachable: Totem/Mi Turno ticket in queue A linked by deep link, then member takes another at the Totem in queue B → only A is linked (alerts for B never fire). `TURNO <idB>` → relink prompt (FR-3.3). Documented v1 limitation.
- **E3 Turn called while customer is far.** Heads-up at 3 gives lead time; called → recall → requeue messages tell them what happened and their new position. No automation changes the operator's existing recall/no-show decision (`handleNoShow` untouched). Copy sets expectation: alerts are a help, the display is still authoritative.
- **E4 Appointment and walk-in turn, same phone, same day.** Separate objects; turn commands act on the turn; appointment actions are driven by button payloads (unambiguous). Plain `CANCELAR` with both present → "¿Qué querés cancelar? 1) Turno {n} en {queue} 2) Cita {date} {time}" and accept 1/2. Lifecycle alerts for both proceed independently.
- **E5 Number not on WhatsApp** (appointments only — walk-in paths are customer-initiated so cannot hit this). Meta returns an undeliverable error → `failed` log, no retry, no UI feedback in v1. Reminder job will fail the same way next day; accepted. Honest limitation: the customer believes they'll be reminded. Mitigation in copy on the web confirmation: "Si no recibís un WhatsApp en unos minutos, guardá este enlace."
- **E6 Helper books/takes tickets for two relatives from one phone.** Blocked by FR-4.9 for the second turn; told to cancel or wait. Appointments: not blocked (different `memberNumber`s, different `appointmentId`s; reminders go to the same phone — fine).
- **E7 Template send fails** (rejected template, token expired, rate limited): `failed` log + error log; business action already committed. Expired token is an ops event: alerting via Cloud Logging error count is the v1 answer (Q9).
- **E8 Argentine phone matching.** Typed "11 5555 1234" → stored `5491155551234`. Meta's `wa_id` for some Argentine numbers arrives **without the 9** (`541155551234`). Matching inbound phone to `appointment.phone` must compare both forms (`54 9 X` ≡ `54 X`). Store the canonical `549…` form; derive the alternative on lookup. Numbers typed with leading 0 or an embedded 15 → strip "0" prefix; reject if the digit count after stripping ≠ 10 and show the hint (do not try to remove "15" heuristically — area-code lengths vary 2-4 digits).
- **E9 24 h service window.** Walk-in flows are always customer-initiated and intra-day → free-form allowed. Edge: customer links at 08:00, branch closes, turn still `waiting` next day at 09:00 → window expired; free-form send fails with a window error → log `failed`. Acceptable: a stale overnight turn is already an anomaly (no end-of-day cleanup exists today).
- **E10 Queue deactivated or deleted while linked.** `callTurn` can't happen; `ESTADO` still answers from the turn doc (queue name falls back to id). No special handling.
- **E11 Terminal name missing** (`terminalId` not found): called message without counter name.
- **E12 Reschedule after reminder.** Customer reschedules to another day via the URL button → `appointments.date` changes; the reminder fires again the evening before the new date because the idempotency key includes `date` (FR-6.1). Rescheduling to tomorrow after today's 18:00 run → no reminder for it (accepted gap, Q4).
- **E13 Meta webhook retries after a slow run** → FR-1.2 dedupe.
- **E14 Customer types the business number into the Totem flow or a member number into WhatsApp intake that belongs to someone else.** Same as today: `memberNumber` is unvalidated identity (README). WhatsApp adds no new exposure beyond a phone now receiving alerts for a ticket it claimed — equivalent to what Mi Turno's URL already allows.
- **E15 Linking via leaked `turnId`.** Turns are public; anyone with a `turnId` can already see and (via Mi Turno) cancel it. WhatsApp linking does not widen this. Noted, not fixed here.

---

## 9. Sample copy (es_AR, "vos")

- Intake: "Hola. Para sacar turno, mandá tu número de socio (de 1 a 5 cifras)."
- Queue list header: "¿Para qué fila es el turno?"
- Created: "Listo. Turno **4213** — Farmacia. 6 personas por delante. Te llamarían aprox. entre 10:35 y 10:45. Te avisamos por acá. Mandá ESTADO para ver cuánto falta, CANCELAR para cancelar."
- Heads-up: "Quedan 3 personas antes que vos. Si saliste, empezá a volver."
- Called: "Te están llamando. Acercate a **Caja 2**."
- Recalled: "Te volvieron a llamar en Caja 2. Si no te presentás, podés perder el turno."
- Requeued: "No te encontraron. Te pusimos de vuelta en la fila, 3 personas por delante. Te queda 1 aviso más."
- Lost: "Tu turno 4213 se dio por perdido. Para sacar otro, mandá HOLA."
- Opt-out: "Listo, no te vamos a escribir más. Si querés volver a usar el servicio, mandá HOLA."
- Reminder template body: "Hola {{1}}, te recordamos tu cita de {{2}} mañana {{3}} a las {{4}}. Si no podés venir, cancelá para liberar el lugar."

---

## 10. Data / API / business-rule impact (README + Bruno must change in the same PR)

**shared/**
- `Turn.whatsappLinked?: boolean` — new, non-PII. (`shared/src/models/turn.ts`)
- `Appointment.phone?: string`, `Appointment.whatsappOptIn?: boolean` — new. `contact` deprecated (still typed, no longer written). (`shared/src/models/appointment.ts`)
- No new shared model for sessions/messages (functions-internal), but README "Estructura de Datos" must document both collections.

**Firestore collections (new, non-public):** `whatsappSessions/{phone}`, `whatsappMessages/{id}`. Rules: staff read on sessions; messages no client access (like `queueDailyStats`). Index: `whatsappSessions.turnId` (single-field, automatic); `whatsappMessages` composite `kind + refId` (+ `date` per E12); `appointments` composite `date + status + whatsappOptIn` for the reminder job.

**API surface (new):** `whatsappWebhook` (GET/POST, public invoker, signature-gated). `createAppointment` body gains `phone?`, `whatsappOptIn?` (validation: opt-in requires valid phone). Bruno: new folder `whatsapp` with the verify GET and a sample signed inbound POST; update `agenda-public/createAppointment`.

**Scheduled:** `appointmentReminders` daily 18:00 ART.

**Hooks into existing services (post-commit, non-blocking):** `terminalService.callTurn`, `recallTurn`, `handleNoShow`; `turnService.cancelTurn`; `appointmentService.createAppointment`; optionally `appointmentStaffService.callAppointment/recallAppointment/noShowAppointment`.

**Business rules:** none changed. No-show stays manual; ticket numbering untouched; dup guard untouched (reused). New rule to document: one active WhatsApp-linked turn per phone.

**Frontend:** `WebTicketView` button; `TotemView` QR + longer confirm screen (new QR dependency); `TerminalView` badge; `AppointmentBookingView` phone/opt-in replacing contact; `AppointmentAgendaView` badge.

**Ops/new patterns:** Firebase Functions secrets; Meta Business verification; template approvals (`cita_confirmacion`, `cita_recordatorio`, optionally `cita_llamada`, `cita_no_show`); a payment method on the WABA for template messages; a phone number not currently registered on the consumer WhatsApp app (or migrate it).

---

## 11. Open questions for the owner

1. **Number:** new SIM for the WABA, or migrate the branch's current WhatsApp number (loses the consumer app)?
2. **Business verification:** who provides CUIT/legal docs for Meta Business verification, and when? This is the critical path, not code.
3. **Priority queues on WhatsApp:** offer them like the Totem does, or hide and route only to normal queues?
4. **Reminder timing:** 18:00 the day before only? Same-day morning second reminder (extra paid template)? Skip for appointments booked the same day?
5. **`contact` field:** drop it from the form (recommended) or keep it alongside the phone?
6. **Totem QR:** OK to hold the ticket screen ≥ 20 s instead of 5 s?
7. **After-hours intake:** queues are `active` 24/7 unless staff toggles them. Can someone take a WhatsApp ticket at 03:00? Same hole exists in Mi Turno today — accept, or do staff deactivate queues at closing?
8. **Monthly cap** on paid template messages before pausing reminders?
9. **Ops alerting:** is a Cloud Logging error alert to one email enough for "WhatsApp down / token expired" in v1?
10. **Phone visibility to staff:** show the number in Agenda del Día (badge only recommended)?
11. **Copy ownership:** who signs off the Spanish copy and template texts before Meta submission?
