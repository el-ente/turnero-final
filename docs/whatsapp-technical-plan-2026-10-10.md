# WhatsApp Integration — Technical Plan (2026-10-10)

Implements `docs/whatsapp-functional-spec-2026-10-10.md` (features F1–F7) under the constraints in `docs/whatsapp-platform-research-2026-10-10.md`. Supersedes `docs/whatsapp-integration-plan-2026-08-11.md`. Ordered task list lives in `docs/local/tasks.md` ("WhatsApp" block).

## 0. Decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | **Firestore triggers**, not post-commit hooks inside `terminalService` / `turnService` / `appointmentService`, drive every outbound notification. | Zero edits to the transactional code paths; sends can never slow or fail a cashier action; Firebase retries the trigger on transient failure; one trigger covers cancel/call/recall/requeue regardless of which endpoint caused it. Cost: event detection = diff of `before` vs `after` snapshots (pure function, unit-tested). |
| D2 | Webhook processes inbound messages **synchronously** and always answers `200`, even on handler errors. | Cloud Functions v2 doesn't guarantee CPU after the response is sent, so "ack then work" is unsafe; a handler run is 2–3 Firestore reads + one Graph call, well under Meta's timeout. Returning non-200 would make Meta re-deliver a poison message forever. |
| D3 | Phone data lives in two new **non-public** collections, `whatsappSessions/{phone}` and `whatsappMessages/{id}`. `turns` only gets a boolean `whatsappLinked`. | `turns` is world-readable (Totem/Display/Mi Turno listeners). `appointments` already holds PII and is staff-only, so `phone` can go on it. |
| D4 | Secrets via `defineSecret` (Secret Manager), one set per Firebase project; the public business number for `wa.me` links is a Vite env var (`VITE_WHATSAPP_NUMBER`). | Standard v2 mechanism. `dev`/`qa` bind the Meta **test number** (5 allow-listed recipients, free); `prod` the real number. |
| D5 | Argentine phone normalisation lives in `functions/src/utils/argentinaPhone.ts`; the client only checks "10 digits after stripping". | `shared/` is types-only today; keep it that way. Server is the single source of truth for the canonical `549…` form. |
| D6 | Message copy and the tiny intake state machine are plain TypeScript (`switch` on `session.state`), no bot framework. | 4 states, ~8 commands. A framework would be the biggest dependency in the repo for the smallest module. |
| D7 | Templates are created **manually** in WhatsApp Manager; the code only references them by name + language. Template text is versioned in this doc (§6). | Template creation via API needs `whatsapp_business_management` plumbing and an approval wait loop that doesn't belong in deploy. |
| D8 | No retry queue for failed sends in v1. Failure → `whatsappMessages.status = "failed"` + `logger.error`. | Alerts are time-sensitive (a "you're called" that arrives 10 min late is noise). Reminders get a natural retry from the next day's run only if still pending (they won't be) — accepted. |
| D9 | `Appointment.contact` is no longer written; replaced by `phone` + `whatsappOptIn`. Type stays for old docs. | Spec FR-5.1 / Q5 (recommended answer taken; owner can veto). |

## 1. Target architecture

```
                 Meta Cloud API (graph.facebook.com/v24.0)
                    ▲ send                      │ webhook (GET verify / POST events)
                    │                           ▼
   ┌────────────────┴───────────┐   ┌───────────────────────────┐
   │ services/whatsappService.ts│   │ controllers/whatsappController.ts │  onRequest, public invoker,
   │  sendText/sendInteractive/ │◀──│  verify signature (rawBody)       │  secrets bound
   │  sendTemplate + log        │   │  dedupe by message id             │
   └────────────┬───────────────┘   │  → services/whatsappInbound.ts    │  (state machine + commands)
                │ writes            └───────────────────────────┘
                ▼
   whatsappMessages/{id}   whatsappSessions/{phone}
                ▲                        ▲
                │                        │ lookup by turnId / phone
   ┌────────────┴────────────────────────┴───────────────┐
   │ triggers/turnNotifications.ts   onDocumentWritten(turns/{id})        │
   │ triggers/appointmentNotifications.ts onDocumentCreated/Updated(appointments/{id}) │
   │ controllers/scheduledController.ts  appointmentReminders @ 18:00 ART │
   └─────────────────────────────────────────────────────┘
```

