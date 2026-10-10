# Plan: Implementar Turnero Digital

## Context
Proyecto greenfield. Specs detalladas en `project-specs.md`, codebase casi vacío (solo boilerplate). Hay que implementar backend completo (Cloud Functions) + frontend prototipo (React).

## Decisiones clave
- Numeración diaria, timezone Argentina (UTC-3)
- Sectors como colección propia en Firestore
- Auth: Firebase Auth para operadores/admins, anónimo para usuarios finales
- Estrategias ratio_based y fifo_across_queues desde el inicio
- Ratio-based state: persistido en doc del terminal
- displayPosition: calculado en query-time
- Sin integración WhatsApp/totem físico (solo campo channel)
- Firestore rules: deferred
- Frontend: prototipo simple
- Package manager: pnpm everywhere (cambiar firebase.json predeploy)

---

## Fase 1: Foundation — tipos, config, errores

**Crear:**
- `shared/src/models/sector.ts` — Sector type
- `shared/src/models/queue.ts` — Queue, ReenqueueConfig, QueueType
- `shared/src/models/terminal.ts` — Terminal, ServingStrategy, StrategyConfig
- `shared/src/models/turn.ts` — Turn, TurnStatus, Channel
- `shared/src/index.ts` — barrel export
- `shared/tsconfig.json` — composite project, declarations
- `functions/src/config/firebase-admin.ts` — initializeApp + export db
- `functions/src/utils/errors.ts` — BusinessError class

**Modificar:**
- `shared/package.json` — typescript dep, build script, main/types fields
- `functions/package.json` — dep `"shared": "workspace:*"`
- `functions/tsconfig.json` — reference shared
- `app/package.json` — dep `"shared": "workspace:*"`
- `app/tsconfig.app.json` — reference shared
- `firebase.json` — cambiar npm a pnpm en predeploy

**Verificar:** `pnpm -F shared build && pnpm -F functions build && pnpm -F app build`

---

## Fase 2: Seed data

**Crear:**
- `functions/src/seed.ts` — script que popula emulator con datos de prueba

**Datos:**
- 2 sectors, 3 queues (1 priority + 2 normal), 2 terminals (1 ratio_based, 1 fifo), 5-8 turns

**Modificar:**
- `functions/package.json` — script `seed:emulator`

**Verificar:** `pnpm -F functions seed:emulator` + ver docs en Firestore emulator UI

---

## Fase 3: Crear turno + consultar estado

**Crear:**
- `functions/src/services/turnService.ts` — `createTurn()` (transacción, numeración diaria), `getCurrentTurn(memberId)`
- `functions/src/controllers/turnController.ts` — `createTurnHandler`, `getCurrentTurnHandler`

**Modificar:**
- `functions/src/index.ts` — exportar handlers

**Lógica clave:**
- `createTurn` en transacción para evitar números duplicados
- Reset diario: filtrar por `createdAt >= hoy midnight AR`
- Validar que queue existe

**Verificar:** curl POST /turns + GET /members/:id/current-turn

---

## Fase 4: Terminal — happy path (next/call/start/finish)

**Crear:**
- `functions/src/services/terminalService.ts` — `getNextTurn(terminalId)`, `callTurn()`, `startTurn()`, `finishTurn()`
- `functions/src/services/queueService.ts` — `getWaitingTurns(queueId)`, helpers de estrategia
- `functions/src/controllers/terminalController.ts` — handlers para 4 endpoints

**Modificar:**
- `functions/src/index.ts` — exportar handlers

**Lógica clave:**
- fifo_across_queues: merge waiting de todas las colas activas, pick menor currentTurnNumber
- ratio_based: counter en terminal doc, alternar normal/priority según ratio configurado
- Transacciones en todas las transiciones de estado
- Validar: waiting→called→attending→finished

**Verificar:** curl full lifecycle con seed data

---

## Fase 5: No-show + requeue + recall

**Agregar a archivos existentes:**
- `turnService.ts` — `requeueTurn(turnId)`, `noShowTurn(terminalId, turnId)`
- `terminalService.ts` — `recallTurn(terminalId, turnId)`
- `terminalController.ts` — `noShowHandler`, `recallTurnHandler`

**Modificar:**
- `functions/src/index.ts` — exportar nuevos handlers

**Verificar:** crear turno → call → no-show → verificar requeue. Exceder maxAttempts → verificar cancelled.

---

## Fase 6: Admin endpoints + stats

**Crear:**
- `functions/src/services/statsService.ts` — `getQueueStats(queueId)`
- `functions/src/controllers/adminController.ts` — `getQueueStatsHandler`, `updateQueueConfigHandler`

**Modificar:**
- `functions/src/index.ts` — exportar handlers

**Verificar:** curl GET stats, PUT config

---

## Fase 7: Frontend setup + Totem view

**Crear:**
- `app/src/lib/api.ts` — fetch wrapper (functions URL / emulator)
- `app/src/views/TotemView.tsx` — seleccionar cola, sacar turno, ver número
- Refactorizar `app/src/App.tsx` — React Router con 4 rutas

