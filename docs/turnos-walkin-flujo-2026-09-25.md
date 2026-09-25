# Flujo de Turnos Walk-in (Totem/Terminal/Display) — Documentación funcional

**Fecha**: 2026-09-25
**Estado**: Documentación del sistema tal como está implementado (as-built), relevada directamente del código. No es una spec de diseño — es la contraparte de `docs/turnos-agendados-spec-2026-09-25.md`, pero para el sistema **walk-in** (`Sector`/`Queue`/`Terminal`/`Turn`), que ya está en producción.

---

## 1. Entidades del dominio

| Entidad | Modelo | Qué es |
|---|---|---|
| **Sector** | `shared/src/models/sector.ts` | Área física/administrativa (ej. "Farmacia"). Solo `name` + `description`. |
| **Queue** (Cola) | `shared/src/models/queue.ts` | Fila de espera dentro de un Sector. Tipo `normal` o `priority`, `reenqueueConfig` (reencolado en no-show), `servedBy[]` (terminales que la atienden, sincronizado automáticamente), `active` (si acepta turnos nuevos). |
| **Terminal** | `shared/src/models/terminal.ts` | Puesto de atención (mostrador). Puede cubrir varios Sectores (`sectorIds[]`) y varias Colas activas a la vez (`activeQueueIds[]`). Tiene una estrategia de despacho (`servingStrategy`) y como mucho un turno en curso (`currentTurnId`). |
| **Turn** (Turno) | `shared/src/models/turn.ts` | El ticket de un cliente. Identificado por `memberNumber` (número de socio, 1-99999, **no** correlativo diario — lo escribe el cliente en el Totem/Mi Turno, sin validar contra ningún padrón). Pertenece a una única `Queue`. |

---

## 2. Estados de un Turn

```
WAITING   → CALLED       (staff aprieta "Llamar siguiente" en Terminal)
CALLED    → CALLED       (re-llamado; mismo turno, solo suma recallCount)
CALLED    → ATTENDING    (staff aprieta "Iniciar atención")
ATTENDING → FINISHED     (staff aprieta "Finalizar")
WAITING   → CANCELLED    (cliente cancela, solo en WAITING)
CALLED    → WAITING      (no-show con reencolado habilitado — ver §5)
CALLED    → CANCELLED    (no-show sin reencolado, o reencolado agotado — ver §5)
```

`NO_SHOW` existe como valor del enum (`shared/src/models/turn.ts:12`) pero **ningún camino de código lo escribe** — está documentado así explícitamente en el comentario de cabecera del archivo (`turn.ts:1-6`). Un no-show real termina en `WAITING` (reencolado) o `CANCELLED` (reencolado agotado/deshabilitado), nunca en `NO_SHOW`. Es el mismo patrón conceptual que el spec de Agenda reusa para su propio no-show manual, pero con mecánica distinta (allá es 100% manual con doble confirmación; acá el reencolado es automático por config de la Cola).

---

## 3. Flujos end-to-end

### A. Cliente saca turno — dos canales, misma API

**A.1 Totem (`/`, `app/src/views/TotemView.tsx`)**: kiosko público sin login, pantalla compartida. Ingresa número de socio → elige Cola → confirma → ticket en pantalla que se auto-resetea a los 5s (`CONFIRM_DISPLAY_MS`) para el próximo cliente; si el visitante abandona a mitad de camino, un timer de 25s (`IDLE_RESET_MS`) vuelve al inicio igual. `channel: "totem"`.

**A.2 Mi Turno (`/mi-turno`, `app/src/views/WebTicketView.tsx`)**: mismo flujo de alta (socio → cola → confirmar), pero pensado para un dispositivo propio del cliente, no un kiosko compartido — no hay auto-reset. Al crear el turno navega a `/mi-turno/:turnId` (URL persistente, para volver después) y pasa a modo seguimiento en vivo. `channel: "mobile"`.

Ambos llaman al mismo backend: `POST /createTurn { queueId, memberNumber, channel }` (`functions/src/controllers/turnController.ts:7-33` → `turnService.createTurn`, `functions/src/services/turnService.ts:5-40`). Reglas:
- `memberNumber` debe ser entero 1-99999 (`turnService.ts:10-11`).
- La Cola debe existir y estar `active` (si no, `409`).
- **Guard de duplicado por Cola**: si ya existe un turno WAITING/CALLED/ATTENDING con el mismo `memberNumber` + `queueId`, se devuelve ese turno existente en vez de crear uno nuevo (`turnService.ts:19-30`) — evita que un doble clic o un reintento genere dos tickets. El guard es **por cola**, no global: el mismo socio puede tener turnos activos simultáneos en colas distintas.
- Sin auth (`onRequest({cors: true})` sin `requireRole`) — rate-limited por IP: 8 requests / 20s (`functions/src/utils/rateLimit.ts:11-12`), aplicado también a `getCurrentTurn`/`cancelTurn`.

### B. Cliente gestiona su turno (solo vía `/mi-turno/:turnId`)

