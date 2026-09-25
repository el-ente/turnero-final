# Casos de prueba funcionales — Flujo de Turnos Walk-in

**Fecha**: 2026-09-25
**Base**: `docs/turnos-walkin-flujo-2026-09-25.md` (documentación as-built del flujo).
**Alcance**: Totem, Mi Turno, Terminal, Public Display, y las reglas de negocio transversales (rate limit, permisos, guards). No incluye el módulo de Agenda (`turnos-agendados-spec`).
**Uso**: se van a ejecutar manualmente en navegador contra la app corriendo localmente (emuladores). Cada caso indica precondición, pasos y resultado esperado.

Convención de IDs: `TW-<área>-<número>`. Prioridad: Alta (bloquea el flujo core) / Media / Baja (edge case raro).

---

## A. Totem (`/`) — alta de turno, kiosko compartido

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TW-TOT-01 | Alta exitosa, cola normal | Ingresar socio válido (ej. 4213) → Continuar → elegir cola normal → Confirmar turno | Se muestra ticket con el número de socio, nombre de cola y hora; el turno queda en Firestore como `WAITING` | Alta |
| TW-TOT-02 | Alta exitosa, cola prioritaria | Igual pero eligiendo una cola `type: priority` | Se ve el tag "Prioritaria" y la nota "Para personas mayores, embarazadas o con discapacidad"; ticket se crea igual | Alta |
| TW-TOT-03 | Validación: socio no numérico | Intentar tipear letras en el input | El input las descarta (solo dígitos), botón "Continuar" sigue deshabilitado hasta tener 1-5 dígitos | Media |
| TW-TOT-04 | Validación: input vacío | Dejar el campo vacío y intentar Continuar | Botón deshabilitado, hint "Ingresá un número de 1 a 5 dígitos" | Media |
| TW-TOT-05 | Validación: más de 5 dígitos | Intentar tipear 6+ dígitos | Se trunca a 5 caracteres | Baja |
| TW-TOT-06 | Cambiar número de socio | En pantalla de selección de cola, click "cambiar" | Vuelve a la pantalla de ingreso de número, conserva nada (limpio) | Media |
| TW-TOT-07 | Auto-reset tras confirmación | Sacar un turno y no tocar nada | A los 5s vuelve solo a la pantalla inicial (kiosko libre para el próximo) | Media |
| TW-TOT-08 | Auto-reset por inactividad (ingresando número) | Tipear un número parcial y no continuar | A los 25s sin interacción, vuelve a estado inicial limpio | Baja |
| TW-TOT-09 | Auto-reset por inactividad (eligiendo cola) | Llegar a la pantalla de selección de cola y no tocar nada | A los 25s vuelve al inicio | Baja |
| TW-TOT-10 | Sin colas activas | (requiere desactivar todas las colas desde Admin) recargar Totem | Mensaje "No hay colas disponibles", sin botón utilizable | Media |
| TW-TOT-11 | Cola inactiva no listada | Desactivar una cola desde Admin, recargar Totem | Esa cola no aparece entre las opciones | Media |
| TW-TOT-12 | Duplicado mismo socio + misma cola | Sacar turno con socio X en cola A, sin que se atienda; repetir alta con mismo socio X y misma cola A | Devuelve el mismo ticket ya existente (mismo `id`/número), no crea uno nuevo | Alta |
| TW-TOT-13 | Mismo socio, cola distinta | Sacar turno con socio X en cola A; luego socio X en cola B | Se crean dos turnos activos distintos, uno por cola (el guard de duplicado es por cola, no global) | Media |
| TW-TOT-14 | Cola cerrada (`active:false`) rechaza alta si se fuerza | (edge, requiere llamar API directo o carrera con Admin desactivando la cola justo antes de confirmar) | `409 Queue is closed` | Baja |

---