**Instalar:** react-router-dom

**Verificar:** browser → elegir cola → obtener turno

---

## Fase 8: Public Display view

**Crear:**
- `app/src/views/PublicDisplay.tsx` — Firestore onSnapshot en turns status=called, mostrar turno + terminal

**Verificar:** abrir display, llamar turno via curl, verlo aparecer real-time

---

## Fase 9: Terminal/Operador view

**Crear:**
- `app/src/views/TerminalView.tsx` — botones: next, call, start, finish, no-show, recall. Info turno actual + cola

**Verificar:** flujo completo por UI

---

## Fase 10: Admin view

**Crear:**
- `app/src/views/AdminView.tsx` — CRUD sectors/queues/terminals + stats

**Verificar:** crear/editar config desde UI, ver stats

---

## Dependencias entre fases

```
1 → 2 → 3 → 4 → 5
1 → 6
3 → 7
4 → 8
5 → 9
6 → 10
```

Fases 6 y 3 pueden ir en paralelo después de 1. Frontend (7-10) puede empezar después de su backend correspondiente.

---

## Tasks

- [x] ~~Remove the shared navbar from TotemView (`app/src/views/TotemView.tsx`, route `/` in `app/src/App.tsx`). Totem is an unattended public kiosk (like `PublicDisplay` at `/display`) with an idle-reset loop; the navbar exposes staff-only links (Terminal/Admin) and lets customers navigate away from the kiosk flow. Move the `/` route out of the `nav`-wrapped `/*` route, giving it its own layout with no navbar — mirroring how `/display` is already handled. Verify: loading `/` shows no navbar and the number-entry → queue-select → ticket → auto-reset flow still works.~~ → report: totem-navbar-removal-c0f9e19.md

### WhatsApp integration (Phase 14) — specs: `docs/whatsapp-functional-spec-2026-10-10.md`, `docs/whatsapp-platform-research-2026-10-10.md`, `docs/whatsapp-technical-plan-2026-10-10.md`

Prerequisite (owner, not a task): Meta app + test WABA created, the four secrets set in the `dev` project, `functions/.secret.local` filled, `VITE_WHATSAPP_NUMBER` set. Tasks reference plan section numbers (§).

