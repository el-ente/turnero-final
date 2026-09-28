# Módulo de Agenda (citas con día/hora) — Spec funcional

**Fecha**: 2026-09-25 (dos actualizaciones el mismo día: decisión de independencia, y luego cierre de preguntas abiertas)
**Estado**: Diseño funcional cerrado sobre las decisiones de negocio recibidas — sin modelo de datos final ni plan de implementación.

## Actualización 1 — decisión de independencia

El cliente definió: este módulo es **completamente independiente** del sistema walk-in actual (`Sector`/`Queue`/`Terminal`/`Turn`). Corre en la misma plataforma (mismo proyecto Firebase, mismo panel Admin), pero no se acopla al modelo de datos ni a las vistas existentes de Totem/Terminal/PublicDisplay. Reemplazó la sección de alternativas de convivencia walk-in/agendado de la primera versión de este documento (ya no aplica: no hay convivencia, son sistemas separados).

## Actualización 2 — cierre de preguntas abiertas (mismo día)

Decisiones finales recibidas, incorporadas en todo el documento:

1. Dato de verificación de identidad: **número de socio** (mismo concepto que ya usa Totem), no documento/DNI. Todo el documento usa "número de socio" de acá en adelante.
2. Un mismo número de socio no puede tener más de una Cita activa simultánea **dentro del mismo Servicio** — sí puede tener Citas activas simultáneas en Servicios distintos (la regla es por Servicio, no global). "Activa" cuenta solo Citas de hoy en adelante: una Cita de un día pasado que quedó RESERVADA (nadie la llamó) no bloquea volver a reservar.
3. Se elimina el check-in como paso del cliente. El staff **llama** a la Cita según su horario (mismo patrón que Terminal), con re-llamado, y marca no-show manualmente con doble confirmación — no hay mecanismo automático de no-show.
4. Entra al MVP una **pantalla pública propia del módulo**, independiente de `PublicDisplay`, que refleja los llamados/re-llamados. Es opcional de usar.
5. El Bloqueo se mantiene en el MVP; si se superpone con Citas ya confirmadas, se muestra un aviso informativo pero no impide crearlo, y no cancela nada automáticamente.
6. Roles: se reusan admin/supervisor/cajero sin scoping nuevo (`assignedServiceIds` queda descartado para el MVP).
7. Horizonte de reserva (default 2 semanas) y duración de franja (default 15 minutos) son parámetros configurables, no valores fijos.
8. Contacto (teléfono/email) es un campo opcional, capturado solo como insumo para un futuro canal de recordatorios — sin ningún uso activo en este alcance, y no es el dato de identidad.

---

## 0. Grounding contra el repo (sigue vigente)

- `Turn`, `Queue`, `Terminal` (`shared/src/models/*`) están diseñados enteramente alrededor de fila física walk-in: orden por `queuedAt`, `currentTurnId` 1:1 por terminal, `servingStrategy` FIFO/ratio. Ninguno de estos conceptos aplica a "atender una cita a una hora fija" — es la base de la decisión de mantener el módulo separado.
- No existe infraestructura de notificaciones (sin email/SMS/push, sin scheduler). Sigue sin existir.
- `memberNumber` en el sistema actual (Totem/`/mi-turno`) es un número externo (1 a 99999) que el cliente ingresa, **no validado contra ningún padrón** (así lo documenta `README.md`). El módulo de Agenda reusa el mismo concepto y la misma UX para el número de socio, pero **no lee ni cruza contra la colección `turns`** — es el mismo tipo de dato, no el mismo dato compartido entre sistemas. Vale la pena tenerlo presente: la regla "una Cita activa por número de socio" (decisión 2) solo se puede validar contra las Citas de este módulo, con el mismo nivel de confianza (ninguno externo) que ya acepta el sistema actual para `memberNumber`.
- `Terminal.recallTurn`/`handleNoShow` ya establecen el patrón de UX que este módulo reusa conceptualmente para "llamar"/"re-llamar"/"marcar no-show con confirmación" — no se reusa el código ni el modelo, solo el patrón de interacción.
- `cancelTurn` hoy solo permite cancelar mientras el turno está en `WAITING` (antes de ser llamado) — el mismo criterio, aplicado a Cita, es lo que impide reprogramar/cancelar una vez `LLAMADA` (ver sección 3.B y 13): es precedente existente, no una decisión nueva.
- Mismo proyecto Firebase / Admin panel: la independencia es de **modelo de datos y vistas de operación**, no de infraestructura ni de autenticación de staff.