Existing services (`terminalService`, `turnService`, `appointmentService`, `appointmentStaffService`) are **not modified** except: `turnService.createTurn` already accepts `channel: "whatsapp"`; `appointmentService.createAppointment` gains `phone`/`whatsappOptIn` validation; a new `turnService.setWhatsappLinked(turnId)` helper.

## 2. Data model

### 2.1 shared (`shared/src/models`)

```ts
// turn.ts
export interface Turn { /* … */ whatsappLinked?: boolean; } // non-PII, lets Terminal show a badge

// appointment.ts
export interface Appointment {
  /* … */
  /** @deprecated no longer written since WhatsApp integration; read-only for old docs */
  contact?: string;
  phone?: string;          // canonical digits "549XXXXXXXXXX" (see utils/argentinaPhone.ts)
  whatsappOptIn?: boolean; // explicit consent captured in the booking form
}
```

### 2.2 Firestore (new, functions-internal; documented in README "Estructura de Datos")

`whatsappSessions/{phone}` — one per WhatsApp user (`phone` = Meta `wa_id` digits):

```ts
interface WhatsappSession {
  phone: string;
  state: "idle" | "awaiting_member" | "awaiting_queue" | "awaiting_cancel_confirm" | "awaiting_relink_confirm";
  draft?: { memberNumber?: number; queueOptions?: string[]; cancelTarget?: {type: "turn"|"appointment"; id: string}; relinkTurnId?: string };
  turnId?: string;                 // the one active linked walk-in turn
  headsUpSentFor?: string;         // `${turnId}:${requeueCount}` — dedupes the "3 ahead" ping
  optedOut: boolean;
  lastInboundAt: Date;
  lastInboundMessageId: string;    // webhook dedupe (Meta retries)
  createdAt: Date;
  updatedAt: Date;
}
```

`whatsappMessages/{autoId}` — audit/delivery log, one per outbound send:

```ts
interface WhatsappMessage {
  to: string;                       // phone digits
  kind: "text" | "interactive" | "template";
  templateName?: string;            // e.g. "cita_recordatorio"
  refType?: "turn" | "appointment";
  refId?: string;
  refDate?: string;                 // appointments: the date the reminder was for (idempotency per date)
  status: "sent" | "failed" | "delivered" | "read";
  waMessageId?: string;             // Graph response messages[0].id, matched by status webhooks
  error?: {code: number; title: string};
  createdAt: Date;
  updatedAt: Date;
}
```

Rules (`firestore.rules`): `whatsappSessions` read for `admin|supervisor|cashier`, write false; `whatsappMessages` no client access at all (omit → default deny, like `queueDailyStats`).

Indexes (`firestore.indexes.json`):
- `whatsappSessions`: `turnId` single-field (automatic).
- `whatsappMessages`: composite `templateName ASC, refId ASC, refDate ASC` (reminder idempotency) and `waMessageId` single-field (automatic).
- `appointments`: composite `date ASC, status ASC, whatsappOptIn ASC` (reminder job). Also `phone ASC, status ASC, date ASC` (inbound `CANCELAR` lookup by phone).

## 3. Backend modules (functions/src)