- [ ] **WA-T1 — Pure utilities.** Add `functions/src/utils/argentinaPhone.ts` (`normalizeArgentinePhone`, `phoneVariants`; plan §3, D5) and `functions/src/services/turnEstimate.ts` (server port of `app/src/hooks/useTurnEstimate.ts`: same 10-min default, 5-min floor, 10-min range). Unit tests for both, including parity cases copied from the client hook and the AR phone edge cases in spec E8 (leading 0, embedded 15 rejected, already-canonical 54/549 input). No wiring yet. Verify: `pnpm -F functions test`.
- [ ] **WA-T2 — Model, rules, indexes, secrets config.** `Turn.whatsappLinked?`, `Appointment.phone?`/`whatsappOptIn?`, deprecate `contact` (plan §2.1). Add `whatsappSessions`/`whatsappMessages` rules (staff read / no access) and the composite indexes in plan §2.2. Add `functions/src/config/whatsapp.ts` with the four `defineSecret`s + `GRAPH_API_VERSION`; add `functions/.secret.local` to `.gitignore`; `.env.example` + `vite-env.d.ts` + both GitHub workflows get `VITE_WHATSAPP_NUMBER`. README "Estructura de Datos" + "Variables de Entorno" updated in the same change. Verify: `pnpm -F shared build && pnpm -F functions build && pnpm -F app build`.
- [ ] **WA-T3 — Outbound sender + delivery log + signature check.** `functions/src/services/whatsappService.ts` (`sendText`, `sendInteractiveList`, `sendInteractiveButtons`, `sendTemplate`, `verifyWebhookSignature`) per plan §3: native `fetch` to Graph `/{phoneNumberId}/messages`, write a `whatsappMessages` doc per send, never throw, suppress when the session is `optedOut`. `functions/src/services/whatsappCopy.ts` with all customer strings from spec §9. Tests: mocked `fetch` (payload per kind, 5xx → `status: failed`, opt-out suppression), signature ok/bad with `timingSafeEqual`. Verify: tests green.
- [ ] **WA-T4 — Webhook, sessions, opt-out, status updates.** `functions/src/services/whatsappSessionService.ts`, `whatsappStatus.ts`, `whatsappInbound.ts` (skeleton: dedupe by `lastInboundMessageId`, draft expiry 30 min, rate limit `wa:<phone>`, `BAJA`/`STOP`/`BASTA` opt-out + re-engage, `AYUDA`, unsupported media reply, one reply per inbound) and `controllers/whatsappController.ts` (GET verify → challenge/403; POST signature → 403; always 200 after processing; plan D2). Export `whatsappWebhook` in `index.ts`. Controller tests with fake req/res like `appointmentController.test.ts`. Bruno `whatsapp/` folder: `Verify Webhook`, `Inbound Text`, `Status Update` with a pre-request script computing `X-Hub-Signature-256`. README API section for `whatsappWebhook`. Verify: acceptance "Platform" block in spec §7 against the emulator.
- [ ] **WA-T5 — Walk-in lifecycle alerts (trigger).** `functions/src/triggers/turnNotifications.ts`: `onDocumentWritten("turns/{turnId}")` bound to secrets; pure `diffTurnEvents(before, after)` → called / recalled / requeued / lost / cancelled (spec FR-2.1–2.8); `notifyTurnEvents` resolves terminal + queue names, sends via `whatsappService`; heads-up to the 3rd waiting turn on every `called` with `headsUpSentFor = turnId:requeueCount` dedupe (FR-2.5); clear `session.turnId` on lost/cancelled/finished. Export `onTurnWritten`. Tests: `diffTurnEvents` table, heads-up dedupe, requeued "personas por delante" matches Mi Turno's count. Verify: acceptance "Walk-in alerts" block.
- [ ] **WA-T6 — Link an existing ticket.** Inbound `TURNO <id>` command (spec FR-3.3, relink confirm state) + `turnService.setWhatsappLinked`. Frontend: `WebTicketView` "Avisarme por WhatsApp" `wa.me` button while `waiting|called`; `TotemView` QR of the same URL on the confirmation screen with `CONFIRM_DISPLAY_MS` 20 s for that screen only (manual reset kept), QR via a small dependency, both hidden when `VITE_WHATSAPP_NUMBER` is empty; `TerminalView` "WhatsApp" badge on current turn + waiting rows. README Vistas section. Verify: acceptance "Linking" block; `pnpm -F app lint && pnpm -F app build`.
- [ ] **WA-T7 — Take a ticket via WhatsApp + ESTADO/CANCELAR.** Complete the state machine in `whatsappInbound.ts` (spec FR-4.1–4.11): intake → interactive list of active queues (≤10) or numbered menu → `createTurn(queueId, memberNumber, "whatsapp")` → link → status summary using `turnEstimate`; dup-guard detection (FR-4.4); `ESTADO`/`POSICION`/`DONDE`; `CANCELAR` → confirm → `cancelTurn`; one active linked turn per phone (FR-4.9); error copy mapping (FR-4.5). Table-driven tests `[state, inbound] → [reply, nextState, serviceCalls]`. README: document the "one active WhatsApp-linked turn per phone" rule and `channel: "whatsapp"` now being produced. Verify: acceptance "Intake" block.
- [ ] **WA-T8 — Appointment phone + opt-in + confirmation template.** `appointmentService.createAppointment` accepts `phone`/`whatsappOptIn` (normalize server-side; opt-in without valid phone → `ValidationError`; stop writing `contact`); controller pass-through; `functions/src/triggers/appointmentNotifications.ts` `onAppointmentCreated` → template `cita_confirmacion` (plan §6) when opted in. Frontend `AppointmentBookingView`: "Celular (WhatsApp)" field + hint + opt-in checkbox (unchecked default), client 10-digit check, confirmation copy "Si no recibís un WhatsApp…"; `AppointmentAgendaView` badge; `lib/api.ts` payload. README `createAppointment` + Bruno `agenda-public` request updated. Tests: service validation, trigger helper with mocked sender. Verify: acceptance "Appointments" first three bullets.
- [ ] **WA-T9 — Day-before reminder + cancel button flow.** `functions/src/services/appointmentReminderService.ts` (`sendTomorrowReminders`: tomorrow ART, `reservada`, opted in, not `optedOut`, idempotent via `whatsappMessages` `templateName+refId+refDate`) + `appointmentRemindersHandler` `onSchedule("0 18 * * *", ART)` in `scheduledController.ts`, export `appointmentReminders`. Inbound: `button_reply.id = cancel_appt:<id>` → phone match via `phoneVariants` → confirm → `cancelAppointment`; plain `CANCELAR` with no turn but upcoming appointment(s) (spec FR-6.3/6.4, E4 disambiguation). Tests: idempotency (second run sends 0), rescheduled appointment reminded again for the new date, phone mismatch rejected. README scheduled jobs section. Verify: acceptance "Appointments" reminder/cancel bullets.
- [ ] **WA-T10 (optional, cut first) — Appointment called / no-show notices.** `onAppointmentUpdated` in `appointmentNotifications.ts`: `reservada→llamada` and `recallCount` bump → template `cita_llamada`; `→no_show` → `cita_no_show`; only when opted in and not `optedOut` (spec §6.7). Tests on the diff helper. README.
- [ ] **WA-T11 — Final docs sweep + manual test run.** `docs/whatsapp-test-cases-<date>.md` covering spec §7 acceptance criteria and §8 edge cases; run them against the emulator with Bruno + against the Meta test number with a tunnel; record results in `docs/whatsapp-test-results-<date>.md`. README Phase 14 roadmap checked with links to the three WhatsApp docs; dev-section note on the webhook tunnel; ops note on secret rotation. Verify: every README/Bruno change from WA-T2…T10 is actually present.