---

## 1. Lectura de valor

Valor concreto: un cliente que no puede/quiere esperar en fila obtiene un horario concreto de atención, sin depender del sistema walk-in. Sigue siendo cierto que "bajar no-shows con recordatorios" no está en este alcance (no hay canal de salida construido) — la captura de contacto (decisión 8) es una preparación para eso, no una entrega de eso.

---

## 2. Entidades del dominio

| Entidad | Qué es, en términos llanos |
|---|---|
| **Servicio** | Lo que se agenda (ej. "Renovación de carnet"). Nombre, duración fija en minutos, capacidad por franja (default 1). Sin `sectorId` ni referencia a Queue. |
| **Disponibilidad** | Regla recurrente de cuándo se ofrece un Servicio: días de semana + rango horario. Plantilla, no un horario guardado uno por uno. |
| **Franja** | Horario concreto y reservable (ej. "martes 10:15"), calculado a partir de Disponibilidad, duración de franja (default 15 min, configurable) y capacidad, restando Bloqueos y Citas ya confirmadas. |
| **Bloqueo** | Excepción puntual que cierra franjas para un Servicio (o todos) en una fecha, o fecha + rango horario — feriados, cierres, mantenimiento. Prevalece sobre la Disponibilidad. |
| **Cita** | Reserva concreta: Servicio + fecha + hora + datos del solicitante (nombre, **número de socio**, contacto opcional) + estado. Código de Cita propio (no reutiliza `memberNumber`/`turnId` de Turn), que junto al número de socio habilita la autogestión. |

**Estados de una Cita** (corregido — sin check-in del cliente; el staff llama, igual patrón que Terminal hoy):

```
RESERVADA  → CANCELADA     (antes del horario, cliente o staff)
RESERVADA  → LLAMADA       (staff aprieta "Llamar" según el horario de la Cita, no FIFO/ratio)
LLAMADA    → LLAMADA       (re-llamado; mismo patrón que recallTurn de Terminal)
LLAMADA    → ATENDIENDO    (la persona se presenta, staff inicia atención)
ATENDIENDO → FINALIZADA
LLAMADA    → NO_SHOW       (staff lo marca manualmente, con doble confirmación —
                             igual patrón que noShow en Terminal hoy; no hay
                             vencimiento automático de tolerancia)
```

---

## 3. Flujos end-to-end

**A. Cliente agenda remotamente**
1. Cliente entra a una página pública nueva y dedicada (ej. `/agenda`).
2. Elige Servicio (si hay más de uno) y ve Franjas disponibles agrupadas por día, dentro del horizonte de reserva configurado (default 2 semanas).
3. Elige Franja, completa nombre + número de socio + contacto (opcional).
4. El sistema valida, transaccionalmente: (i) que la Franja no superó su capacidad, y (ii) que ese número de socio no tiene ya otra Cita activa (RESERVADA/LLAMADA/ATENDIENDO) **en ese mismo Servicio** — si la tiene, rechaza la reserva (sí puede tener una Cita activa en otro Servicio en simultáneo).
5. Confirmación en pantalla con código de Cita.

**B. Cliente gestiona su cita**
1. Cliente entra a `/agenda/:citaId` (o busca por código + número de socio).
2. Ve estado y detalle de su Cita.
3. Cancela (solo mientras está RESERVADA, antes del horario) → libera la Franja.
4. Reprograma (solo mientras está RESERVADA) → operación atómica: toma la nueva Franja y solo si lo logra libera la vieja; si la nueva ya no está disponible, la Cita original queda intacta. Reprogramar/cancelar una vez LLAMADA o ATENDIENDO no está permitido (mismo criterio que `cancelTurn` hoy, que solo permite cancelar en estado `WAITING`) — ver punto 3 de la revisión crítica, es un supuesto de diseño, no confirmado explícitamente por el cliente.

**C. Momento de la atención (corregido — sin check-in del cliente)**
1. Staff abre "Agenda del día", ve las Citas de hoy ordenadas por horario.
2. Según el horario de la Cita (no por orden de llegada ni FIFO), el staff aprieta "Llamar" → pasa a LLAMADA. Si la pantalla pública del módulo está en uso, se refleja con sonido/flash.
3. Si la persona no aparece, el staff puede "Re-llamar" las veces que considere.
4. Cuando se presenta, el staff aprieta "Iniciar atención" → ATENDIENDO.
5. Al terminar, "Finalizar" → FINALIZADA.
6. Si tras los re-llamados que el staff considere razonables la persona no se presenta, el staff marca manualmente "No presentado" (doble confirmación) → NO_SHOW. No hay vencimiento automático de ventana de tolerancia.

