# Reasignación de fila desde la Terminal — Spec funcional

**Fecha**: 2026-09-24
**Autor**: Análisis funcional interno (sin confirmación del cliente — ver nota abajo)
**Feature slug**: `terminal-self-reassignment`

## Nota sobre el origen de esta decisión

El cliente (farmacia con tres secciones: Farmacia, Perfumería, Obra social/PAMI) pidió dos cosas: (1) que una fila pueda ser atendida por más de una terminal, y (2) que una terminal pueda reasignarse a otra fila. **Ambas ya existen hoy** a nivel de datos y de Admin: `Queue.servedBy`, `Terminal.activeQueueIds`, el multi-select de colas en `TerminalFormModal` (Admin), y el sync transaccional en `adminService.ts`.

El cliente no está disponible para consulta por varias semanas. En lugar de esperar, se decidió avanzar ahora con el subconjunto de bajo riesgo de este gap, sin sign-off del cliente. Esta spec documenta esa decisión — no la vuelve a discutir — y dos cosas quedan explícitamente marcadas como pendientes de confirmar con el cliente apenas esté disponible:

- El comportamiento diferido (turno en curso, ver Open Questions).
- La forma general de la solución: existe la posibilidad de que lo que el cliente realmente necesite sea una reasignación automática por reglas (horario, demanda), que sería un proyecto distinto y más grande. Lo construido acá no debe leerse como la respuesta final, sino como la mejora incremental de menor riesgo dado el gap ya identificado.

## 1. Resumen de valor / impacto

Hoy, cambiar las colas que atiende una terminal solo puede hacerlo un Admin desde el panel de Admin (`TerminalFormModal`). En una farmacia chica con demanda pareja entre 3 secciones, la decisión de mover a un cajero de una fila a otra se toma en el mostrador, en el momento — no por alguien con acceso al panel de Admin. Hoy esa decisión no tiene forma de ejecutarse sin salir del flujo operativo (llamar a un admin, o que el admin lo haga a distancia).

Este cambio le da al cajero control de su propia terminal para cambiar de fila, sin salir de `TerminalView`, limitado a cuando la terminal está libre (sin turno en curso) — evita el problema real (fricción operativa en el mostrador) sin inventar una regla de negocio nueva para el caso de turno en curso, que se deja fuera de alcance a propósito.

## 2. Enfoque elegido + alternativas consideradas

**Elegido**: nuevo control en `TerminalView` que permite al cajero editar `activeQueueIds` de su propia terminal, habilitado solo cuando `currentTurnId` está vacío. Nuevo endpoint de Cloud Functions dedicado (no reutiliza `updateTerminal`), que reutiliza la lógica de sync de `adminService.ts` (`syncServedBy`).

**Alternativas consideradas y descartadas**:

- **Abrir el endpoint `updateTerminal` existente a cajeros** (bajarle el `requireRole` de `[ADMIN]` a incluir `CASHIER`). Descartado: ese endpoint acepta cualquier campo de `Terminal` vía `Partial<Terminal>` (`name`, `sectorIds`, `servingStrategy`, `strategyConfig`, `status`, `activeQueueIds`), no solo la fila activa. Dársela a un cajero expondría edición de nombre, sectores y estrategia de reparto de su propia terminal — fuera de lo pedido. Un endpoint nuevo y angosto evita ampliar la superficie de permisos por accidente.
- **Permitir reasignación con turno en curso, transfiriendo o auto-finalizando el turno**. Descartado por ahora: qué hacer con un turno en curso (`currentTurnId` seteado) es una decisión de negocio real (¿se auto-finaliza?, ¿se transfiere a otra terminal?, ¿se deja como está?) y equivocarla arriesga perder o duplicar el turno de un paciente/cliente. No se adivina; se bloquea la acción y se marca como pregunta abierta para el cliente.
- **Esperar la confirmación del cliente antes de tocar código**. Descartado por la ventana de varias semanas sin contacto — se prioriza no dejar al cajero sin esta capacidad mientras tanto, sabiendo que el enfoque puede necesitar ajuste una vez el cliente responda.

## 3. User stories

- **Como cajero**, cuando mi terminal está libre (no estoy atendiendo a nadie), quiero cambiar a qué fila(s) atiende mi terminal desde la misma pantalla de Terminal, para no depender de un Admin cuando la demanda se desequilibra entre secciones.
- **Como cajero**, si estoy atendiendo un turno, quiero que el control de cambio de fila esté deshabilitado con una explicación clara, para entender por qué no puedo cambiar en ese momento sin perder el turno en curso.
- **Como cajero**, solo quiero ver colas de las secciones a las que estoy asignado, para no elegir por error una fila de una sección que no me corresponde.
- **Como admin/supervisor**, quiero que este cambio no afecte el flujo existente de edición de terminales desde el panel de Admin.