`WebTicketView` (`app/src/views/WebTicketView.tsx:65-118`) suscribe en vivo (Firestore listener directo, sin pasar por la API) al doc `turns/{turnId}` y muestra estado + posición en la fila (cuenta cuántos WAITING tienen `queuedAt` anterior al propio, vía listener sobre la colección `turns` filtrada por `queueId`+`status`). El Totem no ofrece esto — es exclusivo de Mi Turno.

- **Recuperar turno por número de socio**: `GET /getCurrentTurn?memberNumber=` (`turnController.ts:35-66` → `turnService.getCurrentTurn`, `turnService.ts:42-56`) devuelve el turno activo (WAITING/CALLED/ATTENDING) más reciente de ese socio, sin depender de `localStorage` — así se puede recuperar el ticket desde cualquier dispositivo. Notar: la UI de Mi Turno **no expone un input para esto** hoy — solo trackea por `turnId` en la URL; `getCurrentTurn` está implementado en `app/src/lib/api.ts:76-78` pero no se ve invocado desde ninguna vista (`grep` no encontró un call-site en `app/src/views`). Es la vía de recuperación documentada en el README (`README.md:142`) pero sin UI que la dispare.
- **Cancelar**: `POST /cancelTurn { turnId, memberNumber }` (`turnController.ts:68-94` → `turnService.cancelTurn`, `turnService.ts:66-91`). Transaccional: valida que `memberNumber` coincida con el dueño del turno (si no, `403`) y que el turno siga en `WAITING` (si no, `409`) — así conocer la URL de otro no alcanza para cancelarle el turno, y no se puede cancelar algo ya llamado/en atención. Botón visible solo cuando `status === "waiting"` (`WebTicketView.tsx:240-244`).

### C. Staff atiende (Terminal, `/terminal/:terminalId`, requiere login admin/supervisor/cajero)

`TerminalView.tsx` combina listeners en vivo (terminal, colas del sector, turnos WAITING de las colas activas, turno actual) con llamadas a la API para las acciones:

1. **Llamar siguiente**: `POST /nextTurn { terminalId }` calcula el candidato según la estrategia de despacho (§4) sin mutar nada, y en el mismo gesto de UI se encadena `POST /callTurn { terminalId, turnId }` que sí lo asigna (`TerminalView.tsx:158-192`). Es intencional que sean dos llamadas separadas pero disparadas juntas: si otra sesión se adelanta y toma ese turno, `callTurn` devuelve 409 y el frontend automáticamente pide otro (`TerminalView.tsx:184-188`) en vez de mostrar error.
   - `callTurn` (`terminalService.ts:114-170`, transaccional) valida: terminal no offline, terminal sin turno en curso ya (409 si tiene), turno en `WAITING`, y que la cola del turno esté entre las `activeQueueIds` de la terminal. Marca `CALLED`, guarda `terminalId` en el turno, `currentTurnId` en la terminal, y si la estrategia es ratio-based avanza el contador (§4).
2. **Iniciar atención**: `POST /startTurn` → `CALLED → ATTENDING` (`terminalService.ts:172-184`).
3. **Finalizar**: `POST /finishTurn` → `ATTENDING → FINISHED`, transaccional junto con liberar `currentTurnId` de la terminal (`terminalService.ts:186-212`).
4. **Re-llamar**: `POST /recallTurn`, solo si `CALLED`. No cambia de estado — suma `recallCount` y pisa `lastRecallAt` (`terminalService.ts:214-232`), que es lo que el Display usa para saber que debe sonar de nuevo aunque el turno no haya cambiado.
5. **No presentado**: `POST /noShow`, con doble confirmación en la UI (`TerminalView.tsx:394-408`, mismo patrón que el spec de Agenda copia conceptualmente). Ver mecánica de reencolado en §5.

Cada acción exige `assertTerminalAccess` (`terminalController.ts:16-23`): admin/supervisor operan cualquier terminal; un cajero solo las de sus `assignedSectorIds` (403 si no).

**Autoservicio de colas**: desde el mismo panel, el cajero puede cambiar qué Colas activas atiende su propia terminal (`POST /reassignTerminalQueues`) sin pasar por Admin — solo si la terminal no tiene turno en curso (409 si tiene, y el botón "Cambiar" ya viene deshabilitado client-side en ese caso, `TerminalView.tsx:316`). Cada cola debe pertenecer a un sector ya asignado a la terminal (`terminalService.ts:330-332`, 403 si no).

### D. Pantalla pública (`/display`, sin login)

`PublicDisplay.tsx` escucha directamente Firestore (`turns` con `status in [called, attending]`, `terminals`, `sectors`) — no llama a la API. Muestra una tarjeta por terminal activa (no offline) con su último turno llamado/atendiendo. Reproduce un chime (Web Audio, dos tonos) cuando cambia la "firma" `turnId:lastRecallAt` de una terminal — así un re-llamado sobre el mismo turno también suena, y además hace parpadear esa tarjeta puntualmente (3s) para diferenciarlo visualmente de un llamado nuevo (`PublicDisplay.tsx:140-165`).