## B. Mi Turno (`/mi-turno`, `/mi-turno/:turnId`) — canal propio del cliente

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TW-MT-01 | Alta exitosa | Ir a `/mi-turno`, ingresar socio, elegir cola, confirmar | Navega a `/mi-turno/:turnId`, ticket visible con estado "esperando" | Alta |
| TW-MT-02 | Seguimiento en vivo — posición en la fila | Con el ticket abierto, hacer que Terminal llame a otros turnos delante en la misma cola | El contador de personas por delante baja sin recargar la página | Alta |
| TW-MT-03 | Seguimiento en vivo — cambio de estado | Con el ticket en WAITING abierto en una pestaña, llamar ese turno desde Terminal en otra pestaña | El estado en Mi Turno cambia a "llamado" en vivo, con el hint "Dirigite al mostrador" y animación | Alta |
| TW-MT-04 | Cancelar turno propio | Con ticket en WAITING, click "Cancelar turno" | Turno pasa a CANCELLED, la UI deja de mostrar el botón cancelar | Alta |
| TW-MT-05 | No se puede cancelar turno ya llamado | Llamar el turno desde Terminal, volver a la pestaña de Mi Turno | El botón "Cancelar turno" ya no está visible (solo aplica en WAITING) | Alta |
| TW-MT-06 | Turno inexistente en la URL | Entrar a `/mi-turno/id-inventado` | Mensaje "No encontramos ese turno" con botón para sacar uno nuevo | Media |
| TW-MT-07 | Sacar otro turno tras estado terminal | Dejar que un turno llegue a FINISHED (o cancelarlo), click "Sacar otro turno" | Vuelve al flujo de alta en `/mi-turno` | Media |
| TW-MT-08 | Contador de re-llamado visible | Re-llamar el turno desde Terminal | En Mi Turno aparece "Rellamado 1x", incrementando con cada re-llamado | Media |
| TW-MT-09 | `getCurrentTurn` no tiene UI de entrada | Buscar en la pantalla de Mi Turno alguna opción de "recuperar mi turno por número de socio" | No existe tal input hoy — confirmar que el único modo de recuperar es la URL con `turnId` (gap documentado, no bug a corregir en este ciclo) | Baja |

---

## C. Terminal (`/terminal`, `/terminal/:terminalId`) — operación de staff

### C.1 Acceso y permisos

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TW-TERM-01 | Cajero ve solo sus terminales | Login como cajero con `assignedSectorIds` limitado, ir a `/terminal` | El selector solo lista/permite terminales de esos sectores | Alta |
| TW-TERM-02 | Cajero fuera de su sector | Como cajero, intentar navegar directo a `/terminal/:terminalId` de una terminal fuera de su sector | Acción bloqueada / error 403 al intentar operar | Alta |
| TW-TERM-03 | Admin/supervisor accede a cualquier terminal | Login admin, abrir cualquier terminal | Sin restricciones | Media |
| TW-TERM-04 | Sin login, acceso directo a `/terminal` | Deslogueado, navegar a `/terminal` | Redirige a `/login` (RequireAuth) | Media |

### C.2 Ciclo de atención

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TW-TERM-05 | Llamar siguiente (FIFO) | Con varios turnos WAITING en cola(s) FIFO, click "Llamar siguiente" | Se llama el turno con `queuedAt` más antiguo; pasa a CALLED, aparece como "Atendiendo" | Alta |
| TW-TERM-06 | Llamar siguiente (ratio-based) | Terminal con estrategia ratio 2:1 normal:priority, mezcla de turnos esperando en ambos tipos | El orden de llamados respeta la proporción configurada a lo largo de varias llamadas sucesivas | Alta |
| TW-TERM-07 | Llamar siguiente sin turnos esperando | Vaciar la cola de espera, click "Llamar siguiente" | Toast de error "No hay turnos disponibles", no rompe la UI | Alta |
| TW-TERM-08 | Iniciar atención | Con turno CALLED, click "Iniciar atención" | Pasa a ATTENDING, botón "Finalizar" se habilita | Alta |
| TW-TERM-09 | Finalizar atención | Con turno ATTENDING, click "Finalizar" | Pasa a FINISHED, terminal queda libre (sin turno actual), habilitado "Llamar siguiente" de nuevo | Alta |
| TW-TERM-10 | Botones deshabilitados según estado | Sin turno actual, verificar estado de "Iniciar atención"/"Finalizar"/"Re-llamar"/"No presentó" | Todos deshabilitados hasta que haya un turno CALLED/ATTENDING según corresponda | Media |
| TW-TERM-11 | Re-llamar | Con turno CALLED, click "Re-llamar" una o más veces | `recallCount` sube cada vez, turno sigue en CALLED, Display suena y parpadea en cada uno | Alta |
| TW-TERM-12 | No presentado — confirmación doble | Con turno CALLED, click "No presentó" | Aparece "¿Seguro?" con confirmar/cancelar antes de ejecutar | Alta |
| TW-TERM-13 | No presentado — cancelar confirmación | En el paso anterior, click "Cancelar" | Vuelve al estado anterior sin marcar no-show, turno sigue CALLED | Media |
| TW-TERM-14 | No-show con reencolado disponible | Cola con `reenqueueConfig.enabled=true`, `maxAttempts` no agotado; marcar no-show | Turno vuelve a WAITING, reaparece en la lista de espera en la posición `positionsBack` (no siempre al final) | Alta |
| TW-TERM-15 | No-show con reencolado agotado | Turno cuyo `recallCount` ya alcanzó `maxAttempts`; marcar no-show | Turno pasa a CANCELLED, no vuelve a la cola | Alta |
| TW-TERM-16 | No-show con reencolado deshabilitado | Cola con `reenqueueConfig.enabled=false`; marcar no-show | Turno pasa directo a CANCELLED | Alta |
| TW-TERM-17 | Carrera: dos operadores llaman al mismo candidato | Dos sesiones de Terminal sobre terminales distintas que comparten cola, ambas click "Llamar siguiente" casi simultáneo | Una gana; la otra recibe el 409 transparente y automáticamente reintenta con el próximo turno, sin mostrar error al operador | Media |
| TW-TERM-18 | Terminal offline no puede llamar | Pausar la terminal (ver C.3), intentar "Llamar siguiente" | Botón deshabilitado / acción bloqueada | Alta |

