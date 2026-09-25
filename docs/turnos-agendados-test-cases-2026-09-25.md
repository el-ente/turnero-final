# Casos de prueba funcionales — Módulo de Agenda (citas con día/hora)

**Fecha**: 2026-09-25
**Base**: `docs/turnos-agendados-spec-2026-09-25.md` (spec funcional cerrada, secciones 3, 8, 9 y 10).
**Alcance**: reserva pública (`/agenda`), autogestión (`/agenda/:appointmentId`), pantalla pública (`/agenda/pantalla`), staff "Agenda del día" (`/agenda-del-dia`), y configuración Admin (pestaña "Turnos con Cita"). No incluye el sistema walk-in (`turnos-walkin-test-cases-2026-09-25.md`) — este módulo es independiente por diseño (spec §0, §4).
**Uso**: ejecución manual en navegador contra la app corriendo localmente (emuladores). Cada caso indica precondición, pasos y resultado esperado.

Convención de IDs: `TA-<área>-<número>`. Prioridad: Alta (bloquea el flujo core) / Media / Baja (edge case raro).

---

## A. Reserva pública (`/agenda`) — cliente agenda remotamente

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TA-BOOK-01 | Reserva exitosa, un solo Servicio activo | Con un único Servicio activo configurado, entrar a `/agenda` | No se muestra selector de Servicio (se preselecciona el único activo); se ven directamente los chips de día | Alta |
| TA-BOOK-02 | Reserva exitosa, varios Servicios activos | Con 2+ Servicios activos, entrar a `/agenda` | Se muestra selector de Servicio; al elegir uno, se recargan los días/horarios disponibles de ese Servicio | Alta |
| TA-BOOK-03 | Flujo completo de reserva | Elegir Servicio → elegir día (chip) → elegir horario → completar Nombre, Número de socio y Contacto opcional → "Confirmar turno" | Redirige a `/agenda/:appointmentId?memberNumber=...` mostrando el ticket con día, hora, estado "Reservada" y "Código: <id>" | Alta |
| TA-BOOK-04 | Reserva sin contacto (opcional) | Repetir TA-BOOK-03 dejando "Contacto" vacío | La reserva se crea igual, sin error | Alta |
| TA-BOOK-05 | Botón deshabilitado sin datos completos | Dejar Nombre vacío, o Número de socio vacío/inválido, o sin horario elegido | "Confirmar turno" permanece deshabilitado | Alta |
| TA-BOOK-06 | Número de socio solo acepta dígitos, máx. 5 | Intentar tipear letras o más de 5 dígitos en "Número de socio" | Se descartan las letras; se trunca a 5 dígitos | Media |
| TA-BOOK-07 | Cambiar de día resetea el horario elegido | Elegir un horario, luego cambiar de chip de día | La selección de horario se limpia, hay que volver a elegir uno de ese día | Media |
| TA-BOOK-08 | Franja al tope de capacidad | Reservar la última unidad de capacidad de una Franja (`capacityPerSlot`), luego intentar reservar esa misma Franja con otro número de socio | La segunda reserva es rechazada con mensaje de error, no se crea la Cita | Alta |
| TA-BOOK-09 | Cita activa duplicada en el mismo Servicio | Con una Cita RESERVADA/LLAMADA/ATENDIENDO de un número de socio en el Servicio A, intentar reservar otra Cita en el Servicio A con el mismo número de socio | Rechazada con mensaje de error | Alta |
| TA-BOOK-10 | Cita activa permitida en otro Servicio | Con una Cita activa del número de socio en el Servicio A, reservar una Cita en el Servicio B con el mismo número de socio | Se acepta sin problema | Alta |
| TA-BOOK-11 | Sin Servicios disponibles | Con todos los Servicios desactivados (o ninguno creado), entrar a `/agenda` | Mensaje "No hay servicios disponibles para agendar", sin formulario | Media |
| TA-BOOK-12 | Sin horarios disponibles próximamente | Servicio activo pero sin Disponibilidad configurada (o completamente bloqueado), entrar a `/agenda` | Mensaje "No hay horarios disponibles próximamente" | Media |
| TA-BOOK-13 | Horizonte de reserva respetado | Servicio con `bookingHorizonDays` chico (ej. 3 días) | Los chips de día ofrecidos no superan ese horizonte, aunque el frontend pida una ventana más amplia (30 días) | Alta |
| TA-BOOK-14 | Franja bloqueada no aparece | Crear un Bloqueo (todo el día o rango horario) desde Admin para una fecha/Servicio con Disponibilidad | Esa fecha/franja deja de listarse como horario disponible en `/agenda` | Alta |
| TA-BOOK-15 | Reserva simultánea de la última unidad de capacidad | Dos pestañas/dispositivos intentando reservar la misma última Franja disponible casi al mismo tiempo | Solo una reserva se concreta; la otra recibe error de franja no disponible (guard transaccional) | Media |

