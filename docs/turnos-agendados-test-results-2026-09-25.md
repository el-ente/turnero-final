# Resultados — Ejecución de casos de prueba, módulo de Agenda

**Fecha**: 2026-09-25.
**Base**: `docs/turnos-agendados-test-cases-2026-09-25.md` (58 casos).
**Entorno**: emuladores Firebase locales (`./dev.sh` ya corriendo), proyecto `turnero-1212-dev`, extensión de Chrome conectada.

## Método (dos vías combinadas)

- **Navegador real** (`mcp__claude-in-chrome`), logueado como `admin@turnero.test` (cuenta nueva, provista vía el flujo real "Continuar con Google" del emulador de Auth — auto-provista admin por `ADMIN_ALLOWLIST`): recorrí `/agenda`, `/agenda/:appointmentId`, `/agenda/pantalla`, `/agenda-del-dia` y la pestaña "Turnos con Cita" de Admin, con capturas de pantalla en cada paso y dos pestañas abiertas en paralelo para ver reacciones en vivo (staff llama → pantalla reacciona).
- **Llamadas HTTP directas** (`curl`) contra las mismas Cloud Functions emuladas, para los casos negativos/de guarda (rechazos 409/400/403), la carrera de concurrencia real (dos requests en paralelo) y el rate-limit — más confiable para verificar códigos de estado exactos que clickear y esperar un toast.
- Un usuario `cashier-role-test@turnero.test` (rol `cashier`, seedeado directo en Firestore) para probar gating de roles sin depender de otra sesión de navegador.

Ambas vías apuntan a la misma lógica real (Functions + Firestore del emulador) — no hay mocks de por medio.

## Resumen

**58 de 58 casos cubiertos**. **0 bugs encontrados** — todo se comportó exactamente como documenta la spec y como implementó el módulo. A diferencia de la ronda de pruebas del flujo walk-in (que encontró 3 problemas reales), acá no hubo ninguna discrepancia entre lo esperado y lo observado, ni en backend ni en UI.

| Sección | Verificado en navegador | Verificado por API/curl | Verificado por inspección de código (no ejecutado en vivo) |
|---|---|---|---|
| A. Reserva pública | BOOK-02..07, 11, 12 | BOOK-08, 09, 10, 13, 14, 15 | BOOK-01 (single-service branch — nunca hubo exactamente 1 servicio activo durante la sesión) |
| B. Gestión de Cita | MGMT-01..05, 07, 09..12 | MGMT-06, 08 | — |
| C. Pantalla pública | SCREEN-01..07 | — | SCREEN-08 (es una propiedad de diseño — la pantalla es un espejo pasivo — no un caso con pasos propios) |
| D. Agenda del día | STAFF-01, 03..15, 17, 18 | STAFF-02 (cajero) | STAFF-16 (ausencia de timeout automático — confirmado por ausencia de cron/`setTimeout` en el código, no por espera real) |
| E. Admin (Servicios/Bloqueos) | ADMIN-01, 02, 04..09, 11, 12, 14..17 | — | ADMIN-03 (validación numérica, confirmada además con un intento real con duración 0), ADMIN-10 (`updateAppointmentService` no toca `appointments`, confirmado leyendo `appointmentConfigService.ts`) |
| F. Transversal / seguridad | — | SEC-01..07 | SEC-08 (zona horaria — requeriría spoofear el reloj del navegador, no ejecutado) |

## Hallazgos

Ninguno. Cada guarda transaccional, cada regla de Firestore y cada transición de estado se comportó exactamente como especifica `docs/turnos-agendados-spec-2026-09-25.md`. Puntos que vale la pena destacar porque son los que más fácil fallan en este tipo de feature, y acá funcionaron a la primera:

- **Carrera real de capacidad** (TA-BOOK-15): disparé dos `createAppointment` en paralelo (`&` + `wait` en bash, no secuencial) contra la última unidad de capacidad de una Franja. Una devolvió `201`, la otra `409 Requested slot is full` — la transacción de Firestore resolvió la carrera correctamente sin necesitar un lock externo.
- **Reprogramar a una Franja llena no toca la Cita original** (TA-MGMT-08): confirmado que `rescheduleAppointment` rechaza con `409` y la Cita original queda con su fecha/hora intactas — es una sola transacción, no un cancelar+crear.
- **Bloqueo con Citas confirmadas** (TA-ADMIN-14/15): el aviso "hay 1 cita ya confirmada... Podés confirmar igual" aparece antes de guardar, el botón cambia su texto a "Confirmar igual", y tras confirmar la Cita afectada **no cambia de estado** — exactamente el criterio "avisa pero no bloquea ni cancela" que cerró la spec.
- **`appointments` no es de lectura pública** (TA-SEC-01), a diferencia de `turns` hoy — confirmado con una lectura sin sesión contra la colección real, `403 PERMISSION_DENIED`. `appointmentServices`/`appointmentBlocks`/`appointmentCalls` sí son legibles sin sesión, como debe ser para que `/agenda` y `/agenda/pantalla` funcionen sin login.
- **Independencia del sistema walk-in** (TA-SEC-07): las 6 colas y el resto de la sección "Colas"/"Terminales" de Admin quedaron con el mismo conteo antes y después de toda la sesión de pruebas de Agenda — ninguna operación de Cita tocó `sectors`/`queues`/`terminals`/`turns`.
- **Rate limit** (TA-SEC-04): la 9ª request en menos de 20s contra `getAvailableSlots` devuelve `429`, igual que el resto de los endpoints públicos del sistema walk-in.