### C.3 Pausar/reanudar y reasignar colas

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TW-TERM-19 | Pausar terminal como admin | Login admin, click "Pausar" en una terminal sin turno en curso | Terminal pasa a `offline`, desaparece del Public Display | Alta |
| TW-TERM-20 | Reanudar terminal como admin | Desde `offline`, click "Reanudar" | Vuelve a `available`, reaparece en Display | Alta |
| TW-TERM-21 | **Pausar como cajero/supervisor (bug conocido)** | Login cajero o supervisor, click "Pausar" | **Esperado según código actual: falla con 403** (`updateTerminal` es admin-only en el backend pese a que el botón está habilitado para todo el staff) — confirmar que efectivamente reproduce, y ver qué feedback recibe el operador (toast con el 403 crudo) | Alta |
| TW-TERM-22 | Cambiar colas asignadas sin turno en curso | Click "Cambiar" en "Filas asignadas", tildar/destildar colas, "Guardar" | Se actualiza `activeQueueIds`, refleja en el sidebar y en qué turnos ve la terminal | Alta |
| TW-TERM-23 | Cambiar colas bloqueado con turno en curso | Con un turno CALLED/ATTENDING activo, intentar "Cambiar" | Botón deshabilitado, con hint "Finalizá el turno actual antes de cambiar de fila" | Alta |
| TW-TERM-24 | Reasignar cola fuera del sector de la terminal | (edge, requiere forzar vía API) intentar asignar un `queueId` de un sector no incluido en `sectorIds` de la terminal | Rechazado (403) | Baja |
| TW-TERM-25 | Ventana flotante (PiP) | Si el navegador soporta Document PiP, abrir "Ventana flotante" y operar Llamar/Iniciar/Finalizar/Re-llamar/No presentó desde ahí | Mismas acciones y mismos resultados que el panel principal, sincronizado | Baja |

---

## D. Public Display (`/display`)

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TW-DISP-01 | Turno llamado aparece con sonido | Llamar un turno desde Terminal con el Display abierto en otra pestaña/pantalla | La tarjeta de esa terminal muestra el número, suena el chime | Alta |
| TW-DISP-02 | Re-llamado suena y parpadea | Re-llamar el mismo turno | Vuelve a sonar el chime y la tarjeta parpadea ~3s, sin cambiar el número mostrado | Alta |
| TW-DISP-03 | Terminal pausada no aparece | Pausar una terminal (como admin) | Su tarjeta desaparece de la grilla | Media |
| TW-DISP-04 | Sin terminales activas | Pausar todas las terminales | Mensaje "Sin terminales activas" | Baja |
| TW-DISP-05 | Múltiples terminales en paralelo | Llamar turnos casi simultáneamente desde 2+ terminales distintas | Cada tarjeta actualiza de forma independiente, ninguna pisa a la otra | Media |
| TW-DISP-06 | Nombre de sector visible | Terminal con `sectorIds` asignado, turno llamado | La tarjeta muestra el/los nombre(s) de sector bajo el nombre de la terminal | Baja |

---