---

## B. Autogestión de la Cita (`/agenda/:appointmentId`)

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TA-MGMT-01 | Ver cita con número de socio en la URL | Entrar al link devuelto tras reservar (`?memberNumber=...` incluido) | Muestra el ticket directamente, sin pedir el número de socio | Alta |
| TA-MGMT-02 | Ver cita sin número de socio en la URL | Entrar a `/agenda/:appointmentId` sin query param | Pide ingresar el número de socio antes de mostrar nada | Alta |
| TA-MGMT-03 | Número de socio incorrecto | Ingresar un número de socio que no es el dueño de la Cita | "No encontramos esa cita" — no expone datos de la Cita ajena | Alta |
| TA-MGMT-04 | Código de Cita inexistente | Entrar a `/agenda/id-inventado` con cualquier número de socio | "No encontramos esa cita", con botón para agendar un turno nuevo | Media |
| TA-MGMT-05 | Cancelar cita RESERVADA | Sobre una Cita RESERVADA, click "Cancelar cita" | Pasa a estado "Cancelada"; los botones de acción desaparecen | Alta |
| TA-MGMT-06 | Cancelar libera la Franja | Cancelar una Cita que ocupaba la última unidad de capacidad de su Franja, luego intentar reservar esa Franja desde `/agenda` con otro socio | La nueva reserva se acepta (la Franja volvió a estar disponible) | Alta |
| TA-MGMT-07 | Reprogramar a una nueva Franja disponible | Sobre una Cita RESERVADA, click "Reprogramar" → elegir nuevo día/horario → "Confirmar nuevo horario" | La Cita muestra el nuevo día/hora; la Franja vieja queda libre y la nueva ocupada | Alta |
| TA-MGMT-08 | Reprogramar a una Franja llena no afecta la Cita original | Intentar reprogramar a una Franja ya al tope de capacidad | Error mostrado, la Cita original conserva su día/hora sin cambios | Alta |
| TA-MGMT-09 | Volver sin confirmar reprogramación | En la pantalla de reprogramar, click "Volver" sin confirmar | Vuelve al ticket, la Cita no cambia | Media |
| TA-MGMT-10 | No se puede cancelar/reprogramar una Cita LLAMADA | Hacer que el staff llame la Cita desde "Agenda del día", volver a `/agenda/:appointmentId` | Los botones "Cancelar cita" y "Reprogramar" ya no se muestran | Alta |
| TA-MGMT-11 | No se puede cancelar/reprogramar una Cita ATENDIENDO/FINALIZADA/NO_SHOW | Repetir TA-MGMT-10 en cada uno de esos estados | Botones de acción ausentes en todos los casos | Media |
| TA-MGMT-12 | Estado visible correctamente en cada etapa | Llevar una Cita por Reservada → Llamada → En atención → Finalizada, revisando el ticket en cada paso | La etiqueta de estado en el ticket refleja cada transición correctamente | Media |

---