| File | Responsibility |
|------|----------------|
| `config/whatsapp.ts` | `defineSecret` × 4 (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`), `GRAPH_API_VERSION = "v24.0"`, exported `WHATSAPP_SECRETS` array to bind on every function that sends. |
| `utils/argentinaPhone.ts` | `normalizeArgentinePhone(input): string \| null` (strip non-digits, drop leading `0`, require 10 digits → `549` + digits; accept already-canonical `54…`), `phoneVariants(canonical): string[]` (`549X` and `54X`, for matching Meta's `wa_id`). Pure, unit-tested. |
| `services/whatsappService.ts` | `sendText(to, body, ref?)`, `sendInteractiveList(to, header, rows, ref?)`, `sendInteractiveButtons(to, body, buttons, ref?)`, `sendTemplate(to, name, bodyParams, buttons?, ref?)`. Each: `fetch` POST to Graph, write `whatsappMessages`, never throw (returns `{ok, waMessageId?, error?}`), honours `optedOut` by reading the session first. `verifyWebhookSignature(rawBody, header, appSecret)` with `crypto.timingSafeEqual`. |
| `services/whatsappSessionService.ts` | `getSession(phone)`, `getSessionByTurnId(turnId)`, `upsertSession(phone, patch)`, `linkTurn(phone, turnId)` (also `setWhatsappLinked`), `clearTurn(phone)`, `isDuplicateInbound(session, messageId)`. |
| `services/whatsappCopy.ts` | Every customer-facing string as a function (`calledCopy(terminalName)`, `statusSummaryCopy(turn, queue, estimate)` …). Keeps copy reviewable in one file (spec Q11). |
| `services/turnEstimate.ts` | Server port of `app/src/hooks/useTurnEstimate.ts`: `estimateCall(queue, position, now)` → `{from, to}` with the same 10-min default, 5-min floor, 10-min range. Pure, unit-tested against the client's numbers. |
| `services/whatsappInbound.ts` | `handleInboundMessage(msg)` — the state machine: command parsing (`HOLA`, `TURNO <id>`, `ESTADO`/`POSICION`/`DONDE`, `CANCELAR`, `SÍ`/`SI`/`NO`, `BAJA`/`STOP`/`BASTA`, `AYUDA`), interactive replies (`list_reply.id`, `button_reply.id` incl. `cancel_appt:<id>`), draft expiry (30 min), one reply per inbound, rate limit via `checkRateLimit("wa:"+phone)`. Delegates to `turnService.createTurn/cancelTurn`, `appointmentService.cancelAppointment`. |
| `services/whatsappStatus.ts` | `handleStatusUpdate(status)` → update `whatsappMessages` by `waMessageId`; on `failed` with `131026` mark session `unreachable: true` (appointments only use). |
| `controllers/whatsappController.ts` | `whatsappWebhookHandler = onRequest({cors: false, invoker: "public", secrets})`. GET: verify token → echo `hub.challenge` (200) or 403. POST: signature check (403) → iterate `entry[].changes[].value.messages[]` and `.statuses[]` → always `200 {}`; errors are logged, never returned. |
| `triggers/turnNotifications.ts` | `onTurnWritten = onDocumentWritten("turns/{turnId}", {secrets})`. Pure `diffTurnEvents(before, after)` → `("called"\|"recalled"\|"requeued"\|"lost"\|"cancelled")[]`; `notifyTurnEvents(turn, events)` looks up the session by `turnId`, resolves terminal/queue names, sends; on `called` also runs `sendHeadsUpForQueue(queueId)` (3rd waiting turn, dedupe via `headsUpSentFor`). |
| `triggers/appointmentNotifications.ts` | `onAppointmentCreated` → `cita_confirmacion` template when `whatsappOptIn && phone`. Optional F7: `onAppointmentUpdated` → `cita_llamada` / `cita_no_show` templates on `reservada→llamada`, `recallCount` bump, `→no_show`. |
| `controllers/scheduledController.ts` | add `appointmentRemindersHandler = onSchedule({schedule: "0 18 * * *", timeZone: ART, secrets})` → `appointmentReminderService.sendTomorrowReminders()`. |
| `services/appointmentReminderService.ts` | Query tomorrow's `reservada` + opted-in; skip if a `whatsappMessages` doc exists with `templateName == "cita_recordatorio" && refId == id && refDate == date`; skip `optedOut`; send template with quick-reply `cancel_appt:<id>` + URL button. Returns `{sent, skipped, failed}` for logging. |
| `index.ts` | export `whatsappWebhook`, `onTurnWritten`, `onAppointmentCreated`, (`onAppointmentUpdated`), `appointmentReminders`. |

Modified: `services/appointmentService.createAppointment` (+`phone`, `whatsappOptIn`; opt-in without valid phone → `ValidationError`; stop writing `contact`), `controllers/appointmentController.createAppointmentHandler` (pass-through), `services/turnService` (+`setWhatsappLinked`).

Webhook event handling detail:
- Dedupe: compare `messages[i].id` with `session.lastInboundMessageId` (cheap, covers Meta's immediate retry); statuses are idempotent updates.
- Signature: `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(`req.rawBody`, app secret). `req.rawBody` is a `Buffer` on `onRequest` (checked in `firebase-functions@7.2.2`).
- Only `type: "text"` and `type: "interactive"` are handled; anything else gets the "Solo leo mensajes de texto" line once.
- Mark-as-read: skipped in v1 (one extra paid-free call, cosmetic).

## 4. Frontend (app/src)

| View | Change |
|------|--------|
| `views/WebTicketView.tsx` | While `waiting\|called`: button "Avisarme por WhatsApp" → `https://wa.me/${VITE_WHATSAPP_NUMBER}?text=${encodeURIComponent("TURNO " + turnId)}`; hidden when the env var is empty. |
| `views/TotemView.tsx` | Confirmation screen renders a QR of the same URL + caption; `CONFIRM_DISPLAY_MS` → 20 000 for this screen (manual "Nuevo turno" stays). QR via a small dependency (`qrcode.react` or equivalent, ~1 import); render nothing when the env var is empty so kiosks without WhatsApp keep today's behaviour. |
| `views/TerminalView.tsx` | "WhatsApp" badge on the current-turn panel and waiting rows when `turn.whatsappLinked`. |
| `views/AppointmentBookingView.tsx` | Replace "Contacto (opcional)" with "Celular (WhatsApp)" (hint: "Código de área sin 0 y número sin 15, ej. 11 5555 1234") + checkbox "Quiero recibir recordatorios por WhatsApp" (unchecked by default). Client validation: 10 digits after stripping; opt-in requires phone. Confirmation screen: "Si no recibís un WhatsApp en unos minutos, guardá este enlace." |
| `views/AppointmentAgendaView.tsx` | Badge "WhatsApp" next to `contactName` when `whatsappOptIn && phone`; number not shown. |
| `lib/api.ts` | `createAppointment` payload gains `phone?`, `whatsappOptIn?`. |
| Env | `VITE_WHATSAPP_NUMBER` (digits, e.g. `5491155551234`) in `.env.example`, `app/src/vite-env.d.ts`, both GitHub workflows. |

## 5. Secrets, environments, local dev

- Create per project: `firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN|WHATSAPP_APP_SECRET|WHATSAPP_VERIFY_TOKEN|WHATSAPP_PHONE_NUMBER_ID --project dev|qa|prod`. CI deploy needs no change (secrets are read at deploy by name; the `gh-deployer` SA needs `roles/secretmanager.secretAccessor` on them — one-time IAM step per project).
- Emulator: `functions/.secret.local` (git-ignored, add to `.gitignore`) with the same four keys; the emulator loads it automatically. Webhook from Meta to a laptop needs a tunnel (`ngrok`/`cloudflared`) — documented in README dev section; alternatively drive the webhook with the Bruno signed-POST request (§8).
- `dev`/`qa` share the Meta **test number** (one WABA, one phone-number-id; recipients allow-listed). Because both projects would receive the same webhook, point the test app's webhook at **dev only**; `qa` sends but doesn't receive (acceptable until a second test app is created).
- `prod`: real number, display name approved, payment method on the WABA, business verification in progress or done.

## 6. Message templates (created in WhatsApp Manager, category **Utility**, language **es_AR**)

| Name | Body | Buttons | Params |
|------|------|---------|--------|
| `cita_confirmacion` | `Hola {{1}}. Tu cita de {{2}} quedó reservada para el {{3}} a las {{4}}. Código: {{5}}.` | URL "Ver cita" → `https://<host>/agenda/{{1}}?memberNumber={{2}}` (dynamic suffix) | 1 contactName, 2 serviceName, 3 fecha larga ("jueves 15 de octubre"), 4 HH:mm, 5 appointmentId |
| `cita_recordatorio` | `Hola {{1}}, te recordamos tu cita de {{2}} mañana {{3}} a las {{4}}. Si no podés venir, cancelá para liberar el lugar.` | Quick reply "Cancelar cita" (payload `cancel_appt:<id>`), URL "Ver / reprogramar" | same as above minus código |
| `cita_llamada` (F7, optional) | `Te están llamando para tu cita de {{1}}. Acercate al mostrador.` | — | 1 serviceName |
| `cita_no_show` (F7, optional) | `No te presentaste a tu cita de hoy de {{1}}. Podés reservar otra en {{2}}.` | — | 1 serviceName, 2 booking URL |

Walk-in alerts are **free-form text** (customer-initiated window) — no templates. If the window has expired (overnight turn, E9) the send fails with `131047` and is logged; no template fallback in v1.

Template approval takes up to 24 h; names/params above are the contract the code uses. Changing a template body in Manager does not require a deploy; changing param count does.

## 7. Testing

- Pure units (Jest, existing `db` automock + `helpers.mockRunTransaction`): `argentinaPhone`, `turnEstimate` (parity with client cases), `diffTurnEvents`, `whatsappCopy` snapshots, `verifyWebhookSignature`, inbound state machine (table-driven: `[state, inbound] → [reply, nextState, serviceCalls]`), `appointmentReminderService` idempotency.
- `whatsappService`: mock global `fetch`; assert payload shape per kind, `whatsappMessages` write, no-throw on 5xx, opt-out suppression.
- `whatsappController`: call the handler with fake `req` (`rawBody`, headers, body) / `res` — same approach as `appointmentController.test.ts`; GET verify ok/403; POST bad signature 403; POST valid → 200 and `handleInboundMessage` called once per message; duplicate id → once.
- Triggers: unit-test the exported pure/async helpers, not the `onDocumentWritten` wrapper.
- Manual (emulator): `pnpm dev`, Bruno `whatsapp/` requests; end-to-end with the Meta test number + tunnel before the first `qa` promotion. Add a `docs/whatsapp-test-cases-*.md` like the Agenda module did.

## 8. Docs & API collection (same PR as the code, per project rule)

- README: new collections in "Estructura de Datos"; `createAppointment` body; `whatsappWebhook` section; `appointmentReminders` under scheduled jobs; `VITE_WHATSAPP_NUMBER` + the four secrets in "Variables de Entorno"; Phase 14 roadmap checkbox + link to these docs; dev-section note on the tunnel.
- Bruno: `bruno/turnero-api/whatsapp/` with `Verify Webhook.bru` (GET) and `Inbound Text.bru` / `Inbound Button.bru` / `Status Update.bru` (POST with a pre-request script computing `X-Hub-Signature-256` from an env var `whatsappAppSecret`); update `agenda-public` create request body.

## 9. Delivery order & dependencies

```
T1 phone util + estimate port (pure)      ─┐
T2 model + rules + indexes + secrets cfg   ─┼─▶ T3 sender + log + signature ─▶ T4 webhook + sessions + opt-out
                                            │                                  │
                                            │        T5 turn trigger (alerts + heads-up) ◀─┘
                                            │        T6 linking (TURNO cmd, Mi Turno button, Totem QR, Terminal badge)
                                            │        T7 intake + ESTADO/CANCELAR
                                            └──────▶ T8 appointment phone/opt-in + confirmation template
                                                     T9 reminder job + cancel button flow
                                                     T10 (optional) appointment called/no-show
                                                     T11 README + Bruno + test-cases doc (continuous, final sweep)
```

Non-code critical path (owner): Meta business portfolio → app → test number → secrets in `dev` → templates submitted → real number + display name → payment method → business verification. Start it **before** T1; T8/T9 cannot be verified end-to-end until `cita_*` templates are `APPROVED`.

## 10. Risks specific to this plan

- **Trigger latency**: Firestore triggers typically fire in <2 s, occasionally 10 s+ on cold start. Acceptable for "you're called"; `minInstances: 1` on `onTurnWritten` in prod if it proves noisy (cost ~US$5/month).
- **Test number shared by dev/qa**: webhook can only point at one; documented above.
- **Pricing drift**: Meta changed the model twice in 15 months; copy and budget assume ~US$0.02/message. Re-check the rate card at go-live and quarterly.
- **`wa_id` ≠ typed phone** for Argentina: mitigated by `phoneVariants`; verify with real numbers on the test WABA early (T8).
- **Secret rotation**: the permanent system-user token survives until revoked; rotate via `functions:secrets:set` + redeploy. Document in README ops.

## 11. Open questions (owner) — unchanged from the spec §11

1. New SIM vs migrate branch number? 2. Who runs Meta business verification, when? 3. Hide priority queues on WhatsApp? 4. Reminder: 18:00 day-before only? 5. Drop `contact` (plan assumes yes)? 6. Totem screen 20 s OK? 7. After-hours intake acceptable? 8. Monthly paid-message cap? 9. Cloud Logging email alert enough? 10. Show phone to staff (plan: badge only)? 11. Copy sign-off owner?