## 4. Requerimientos funcionales

1. `TerminalView` muestra un control (ej. multi-select de colas) para editar `activeQueueIds` de la terminal actualmente logueada.
2. El control está habilitado únicamente cuando `terminal.currentTurnId` es falsy (`undefined`, `null` o `""` — los tres valores que el código ya usa para "sin turno en curso": `createTerminal` inicializa en `null`, `finishTurn`/`handleNoShow` lo limpian a `""`).
3. Cuando `terminal.currentTurnId` tiene valor, el control se muestra deshabilitado con el mensaje: *"finalizá el turno actual antes de cambiar de fila"*.
4. El listado de colas seleccionables se limita a colas cuyo `sectorId` está en el `assignedSectorIds` del usuario logueado (mismo criterio de scoping que ya usa `canAccessSector`/`canAccessTerminal` en `shared/src/permissions.ts` para el resto del rol cajero). Admin y supervisor, al no estar scopeados (`UNSCOPED_ROLES`), no son el público principal de este control — ver Open Questions sobre si deben verlo igual.
5. Solo se listan colas activas (`queue.active === true`). A diferencia del `TerminalFormModal` de Admin (que no filtra por `active`, porque ahí se está configurando, no operando en vivo), acá se está tomando una decisión operativa en el momento — no tiene sentido ofrecer una fila cerrada.
6. Al guardar, se llama a un endpoint de Cloud Functions nuevo y dedicado (ej. `reassignTerminalQueues`), no al `updateTerminal` existente.
7. El nuevo endpoint valida rol (`CASHIER`, `SUPERVISOR`, `ADMIN` — mismo `STAFF_ROLES` que el resto de `terminalController.ts`) y aplica `assertTerminalAccess` (mismo patrón que `nextTurnHandler`, `callTurnHandler`, etc.) para que un cajero no pueda reasignar una terminal fuera de su sector.
8. El nuevo endpoint valida server-side que `currentTurnId` esté vacío antes de aplicar el cambio (no confiar solo en que el botón esté deshabilitado en el cliente) — mismo principio que ya se aplicó en el fix reciente de `deleteSector`/reglas de cola cerrada/terminal offline (`ed5281b`, `02f2414`).
9. El nuevo endpoint valida que las `queueIds` recibidas correspondan a colas dentro del `assignedSectorIds` del usuario (para roles scopeados) — no confiar en que el cliente ya filtró la lista.
10. El nuevo endpoint actualiza `Terminal.activeQueueIds` y sincroniza `Queue.servedBy` reutilizando `syncServedBy` de `adminService.ts` (misma función que ya usa `updateTerminal`), no una copia de esa lógica.
11. Tras guardar, `TerminalView` refleja el cambio vía el listener de Firestore existente sobre `terminals/{terminalId}` (ya presente en el componente) — no requiere lógica de refresco nueva.

## 5. Criterios de aceptación

- **Given** la terminal del cajero no tiene turno en curso (`currentTurnId` vacío), **when** el cajero abre el selector de colas en `TerminalView`, **then** ve únicamente las colas activas de sus sectores asignados y puede modificar la selección.
- **Given** el cajero cambió la selección de colas y confirma, **when** el guardado es exitoso, **then** `Terminal.activeQueueIds` refleja la nueva selección y `Queue.servedBy` se actualiza en las colas agregadas/quitadas (verificable: la cola que se saca ya no tiene el id de la terminal en `servedBy`, la que se agrega sí).
- **Given** la terminal tiene un turno en curso (`currentTurnId` seteado), **when** el cajero mira `TerminalView`, **then** el control de cambio de fila está deshabilitado y muestra "finalizá el turno actual antes de cambiar de fila".
- **Given** un cajero intenta llamar al endpoint directamente (bypaseando la UI) con la terminal en turno en curso, **when** la request llega al backend, **then** el backend la rechaza (no confía en el estado deshabilitado del botón).
- **Given** un cajero intenta reasignar una terminal fuera de su sector asignado, **when** llama al endpoint, **then** recibe 403 (mismo comportamiento que ya existe en `nextTurnHandler`/`callTurnHandler` vía `assertTerminalAccess`).
- **Given** un cajero envía un `queueId` de una cola fuera de su `assignedSectorIds`, **when** llama al endpoint, **then** el backend lo rechaza (no confía en que el cliente ya filtró).

## 6. Edge cases