## C. Pantalla pública del módulo (`/agenda/pantalla`)

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TA-SCREEN-01 | Llamado aparece con sonido | Con la pantalla abierta, el staff llama una Cita desde "Agenda del día" | Aparece una tarjeta nueva con Servicio y horario, suena el chime | Alta |
| TA-SCREEN-02 | Re-llamado suena y parpadea | Re-llamar la misma Cita desde "Agenda del día" | La tarjeta parpadea ~3s, suena de nuevo, y muestra "Rellamado 1x" (incrementando con cada re-llamado) | Alta |
| TA-SCREEN-03 | Sin PII en pantalla | Revisar el contenido de las tarjetas mostradas | Solo se ve nombre del Servicio y horario (y contador de re-llamado); nunca nombre, número de socio ni contacto | Alta |
| TA-SCREEN-04 | Cita deja de listarse al iniciar atención | Con una tarjeta visible, el staff aprieta "Atender" en "Agenda del día" | La tarjeta desaparece de la pantalla | Alta |
| TA-SCREEN-05 | Cita deja de listarse por no-show | Con una tarjeta visible en LLAMADA, el staff confirma "No presentado" | La tarjeta desaparece de la pantalla | Media |
| TA-SCREEN-06 | Sin citas llamadas | Sin ninguna Cita en estado LLAMADA | Mensaje "Sin citas llamadas en este momento" | Baja |
| TA-SCREEN-07 | Múltiples citas llamadas en paralelo | Llamar 2+ Citas de Servicios distintos casi simultáneamente | Cada una aparece como tarjeta independiente, ordenadas por llamado más reciente primero | Media |
| TA-SCREEN-08 | Pantalla es opcional / pasiva | Sin la pantalla abierta en ningún dispositivo, llamar/re-llamar/atender Citas normalmente desde "Agenda del día" | El flujo de staff funciona igual, sin errores ni dependencias de la pantalla | Media |

---

## D. Staff — "Agenda del día" (`/agenda-del-dia`)

### D.1 Acceso y permisos

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TA-STAFF-01 | Sin login, acceso directo | Deslogueado, navegar a `/agenda-del-dia` | Redirige a `/login` (`RequireAuth`) | Alta |
| TA-STAFF-02 | Cajero/supervisor/admin acceden | Login con cada uno de esos 3 roles, ir a `/agenda-del-dia` | Los tres pueden ver y operar (sin scoping por Servicio, spec decisión 6) | Media |

### D.2 Vista y navegación

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TA-STAFF-03 | Citas de hoy ordenadas por horario | Con varias Citas de hoy en distintos horarios, abrir "Agenda del día" | Se listan todas ordenadas ascendente por `startTime`, sin turnos walk-in mezclados | Alta |
| TA-STAFF-04 | Navegación de fecha | Click en "◀" / "▶" / "Hoy" | La lista cambia a las Citas del día correspondiente, sin recargar la página | Alta |
| TA-STAFF-05 | Filtro por Servicio | Con Citas de 2+ Servicios el mismo día, usar el selector "Todos los servicios" para elegir uno puntual | Solo se listan las Citas de ese Servicio; el contador "Total" se actualiza acorde | Media |
| TA-STAFF-06 | Contadores del día | Revisar la fila de contadores (Total/Pendientes/Atendidos/No-show) contra el estado real de las Citas visibles | Los números coinciden exactamente con los estados filtrados en pantalla | Media |
| TA-STAFF-07 | Actualización en vivo sin recargar | Con "Agenda del día" abierta, reservar una Cita nueva para hoy desde `/agenda` en otra pestaña | La nueva Cita aparece sola en la lista, sin recargar | Alta |
| TA-STAFF-08 | Sin citas ese día | Elegir un día sin ninguna Cita | Mensaje "No hay citas para este día" | Baja |

### D.3 Ciclo de atención

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TA-STAFF-09 | Llamar una Cita RESERVADA | Click "Llamar" sobre una fila RESERVADA | Pasa a "Llamada"; toast de éxito; si la pantalla pública está abierta, reacciona (ver TA-SCREEN-01) | Alta |
| TA-STAFF-10 | Re-llamar | Con la Cita en LLAMADA, click "Re-llamar" una o más veces | El estado sigue mostrando "Llamada (x2)", "(x3)", etc. según las veces re-llamada | Alta |
| TA-STAFF-11 | Iniciar atención | Con la Cita en LLAMADA, click "Atender" | Pasa a "En atención"; solo queda disponible el botón "Finalizar" | Alta |
| TA-STAFF-12 | Finalizar atención | Con la Cita en ATENDIENDO, click "Finalizar" | Pasa a "Finalizada"; ya no muestra botones de acción | Alta |
| TA-STAFF-13 | No presentado — doble confirmación | Con la Cita en LLAMADA, click "No presentado" | Aparece "¿Seguro?" con botones "Sí"/"No", sin ejecutar la acción todavía | Alta |
| TA-STAFF-14 | No presentado — confirmar | En el paso anterior, click "Sí" | Pasa a "No se presentó"; ya no muestra botones de acción | Alta |
| TA-STAFF-15 | No presentado — cancelar confirmación | En TA-STAFF-13, click "No" | Vuelve a mostrar los botones normales de LLAMADA, la Cita sigue en "Llamada" sin cambios | Media |
| TA-STAFF-16 | No existe vencimiento automático de no-show | Dejar una Cita en LLAMADA sin tocarla varios minutos | El estado no cambia solo; sigue en "Llamada" hasta que el staff actúe manualmente | Media |
| TA-STAFF-17 | Botones ausentes según estado | Revisar acciones disponibles para Citas en RESERVADA/LLAMADA/ATENDIENDO/FINALIZADA/CANCELADA/NO_SHOW | Solo aparecen los botones válidos para cada estado (spec §3.C); estados terminales no muestran ninguna acción | Media |
| TA-STAFF-18 | Botones deshabilitados durante una acción en curso | Click cualquier acción y observar mientras está en vuelo | El botón/fila entra en estado deshabilitado hasta que la acción resuelve, evitando doble click | Baja |

