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

### WhatsApp integration (Phase 14, appointments only) — specs: `docs/whatsapp-functional-spec-2026-10-10.md`, `docs/whatsapp-platform-research-2026-10-10.md`, `docs/whatsapp-technical-plan-2026-10-10.md`

Prerequisite (owner): Meta app + test WABA, four secrets set in `dev`, `functions/.secret.local` filled, templates `cita_confirmacion` / `cita_recordatorio` submitted.

- [ ] **WA-T1 — Phone utility.** `functions/src/utils/argentinaPhone.ts` (`normalizeArgentinePhone`, `phoneVariants`; plan D8). Tests: "11 5555 1234" → `5491155551234`; leading 0 stripped; embedded 15 → null; `54…`/`549…` input accepted; non-10-digit → null.
- [ ] **WA-T2 — Model, rules, secrets.** `Appointment.phone?`, deprecate `contact` (plan §2). Rules: `whatsappContacts`, `whatsappMessages`, `appointmentDailyStats` no client access. `functions/src/config/whatsapp.ts` with the four `defineSecret`s; `.gitignore` `functions/.secret.local`. README "Estructura de Datos" + "Variables de Entorno". Verify: `pnpm -F shared build && pnpm -F functions build`.
- [ ] **WA-T3 — Sender + copy.** `services/whatsappService.ts` (`sendTemplate`, `sendText`, `verifyWebhookSignature`; writes `whatsappMessages`; never throws; skips `optedOut`) and `services/whatsappCopy.ts` (spec §8). Tests with mocked `fetch`: payload shape, 5xx → `failed`, opt-out skip, signature ok/bad.
- [ ] **WA-T4 — Webhook.** `services/whatsappInbound.ts` (dedupe, BAJA/STOP/BASTA, `cancel_appt:<id>` → confirm → `SÍ` → `cancelAppointment` with `phoneVariants` match, fallback reply once / 24 h) + `controllers/whatsappController.ts` (GET verify, POST signature, `failed` statuses update log, always 200). Export `whatsappWebhook`. Controller tests with fake req/res. Bruno `whatsapp/`: Verify, Inbound Button, Inbound Text, Status Failed (pre-request script signs the body). README API section. Verify: spec §6 webhook/BAJA/cancel/fallback bullets on the emulator.
- [ ] **WA-T5 — Booking phone + confirmation.** `appointmentService.createAppointment` accepts `phone` (normalize, 400 on invalid, stop writing `contact`); controller pass-through; `triggers/appointmentNotifications.ts` `onAppointmentCreated` → `cita_confirmacion`. Frontend: `AppointmentBookingView` field + hint + privacy line + 10-digit check + confirmation copy; `AppointmentAgendaView` badge; `lib/api.ts`. README `createAppointment` + Bruno `agenda-public`. Verify: spec §6 first three bullets.
- [ ] **WA-T6 — Reminder.** `services/appointmentReminderService.ts` + `appointmentReminders` schedule (18:00 ART) in `scheduledController.ts`. Idempotent per `(cita_recordatorio, id, date)`; skips opted-out / no phone / non-`reservada`. Tests: rerun sends 0; rescheduled cita reminded for new date; opted-out skipped. README scheduled jobs. Verify: spec §6 reminder bullets.
- [ ] **WA-T7 — Stats, purge, docs sweep.** `services/appointmentStatsService.ts` + `appointmentStatsRollup` (03:00 ART) writing `appointmentDailyStats` (by status, with/without phone); `services/whatsappPurgeService.ts` + `whatsappPurge` (03:30 ART) per spec FR-14. Tests on both. README: collections, jobs, Phase 14 roadmap checked with doc links, dev note on the webhook tunnel, ops note on secret rotation + failed-send alert. `docs/whatsapp-test-cases-<date>.md` from spec §6/§7, run on emulator + Meta test number, results in `docs/whatsapp-test-results-<date>.md`.