---

## 4. Estrategias de despacho (`getNextTurn`, `terminalService.ts:27-112`)

- **FIFO across queues** (`fifo_across_queues`): junta los WAITING de todas las `activeQueueIds` de la terminal y devuelve el de `queuedAt` más antiguo, sin distinguir normal/priority.
- **Ratio based** (`ratio_based`): alterna normal/priority según `normalQueueRatio`/`priorityQueueRatio` configurados, con dos contadores persistidos en el doc de la terminal (`normalCounterState`/`priorityCounterState`) que se resetean juntos al completar un ciclo del ratio (`nextRatioCounterState`, `terminalService.ts:9-17`). Si la cola que toca según el ratio no tiene nadie esperando, cae al otro tipo en vez de devolver `null` (`terminalService.ts:91-109`).

---

## 5. No-show y reencolado (`handleNoShow`, `terminalService.ts:234-298`)

Transaccional, sobre un turno en `CALLED`:
- Si `queue.reenqueueConfig.enabled` **y** `turn.recallCount < maxAttempts` → reencola: vuelve a `WAITING`, y su nuevo `queuedAt` se calcula para caer `positionsBack` posiciones atrás en la fila actual (clamp al largo real de la fila), no siempre al final — así "perder tu lugar" es configurable, no absoluto.
- Si no (reencolado deshabilitado, o ya se agotaron los intentos) → `CANCELLED`.
- En ambos casos libera `currentTurnId` de la terminal.

Notar que la condición usa `recallCount`, el mismo contador que suma cada "Re-llamar" manual (§3.C.4) — un no-show no es una acción aislada de un contador propio, comparte el cupo de intentos con los re-llamados que ya se hicieron.

---

## 6. Roles y permisos aplicados a este flujo

| Rol | Totem / Mi Turno / Display | Terminal | Reasignar colas propias |
|---|---|---|---|
| Público (sin login) | Todo | — | — |
| Cajero | Todo | Solo terminales de sus `assignedSectorIds` | Sí (misma terminal) |
| Supervisor | Todo | Cualquier terminal | Sí |
| Admin | Todo | Cualquier terminal | Sí |

---

## 7. Datos en Firestore y lectura pública

Colecciones `sectors`, `queues`, `terminals`, `turns`: lectura pública sin auth (`firestore.rules:16-34`), escritura siempre `false` (todo write pasa por Cloud Functions con Admin SDK). Es lo que permite que Totem/Mi Turno/Display/Terminal usen listeners `onSnapshot` directos contra Firestore para todo lo que es solo-lectura, y reserven las llamadas a la API para las mutaciones (crear/cancelar/llamar/etc.).

---

## 8. Inconsistencia detectada — botón "Pausar/Reanudar" de Terminal

`TerminalView.tsx:236-245` (accesible por cualquier STAFF_ROLES, incluido cajero) llama `apiUpdateTerminal` → `PUT /updateTerminal` para togglear `status` entre `available`/`offline`. Pero ese endpoint está declarado `requireRole([UserRole.ADMIN])` en el backend (`adminController.ts:182`), no `STAFF_ROLES` como el resto de las acciones de Terminal. Un cajero o supervisor que aprieta "Pausar terminal" hoy recibe `403` — el botón está habilitado y visible para ellos en la UI, pero la llamada real falla. No hay manejo especial de ese error en `handleToggleTerminalStatus` (`TerminalView.tsx:236-245`): cae al catch genérico y muestra el mensaje crudo del backend como toast.

---

## 9. Stats (`getQueueStats`, `functions/src/services/statsService.ts`)

`GET /getQueueStats?queueId=` (admin o supervisor). Cuenta turnos de una Cola creados desde la medianoche en horario Argentina (`getTodayMidnightInArgentina`, `statsService.ts:8-21`, mismo offset hardcodeado `ARGENTINA_OFFSET` que el resto de la app) agrupados por estado, más el tiempo de espera promedio (`calledAt - createdAt`) de los turnos `FINISHED` del día.

---

## 10. Referencia — endpoints de este flujo

```
POST /createTurn        { queueId, memberNumber, channel }     — público
GET  /getCurrentTurn    ?memberNumber=                          — público
POST /cancelTurn        { turnId, memberNumber }                — público

POST /nextTurn          { terminalId }                          — staff
POST /callTurn          { terminalId, turnId }                  — staff
POST /startTurn         { terminalId, turnId }                  — staff
POST /finishTurn        { terminalId, turnId }                  — staff
POST /recallTurn        { terminalId, turnId }                  — staff
POST /noShow            { terminalId, turnId }                  — staff
POST /reassignTerminalQueues { terminalId, queueIds }            — staff (self-service)

GET  /getQueueStats     ?queueId=                                — admin/supervisor
```

CRUD de `sectors`/`queues`/`terminals` (solo admin) ya está documentado en `README.md` y no se repite acá.
