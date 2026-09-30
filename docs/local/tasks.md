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
- [ ] Show the estimated service time in Mi Turno (`/mi-turno`). Implement the approved plan in `docs/local/plan-estimacion-espera-2026-09-30.md` end to end: (1) extract a pure `pickNextTurn` from `terminalService.ts` and chunk the Firestore `in` queries in `queueService.ts`; (2) add `terminals.avgServiceSeconds` (EMA 0.2, 30-min cap per sample, updated in `finishTurn`) and a public `GET /getTurnEstimate?turnId=` that simulates the real dispatch across every online terminal serving the queue and returns `{ position, estimatedAt }` (both `null` when the turn is not waiting or no online terminal serves it), default 10 min per customer when no average exists; (3) in `WebTicketView.tsx` replace the same-queue "people ahead" listener with a `useTurnEstimate` hook (terminal `onSnapshot` trigger, 30 s throttle) and show the position plus a 10-minute range "Te atenderían aprox. entre HH:MM y HH:MM", or "Todavía no hay mostrador atendiendo esta fila" when there is no estimate. Follow the plan's test list, README and Bruno updates, and its three commits in order (push after each). Verify with `pnpm -F shared build && pnpm -F functions build && pnpm -F functions test && pnpm -F functions lint && pnpm -F app lint && pnpm -F app build`, then in the emulator: take a turn in `/mi-turno`, confirm position + range, call the next turn from `/terminal` and confirm the range updates without reload, pause the only terminal and confirm the "no mostrador" message. Finally update the user manual (Claude Docs) section "En Mi Turno" with the new text and a screenshot.