## E. Reglas transversales / seguridad

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TW-SEC-01 | Rate limit en endpoints públicos | Disparar 9+ requests en <20s contra `createTurn`/`getCurrentTurn`/`cancelTurn` desde el mismo origen (ej. clicks rápidos repetidos o script) | La 9ª request y siguientes devuelven 429 hasta que abre la ventana siguiente | Media |
| TW-SEC-02 | Cancelar turno de otro socio | Intentar `cancelTurn` con un `turnId` real pero `memberNumber` que no es el dueño (requiere editar el payload manualmente, ej. desde devtools) | 403, el turno no cambia de estado | Alta |
| TW-SEC-03 | Crear turno en cola inexistente | Forzar `createTurn` con un `queueId` inválido | 404 | Baja |

---

## F. Stats (apoyo al flujo, `/admin` o llamado directo a `getQueueStats`)

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TW-STAT-01 | Conteos coherentes tras un ciclo completo | Hacer pasar un turno por WAITING→CALLED→ATTENDING→FINISHED y consultar stats de esa cola | `totalTodayCreated`, `finishedCount` y `avgWaitTimeSeconds` reflejan ese turno correctamente | Media |
| TW-STAT-02 | Conteo de no-show/cancelados | Generar un no-show cancelado (TW-TERM-15/16) y un turno cancelado desde Mi Turno (TW-MT-04), consultar stats | `cancelledCount` sube en ambos casos (no-show sin reencolado también cae acá, ya que nunca escribe `NO_SHOW`) | Baja |

---

## G. Hallazgos del análisis funcional (a confirmar en navegador)

Surgidos de la revisión del analista funcional sobre el código real, no del comportamiento documentado en `turnos-walkin-flujo-2026-09-25.md` §1-9. Son casos donde se espera que el bug se reproduzca — la confirmación en navegador es para verificar impacto real en UI, no para "pasar en verde".

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TW-FIND-01 | Cancelar turno de otro socio con su número real | Con dos sesiones: en una, leer en vivo (devtools/Firestore) el `memberNumber` y `turnId` de un turno WAITING de "otro cliente"; en la otra, llamar `cancelTurn` con esos datos reales | El turno se cancela sin que su dueño lo haya pedido — confirma que la única barrera es conocer el `memberNumber`, expuesto por la lectura pública de `turns` | Alta |
| TW-FIND-02 | Re-llamar agota el cupo de reencolado antes del no-show | Cola con `reenqueueConfig.enabled=true`, `maxAttempts=2`; llamar un turno y re-llamarlo 2 veces (`recallCount=2`), luego marcar no-show | Turno pasa a CANCELLED en vez de reencolarse a WAITING, aunque sea el primer no-show real de ese cliente — confirma que "Re-llamar" consume el mismo cupo que el reencolado automático | Alta |
| TW-FIND-03 | Terminal A finaliza el turno en curso de Terminal B | Requiere llamar la API directo (Bruno/curl) con un token de admin: con Terminal B teniendo un turno ATTENDING, invocar `finishTurn` pasando el `terminalId` de A y el `turnId` real de B | El turno de B se marca FINISHED y `currentTurnId` de A se limpia (aunque A no tenía ese turno) — B queda con `currentTurnId` apuntando a un turno ya finalizado, terminal B bloqueada visualmente. No reproducible solo con la UI de una sola pestaña | Media |
| TW-FIND-04 | `priorityWeight` no afecta el orden de despacho | En Admin, configurar dos colas priority con `priorityWeight` bien distinto (ej. 1 y 10) bajo la misma terminal ratio-based; comparar el orden real de llamados | El orden de despacho no cambia por `priorityWeight` — solo depende de `normalQueueRatio`/`priorityQueueRatio` de la terminal, confirmando que el campo es config muerta | Baja |
| TW-FIND-05 | `noShowCount` en stats queda siempre en 0 | Generar un no-show que termine en CANCELLED (TW-TERM-15/16), consultar `getQueueStats` de esa cola | `noShowCount` no sube; el turno cae dentro de `cancelledCount` en su lugar | Baja |

---

## Resumen

- **64 casos** — cobertura: alta por 2 canales (Totem/Mi Turno), seguimiento y cancelación del cliente, ciclo completo de atención en Terminal (incluyendo las dos estrategias de despacho), no-show/reencolado en sus 3 variantes, autoservicio de colas, pausar/reanudar (incluyendo el bug conocido del §8 del doc de flujo), Public Display en vivo, y reglas transversales de seguridad/rate-limit.
- Los casos marcados **Alta** son el camino crítico — priorizar su ejecución manual primero.
- TW-TERM-21 tiene un resultado esperado que es en sí mismo el bug reportado — no es un caso que deba "pasar en verde", es la confirmación en navegador de lo ya detectado por código.