---

## 4. Decisión: "Agenda del día" separada, NO se le entrega el control a Terminal

**Recomendación (sin cambios respecto de la iteración anterior): pantalla nueva y separada para el staff, independiente de Terminal.** No se genera un `Turn` ni nada equivalente al llamar una Cita; Terminal no se entera de que este módulo existe.

**Justificación operativa:**
- Entregarle el control a Terminal exigiría mapear la Cita a una Queue y que `nextTurn` (FIFO/ratio) entienda "hora de la cita" como criterio de orden — la complejidad de acoplamiento que la independencia buscó eliminar.
- La atención de una Cita no necesita un motor de "siguiente turno": el orden ya está dado por el horario. Es una lista del día, no una cola que hay que arbitrar.
- Si un mismo cajero cubre walk-in y citas, son dos pestañas del navegador bajo el mismo login — costo bajo. Lo caro es hacer que Terminal entienda un concepto ajeno a su diseño. El sistema no fuerza si es la misma persona o un rol distinto; es una decisión de dotación de personal, no de arquitectura.

---

## 5. Pantalla pública del módulo (nueva, entra al MVP)

Pantalla pública dedicada (ej. `/agenda/pantalla`), **independiente de `PublicDisplay`**: datos propios de Cita (no lee `turns`), se actualiza cuando el staff llama/re-llama desde "Agenda del día", mismo patrón de sonido/flash que ya conoce el negocio. Es opcional: si una sucursal no la despliega, el staff simplemente llama de viva voz — el flujo de "Llamar"/"Re-llamar" en "Agenda del día" funciona igual con o sin esta pantalla, ella es solo un espejo pasivo de esos eventos.

---

## 6. MVP — qué entra y qué se pospone

**Entra:**
- Admin: CRUD de Servicio (nombre, duración, capacidad); Disponibilidad recurrente; Bloqueos puntuales (con aviso no bloqueante si hay Citas confirmadas superpuestas).
- Público: página `/agenda` para ver Franjas y reservar (nombre, número de socio, contacto opcional) con confirmación por código; regla de una Cita activa por número de socio.
- Autogestión: consultar/cancelar/reprogramar Cita con código + número de socio, solo mientras está RESERVADA.
- Staff: "Agenda del día" (separada de Terminal) con Llamar / Re-llamar / Iniciar atención / Finalizar / No presentado (manual, doble confirmación).
- Pantalla pública propia del módulo (sección 5), opcional de usar.
- Parámetros configurables: horizonte de reserva (default 2 semanas), duración de franja (default 15 min).

**Se pospone explícitamente:**
- Recordatorios y notificaciones (email, SMS, push, WhatsApp) — no hay canal construido; el contacto se captura solo como insumo futuro.
- Integración WhatsApp para agendar.
- Verificación por OTP o cuentas de cliente — la autogestión sigue usando código de Cita + número de socio, sin autenticación real.
- Cualquier convivencia o prioridad con turnos walk-in.
- Reparto automático entre atendedores cuando una Franja tiene capacidad > 1 (ver revisión crítica, punto sin resolver del todo).
- Cálculo automático/histórico de duración de Servicio.
- Cualquier mecanismo automático de vencimiento de tolerancia — el no-show es 100% manual por decisión explícita.

---

## 7. Historias de usuario

1. Como cliente, quiero agendar una Cita para un Servicio en un día y horario específico desde una página web dedicada, para asegurarme un horario concreto sin depender del sistema walk-in.
2. Como cliente, quiero recibir un código de Cita al reservar, para poder consultarla o gestionarla después.
3. Como cliente, quiero que el sistema me impida reservar una segunda Cita del mismo Servicio mientras ya tengo una activa, para evitar reservas duplicadas o acaparar horarios (sí puedo tener Citas activas en Servicios distintos a la vez).
4. Como cliente, quiero cancelar o reprogramar mi Cita antes del horario reservado con mi código y número de socio, para liberar el horario si no puedo asistir.
5. Como miembro del staff, quiero ver las Citas del día ordenadas por horario en una pantalla propia de Agenda, separada de Terminal, para saber a quién atender y cuándo.
6. Como miembro del staff, quiero llamar y re-llamar una Cita según su horario (no por orden de llegada), para avisar a la persona que le toca, con el mismo patrón que ya uso en Terminal.
7. Como miembro del staff, quiero iniciar y finalizar la atención, y marcar manualmente cuando alguien no se presentó, para llevar registro correcto sin depender de un vencimiento automático.
8. Como cliente en sala de espera, quiero ver en una pantalla pública cuándo se llama mi Cita, para saber que debo acercarme, sin depender de que el staff me llame de viva voz.
9. Como administrador, quiero definir los Servicios agendables, su duración y capacidad por franja, para controlar qué se puede reservar.
10. Como administrador, quiero definir la disponibilidad horaria recurrente de cada Servicio, para que el sistema calcule qué franjas ofrecer.
11. Como administrador, quiero bloquear fechas u horarios puntuales, viendo antes un aviso si eso afecta Citas ya confirmadas, para decidir con información si igual quiero bloquear.