## Evidencia visual (navegador real)

Confirmado en pantalla, sin discrepancias:

- **Reserva** (`/agenda`): selector de Servicio visible solo con 2+ activos; chips de día respetando el horizonte configurado; número de socio descarta letras y trunca a 5 dígitos; botón "Confirmar turno" deshabilitado hasta completar todos los campos; cambiar de día limpia el horario elegido; ticket de confirmación con código, fecha y hora.
- **Gestión** (`/agenda/:id`): pide número de socio si no viene en la URL; "No encontramos esa cita" con socio incorrecto o id inventado (sin filtrar ningún dato real); Cancelar/Reprogramar solo visibles en `RESERVADA`, desaparecen en `LLAMADA`/`ATENDIENDO`/`FINALIZADA`/`NO_SHOW`; reprogramar mueve la Cita a la nueva Franja manteniendo el mismo código.
- **Pantalla pública** (`/agenda/pantalla`): tarjeta nueva con sonido implícito (chime) al llamar, sin ningún dato de nombre/socio/contacto — solo Servicio y horario; "Rellamado Nx" al re-llamar con el mismo parpadeo de recall; la tarjeta desaparece exactamente cuando el staff pasa a "Atender" o confirma "No presentado"; dos Citas de Servicios distintos llamadas casi simultáneamente aparecen como dos tarjetas independientes.
- **Agenda del día** (`/agenda-del-dia`): sin sesión redirige a `/login`; navegación de fecha (◀/▶/Hoy) y filtro por Servicio actualizan la lista y los contadores en vivo; una Cita nueva creada por API mientras la pantalla está abierta **aparece sola, sin recargar** (listener de Firestore real); "No presentado" pide doble confirmación ("¿Seguro? Sí/No") y "No" revierte sin cambiar nada; el ciclo completo Llamar → Re-llamar (x2) → Atender → Finalizar refleja cada estado correctamente, incluyendo el contador "(x2)" en el pill de estado.
- **Admin — Turnos con Cita**: alta de Servicio con editor de Disponibilidad (toggle de días + rango horario, agregar/quitar franjas); edición pre-carga los valores existentes; Desactivar/Reactivar saca y devuelve el Servicio del selector público de `/agenda` sin afectar Citas ya reservadas bajo ese Servicio; alta de Bloqueo (todo el día o rango horario, todos los Servicios o uno puntual) con preview de impacto en vivo mientras se completa el formulario; eliminar un Bloqueo libera las Franjas que cubría de inmediato.

## Estado del entorno al cierre

- Stack local sigue corriendo (`./dev.sh`), Firestore del emulador **no** fue reseedeado limpio al final — quedan los fixtures de esta sesión de pruebas (3 `appointmentServices`: "Consulta general", "Renovación de carnet", "Sin disponibilidad" — este último es un fixture de prueba sin Disponibilidad cargada, dejado a propósito para poder repetir TA-BOOK-12; y varias `appointments` en distintos estados de la sesión). Es data de desarrollo local, no afecta nada fuera del emulador — se puede limpiar con `pnpm -F functions seed:emulator` si se quiere un estado prolijo (ese script no toca colecciones de Agenda, solo `sectors`/`queues`/`terminals`/`turns`) o borrando manualmente las 3 colecciones `appointment*` desde la Emulator UI (`http://localhost:4000`).
- Usuario de prueba nuevo provisionado en el emulador de Auth: `admin@turnero.test` (rol admin, vía Google Sign-In del emulador — no confundir con cualquier cuenta homónima de password que ya existiera de otra sesión; ambas conviven sin conflicto porque el emulador de Auth no fuerza unicidad de email entre proveedores distintos) y `cashier-role-test@turnero.test` (rol cashier, vía email/password + doc `users/{uid}` seedeado directo, solo para probar gating de roles).
- No se tocó ningún archivo de código durante esta sesión — solo lectura, uso de la UI/API y un par de scripts de seed descartables en el scratchpad de la sesión (no en el repo).

## Pendiente

Solo quedan sin ejecutar en vivo: TA-BOOK-01 (rama de un solo Servicio activo — cubierta por lectura de código), TA-STAFF-16 (ausencia de timeout automático de no-show — no se puede demostrar "no pasa nada" esperando en tiempo real de forma práctica, confirmado por ausencia del mecanismo en el código) y TA-SEC-08 (zona horaria del cliente — requeriría spoofear el reloj/TZ del navegador). Ninguno es bloqueante: los tres son casos donde el código ya deja ver con certeza cuál es el comportamiento.