---

## E. Admin — pestaña "Turnos con Cita"

### E.1 Servicios

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TA-ADMIN-01 | Crear Servicio completo | "Turnos con Cita" → "+ Nuevo Servicio" → completar Nombre, Duración, Capacidad, Horizonte, agregar una Disponibilidad (días + horario) → "Guardar" | El Servicio aparece en la tabla; queda disponible de inmediato en `/agenda` | Alta |
| TA-ADMIN-02 | Guardar deshabilitado sin nombre | Dejar "Nombre" vacío | Botón "Guardar" deshabilitado, hint "Completá el nombre para guardar" | Media |
| TA-ADMIN-03 | Validación de duración/capacidad/horizonte | Intentar guardar con Duración, Capacidad u Horizonte en 0 o negativo | Guardar deshabilitado (o rechazado por el backend si se fuerza) | Media |
| TA-ADMIN-04 | Agregar/quitar reglas de Disponibilidad | En el formulario, click "+ Agregar franja horaria" varias veces, luego "Quitar" en alguna | Se agregan/quitan filas de regla correctamente antes de guardar | Media |
| TA-ADMIN-05 | Toggle de días de la semana | En una fila de Disponibilidad, click en los botones de día | Los días clickeados quedan marcados como activos (visualmente distinguibles) y se guardan como `daysOfWeek` | Media |
| TA-ADMIN-06 | Editar Servicio existente | Click "Editar" en un Servicio, cambiar Nombre/Duración/Capacidad/Disponibilidad, "Guardar" | Los cambios se reflejan en la tabla y en `/agenda` | Alta |
| TA-ADMIN-07 | Desactivar Servicio | Click "Desactivar" sobre un Servicio activo | Pasa a inactivo; deja de listarse/ofrecerse en `/agenda` para nuevas reservas | Alta |
| TA-ADMIN-08 | Reactivar Servicio | Click "Reactivar" sobre uno desactivado | Vuelve a estar disponible en `/agenda` | Media |
| TA-ADMIN-09 | Desactivar Servicio no afecta Citas ya reservadas | Desactivar un Servicio con Citas RESERVADA existentes | Esas Citas siguen siendo gestionables (consultar/cancelar/reprogramar) y visibles en "Agenda del día" sin cambios | Media |
| TA-ADMIN-10 | Cambiar duración/capacidad no re-evalúa Citas existentes | Cambiar la duración o capacidad de un Servicio con Citas ya reservadas bajo el valor anterior | Las Citas existentes no cambian ni se invalidan retroactivamente (edge case documentado, spec §10) | Baja |

### E.2 Bloqueos

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TA-ADMIN-11 | Crear Bloqueo de todo el día, todos los Servicios | "+ Nuevo Bloqueo" → elegir fecha, dejar "Todo el día" tildado, Servicio en "Todos los servicios", Motivo opcional → Guardar | El Bloqueo aparece en la tabla; esa fecha deja de ofrecer horarios en `/agenda` para todos los Servicios | Alta |
| TA-ADMIN-12 | Crear Bloqueo de rango horario para un Servicio puntual | Destildar "Todo el día", completar Desde/Hasta, elegir un Servicio específico → Guardar | Solo ese rango horario de ese Servicio deja de ofrecerse; otros Servicios/horarios no se ven afectados | Alta |
| TA-ADMIN-13 | Guardar deshabilitado sin fecha | Dejar "Fecha" vacía | Botón "Guardar" deshabilitado, hint "Elegí una fecha para guardar" | Media |
| TA-ADMIN-14 | Aviso no bloqueante por Citas afectadas | Crear un Bloqueo que se superpone con Citas ya RESERVADA/LLAMADA/ATENDIENDO | Aparece el aviso "hay N cita(s) ya confirmada(s)... Podés confirmar igual"; el botón "Guardar" sigue habilitado | Alta |
| TA-ADMIN-15 | Confirmar Bloqueo pese al aviso no cancela nada | Confirmar el Bloqueo del caso anterior | El Bloqueo se crea; las Citas afectadas conservan su estado original (no se cancelan automáticamente) | Alta |
| TA-ADMIN-16 | Sin aviso cuando no hay Citas afectadas | Crear un Bloqueo en una fecha/rango sin Citas confirmadas | No aparece ningún mensaje de advertencia | Media |
| TA-ADMIN-17 | Eliminar Bloqueo | Click "Eliminar" sobre un Bloqueo existente, confirmar | Desaparece de la tabla; las Franjas que cubría vuelven a estar disponibles en `/agenda` | Alta |