---

## 8. Requisitos funcionales

1. El módulo de Agenda no lee ni escribe `sectors`/`queues`/`terminals`/`turns`, ni depende de su lógica de negocio.
2. Un administrador puede crear/editar/desactivar Servicios (nombre, duración en minutos, capacidad por franja).
3. Un administrador puede definir la Disponibilidad recurrente de un Servicio (días de semana + rango horario).
4. Un administrador puede crear Bloqueos puntuales (fecha, o fecha + rango horario) para un Servicio o para todos.
5. Si un Bloqueo se superpone con Citas ya confirmadas, el sistema muestra un aviso (cantidad y detalle de Citas afectadas) antes de confirmarlo, pero permite crearlo igual; las Citas afectadas no se cancelan automáticamente.
6. Un cliente puede consultar, desde `/agenda` (no Totem, no `/mi-turno`), las Franjas disponibles de un Servicio dentro del horizonte de reserva configurado (default 2 semanas).
7. Un cliente puede reservar una Franja disponible con nombre, número de socio y contacto opcional, y recibe un código de Cita.
8. El sistema impide reservar una Franja al tope de capacidad (transaccional).
9. El sistema impide que un número de socio con una Cita activa (RESERVADA/LLAMADA/ATENDIENDO) reserve otra **en ese mismo Servicio** — el guard transaccional de duplicado filtra por número de socio + Servicio, no solo por número de socio; el mismo socio puede tener Citas activas simultáneas en Servicios distintos.
10. Un cliente puede cancelar o reprogramar su Cita con código + número de socio, únicamente mientras está en estado RESERVADA.
11. El staff accede a "Agenda del día" (separada de Terminal) con las Citas de hoy ordenadas por horario.
12. El staff puede llamar y re-llamar una Cita según su horario, iniciar la atención, finalizarla, o marcarla no-show manualmente con doble confirmación.
13. No existe ningún mecanismo automático que marque no-show por vencimiento de tiempo.
14. El sistema ofrece una pantalla pública propia del módulo que refleja los llamados/re-llamados, independiente de `PublicDisplay`, y de uso opcional.
15. El acceso a "Agenda del día" reusa los roles existentes (admin/supervisor/cajero) sin scoping adicional por Servicio.
16. Horizonte de reserva y duración de franja son parámetros configurables por el administrador, no valores fijos en código.
17. El campo de contacto en la Cita es opcional y no tiene ningún uso activo en este alcance.

---

## 9. Criterios de aceptación

- **Reserva exitosa**: dada una Franja disponible y un número de socio sin Cita activa, cuando el cliente reserva, entonces recibe un código de Cita y la Franja reduce en 1 su capacidad disponible.
- **Franja completa**: dada una Franja al tope de capacidad, cuando otro cliente intenta reservarla, entonces la reserva es rechazada.
- **Cita activa duplicada (mismo Servicio)**: dado un número de socio con una Cita en RESERVADA/LLAMADA/ATENDIENDO en un Servicio, cuando intenta reservar otra Cita en ese mismo Servicio, entonces el sistema la rechaza.
- **Cita activa en Servicio distinto (permitido)**: dado un número de socio con una Cita activa en el Servicio A, cuando reserva una Cita en el Servicio B, entonces el sistema la acepta.
- **Cancelación**: dada una Cita RESERVADA, cuando el cliente la cancela con código + número de socio correctos antes del horario, entonces la Franja vuelve a estar disponible.
- **Bloqueo con superposición**: dado un Bloqueo que se superpone con Citas confirmadas, cuando el admin lo crea, entonces ve un aviso con la cantidad/detalle de Citas afectadas y puede confirmar igual; esas Citas no cambian de estado automáticamente.
- **Agenda del día sin mezcla**: dado que hoy hay Citas confirmadas, cuando el staff abre "Agenda del día", entonces las ve ordenadas por horario, sin turnos walk-in ni datos de Terminal.
- **Llamar / re-llamar**: dada una Cita RESERVADA cuyo horario llegó, cuando el staff aprieta "Llamar", entonces pasa a LLAMADA y (si hay pantalla pública activa) se refleja con sonido/flash; cada "Re-llamar" repite el aviso sin cambiar de estado.
- **No-show manual**: dada una Cita en LLAMADA, cuando el staff confirma "No presentado" (doble confirmación), entonces pasa a NO_SHOW; no existe ninguna transición automática a este estado.