- **Terminal offline** (`status: "offline"`): no está explícitamente excluido por el enfoque "solo cuando no hay turno en curso" — una terminal pausada normalmente no tiene `currentTurnId`. Definir si debe poder reasignarse fila estando offline (probablemente sí, ya que no está atendiendo a nadie) — no bloquea nada adicional, se deja igual que hoy.
- **Cola quitada de `activeQueueIds` mientras hay turnos esperando en ella**: la cola sigue esperando ser atendida por otras terminales que la sirvan (si `servedBy` queda con más de una terminal) o queda huérfana si la terminal reasignada era la única que la servía. Esto ya es un comportamiento existente de `syncServedBy` (no se agrega riesgo nuevo, pero vale mencionarlo porque ahora lo puede disparar un cajero, no solo un Admin con visión completa del sistema).
- **Cajero deja `activeQueueIds` vacío**: el multi-select debería impedir guardar sin ninguna cola seleccionada, o el backend debe rechazarlo — una terminal sin colas activas no puede llamar turnos (`getNextTurnFifoAcrossQueues`/`getNextTurnRatioBased` devuelven `null`). Falta definir si se bloquea en front, en back, o ambos (recomendado: ambos, mismo patrón de validación duplicada ya usado en el resto del código).
- **Dos pestañas/dispositivos con la misma terminal abierta**: el listener de Firestore ya cubre que ambas vean el cambio, no es un caso nuevo introducido por esta feature.
- **Reasignar a una cola que ya está en `activeQueueIds`**: no-op, `syncServedBy` ya maneja diffs (`added`/`removed`) sin error.

## 7. Impacto en datos / API / reglas de negocio

- **Datos**: no hay cambios de modelo. `Terminal.activeQueueIds` y `Queue.servedBy` (`shared/src/models/terminal.ts`, `shared/src/models/queue.ts`) ya existen y ya soportan esta relación N:N.
- **API**: nuevo endpoint de Cloud Functions (Firestore bloquea escritura directa del cliente sobre `terminals` — confirmado en `firestore.rules`: `match /terminals/{terminalId} { allow read: if true; allow write: if false; }`, con el comentario explícito de que toda escritura pasa por Functions con Admin SDK). El endpoint nuevo debe vivir junto al resto de `terminalController.ts` (mismo patrón `onRequest` + `requireRole` + `assertTerminalAccess` que `nextTurnHandler`, `callTurnHandler`, etc.), y su service debe reusar `syncServedBy` de `adminService.ts` en vez de duplicarla — hoy `syncServedBy` no está exportada desde `adminService.ts` (es una función interna del módulo), así que la implementación deberá exportarla o mover la lógica de sync a un lugar compartido entre `adminService.ts` y `terminalService.ts`.
- **Regla de negocio**: no se crea ninguna regla nueva para turno en curso — se lo deja explícitamente no soportado (bloqueado), no hay ambigüedad de comportamiento que definir para el caso IN-scope.
- **Documentación**: este cambio toca la superficie de API (nuevo endpoint). Según `CLAUDE.md` del proyecto, `README.md` (sección `📡 API Endpoints` → `Terminal Operations`) y la colección Bruno (`bruno/turnero-api/terminal/`) deben actualizarse en el mismo cambio que implemente el endpoint — no como follow-up. Quien implemente esto debe agregar el `.bru` correspondiente y el bloque de doc en el README, siguiendo el formato ya usado para `Update Terminal.bru` en `bruno/turnero-api/admin/terminals/`.

## 8. Preguntas abiertas

- **Turno en curso**: ¿qué debe pasar si el cajero quiere reasignar la terminal mientras atiende un turno? Opciones no evaluadas: auto-finalizar el turno, transferirlo a otra terminal, dejarlo intacto y no permitir la reasignación (estado actual). Requiere confirmación del cliente — no se implementa nada para este caso.
- **Terminal offline**: ¿debe permitirse reasignar fila mientras la terminal está pausada (`status: "offline"`)? Se asume que sí (no hay turno en curso) pero no está confirmado.
- **Alcance para admin/supervisor**: ¿este control nuevo en `TerminalView` debe aparecer también cuando un admin/supervisor opera una terminal directamente (no vía panel de Admin), o queda limitado a cajeros? Si aplica a los tres roles, la regla de scoping por `assignedSectorIds` (FR 4) no aplica a `UNSCOPED_ROLES` y habría que decidir si ven todas las colas o las de `terminal.sectorIds`.
- **Validación de "al menos una cola activa"**: ¿se bloquea en el front, en el back, o ambos? (Recomendado: ambos, ver Edge Cases.)
- **Forma general de la solución**: ¿el cliente realmente quiere autogestión manual por parte del cajero, o algo más cercano a reasignación automática por reglas (horario, demanda)? Esta spec asume lo primero porque es lo que se puede construir sin más información y es reversible/de bajo riesgo; debe confirmarse con el cliente en cuanto esté disponible.