---

## F. Reglas transversales / independencia / seguridad

| ID | Caso | Pasos | Resultado esperado | Prioridad |
|---|---|---|---|---|
| TA-SEC-01 | `appointments` no es de lectura pública | Sin sesión, intentar leer la colección `appointments` directo desde el cliente (ej. Firestore SDK en devtools) | `PERMISSION_DENIED` — a diferencia de `turns`, tiene PII y no debe ser legible sin rol de staff | Alta |
| TA-SEC-02 | `appointmentServices`/`appointmentBlocks`/`appointmentCalls` sí son públicas | Sin sesión, leer esas 3 colecciones directo desde el cliente | Lectura exitosa (necesaria para `/agenda` y `/agenda/pantalla` sin login) | Media |
| TA-SEC-03 | Gestionar cita ajena por fuerza bruta de socio | Conociendo el `appointmentId` pero no el `memberNumber` correcto, probar `getAppointment`/`cancelAppointment` con números de socio al azar | Cada intento fallido no revela datos de la Cita (mismo "No encontramos esa cita" que un id inexistente) | Media |
| TA-SEC-04 | Rate limit en endpoints públicos | Disparar 9+ requests en <20s contra `createAppointment`/`getAvailableSlots`/`cancelAppointment` desde el mismo origen | La 9ª request y siguientes devuelven 429 hasta la ventana siguiente | Media |
| TA-SEC-05 | Staff endpoints requieren rol | Sin login (o con un usuario sin rol admin/supervisor/cajero), invocar directo `callAppointment`/`recallAppointment`/etc. | 401/403, según corresponda | Alta |
| TA-SEC-06 | Admin endpoints requieren rol admin | Login como cajero o supervisor, invocar directo `apiCreateAppointmentService`/`apiCreateAppointmentBlock` | 403 | Alta |
| TA-SEC-07 | Independencia total del sistema walk-in | Reservar, llamar, atender y finalizar una Cita completa; en paralelo, revisar Totem/Terminal/Public Display/Admin (pestañas Colas/Terminales/Sectores) | Ninguna acción de Agenda crea, modifica ni aparece como `Turn`/`Queue`/`Terminal`; los conteos y vistas del sistema walk-in quedan intactos | Alta |
| TA-SEC-08 | Zona horaria Argentina | Con el navegador configurado en una zona horaria distinta a Argentina (ej. UTC o GMT-3 alterado en devtools), reservar y verificar los horarios ofrecidos | Los días/horarios ofrecidos y el horizonte de reserva se calculan en hora Argentina, no en la del navegador del cliente | Baja |

---

## Resumen

- **58 casos** — cobertura: reserva pública con todas sus guardas (capacidad, duplicado por Servicio, horizonte, bloqueos, carrera), autogestión (consulta/cancelación/reprogramación con las mismas guardas de ownership y estado que `Turn`), pantalla pública sin PII, ciclo completo de "Agenda del día" (incluyendo no-show manual sin vencimiento automático), configuración Admin de Servicios y Bloqueos (incluyendo el aviso no bloqueante), y reglas transversales de seguridad/independencia respecto del sistema walk-in.
- Los casos marcados **Alta** son el camino crítico — priorizar su ejecución manual primero.
- TA-SEC-01/TA-SEC-05/TA-SEC-06 verifican negativos (deben fallar) — no son casos que deban "pasar" con una operación exitosa, sino confirmar que el rechazo ocurre.