---

## 10. Edge cases

- Cambio de duración/capacidad de un Servicio con Citas ya reservadas bajo el valor anterior — se recomienda no re-evaluar retroactivamente las Citas existentes.
- Zona horaria: mismo cuidado que ya tiene la app (`ARGENTINA_OFFSET`) — Franjas y horizonte de reserva deben calcularse en TZ Argentina, no en la del navegador del cliente.
- Reprogramación/cancelación intentada sobre una Cita que ya pasó a LLAMADA/ATENDIENDO — el diseño la rechaza (ver sección 3.B), aplicando el mismo precedente que `cancelTurn` hoy (solo cancela en el estado previo a ser llamado). No es una decisión pendiente, ver sección 13.
- Reserva simultánea de la última unidad de capacidad de una Franja por dos clientes — debe resolverse transaccionalmente, uno de los dos es rechazado.

---

## 11. Impacto en datos / API

Módulo independiente: sin impacto sobre `sectors`/`queues`/`terminals`/`turns` ni sus endpoints. Superficie **nueva**:
- Colecciones Firestore: Servicio, Disponibilidad, Bloqueo, Cita (nombres funcionales, forma final fuera de este documento).
- Endpoints: CRUD admin de Servicio/Disponibilidad/Bloqueo; públicos para listar Franjas, crear/cancelar/reprogramar Cita; staff para llamar/re-llamar/iniciar/finalizar/marcar no-show.
- Nueva sección en Admin ("Agenda") para configurar Servicio/Disponibilidad/Bloqueo, incluyendo el aviso de superposición al crear un Bloqueo.
- Nueva pantalla de staff "Agenda del día" (reusa login/roles existentes, sin scoping nuevo).
- Nueva pantalla pública del módulo (sección 5).
- Nueva ruta pública `/agenda` (+ `/agenda/:citaId`) para el cliente.
- Corresponde documentar todo esto en `README.md` y en la colección Bruno en el mismo cambio, como cualquier superficie de API nueva.

---

## 12. Decisiones cerradas (reemplaza la sección de preguntas abiertas)

Ver "Actualización 2" al inicio del documento — las 8 decisiones ahí listadas están incorporadas en todas las secciones anteriores. No quedan preguntas abiertas de la iteración anterior.

---

## 13. Revisión crítica — cerrada

Todos los puntos quedaron resueltos en esta ronda. No quedan preguntas abiertas.

- **"Una Cita activa" es por Servicio, no global (única decisión real de negocio de esta ronda)**: un número de socio puede tener Citas activas simultáneas en Servicios distintos, pero solo una activa a la vez dentro del mismo Servicio. El guard transaccional de duplicado filtra por número de socio + `serviceId`, no solo por número de socio. Ya reflejado en las secciones 3, 8 y 9.
- **Orden de "Llamar" con capacidad > 1**: descartado como sobre-ingeniería. El sistema no arbitra: las Citas del mismo horario quedan juntas en "Agenda del día" y el staff decide el orden.
- **Cierre de jornada con una Cita en LLAMADA sin resolver**: descartado como sobre-ingeniería. No hace falta lógica de cierre — el no-show ya es manual, el staff lo corta cuando decide.
- **Tope de re-llamados**: descartado como sobre-ingeniería. Sin efecto real porque el no-show ya es manual (no automático); no se agrega el parámetro.
- **Pantalla pública con capacidad > 1**: se resuelve solo. Muestra la Cita puntual que el staff llamó, sin lógica de grupo.
- **Reprogramar/cancelar solo en RESERVADA**: no era una pregunta abierta real. Es aplicar el mismo criterio que ya usa `cancelTurn` hoy (solo se puede accionar mientras está en el estado previo a ser llamado) — precedente existente, no una decisión nueva.
