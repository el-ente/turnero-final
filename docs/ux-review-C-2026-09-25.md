# Revisión de UX — Turnero Digital (Reviewer C)

Fecha: 2026-09-25
Alcance: usabilidad y comodidad de uso end-to-end de los dos módulos (walk-in y Agenda), probados desde el navegador como los cuatro tipos de usuario (cliente walk-in, staff walk-in, cliente Agenda, staff Agenda) más las dos pantallas públicas. No incluye revisión de código ni de lógica de negocio.

## Resumen ejecutivo

Turnero Digital tiene una identidad visual consistente y bien resuelta: tipografía serif de buen tamaño para los títulos, paleta terracota/crema cálida, tarjetas centradas para las pantallas de cliente y un tema oscuro de alto contraste para las dos pantallas públicas. Un usuario que ya usó el Totem reconoce de inmediato la pantalla de "Agendar turno" — mismo layout, mismo lenguaje visual — y eso es una fortaleza real: reduce la carga cognitiva de aprender "otro sistema". Los mensajes de error de la gestión de citas (`/agenda/:id`) son además el mejor ejemplo de copy del producto: cálidos, concretos y con una acción de recuperación clara.

La mayor fricción no es de una pantalla puntual sino de un patrón que se repite: el producto no siempre le devuelve al usuario una confirmación de que su acción tuvo efecto. Vi tres casos concretos de esto — un botón de "Llamar siguiente" que no da ninguna señal cuando no hay nadie para llamar, una cancelación de turno walk-in sin ningún paso de confirmación (a diferencia de la doble confirmación de no-show que describe la consigna para Agenda), y una pantalla de seguimiento de turno que se queda cargando indefinidamente justo después del momento más importante del flujo (confirmar el turno). Ninguno de estos es un problema visual: son huecos de feedback en momentos donde el usuario más necesita certeza.

No pude completar una reserva real en `/agenda` porque la pantalla mostró de forma persistente "No hay servicios disponibles para agendar" durante toda la sesión, pese a que `/admin → Turnos con Cita` mostraba dos Servicios activos con disponibilidad 09:00–17:00 los 7 días. No sé si esto es un problema de datos del entorno compartido o algo más estructural — no lo investigué porque cae fuera del alcance de esta revisión — pero documento el impacto en la experiencia (bloqueo total de la tarea principal del cliente de Agenda) y evalúo lo que sí pude recorrer (el formulario, las pantallas de error, la vista de staff vacía).

## Hallazgos por audiencia

### Cliente walk-in (Totem `/` y `/mi-turno`)

**[Alta] La pantalla de confirmación del ticket se reemplaza sola en segundos, sin que el usuario la cierre.** Al sacar un turno en el Totem, aparece "TU TURNO — Ticket listo — Mirá el panel para seguir tu turno" y, sin ninguna interacción, la pantalla vuelve sola al formulario de ingreso para el siguiente cliente en apenas un par de segundos. En un kiosko compartido esto es el único momento en que el cliente ve su número: si no llega a leerlo o fotografiarlo a tiempo, lo perdió, porque el Totem ya está listo para otra persona. Para el público objetivo de un kiosko físico (que puede incluir adultos mayores, gente distraída, alguien con las manos ocupadas) es un tiempo de lectura muy ajustado para un dato que se necesita recordar durante toda la espera.

**[Alta] "Cancelar turno" en `/mi-turno` ejecuta la cancelación al primer clic, sin ningún paso de confirmación.** No hay diálogo de "¿Estás seguro?", ni un segundo toque, ni forma de deshacer. Es una acción irreversible (se pierde el lugar en la fila) tratada con la misma fricción que una acción benigna. Esto contrasta con la propia consigna del proyecto, que describe una "doble confirmación" para marcar no-show en Agenda — el equipo ya sabe que las acciones destructivas necesitan ese paso, pero no lo aplicó acá.

**[Alta] Tras sacar un turno desde `/mi-turno`, la página de seguimiento puede quedar en "Cargando tu turno…" indefinidamente.** Lo reproduje una vez de forma limpia: after confirmar el turno, la app navega a `/mi-turno/<id>` y se queda en el mensaje de carga sin spinner ni límite de tiempo visible; tuve que forzar un refresh manual para ver el estado real ("Esperando — Sos el próximo"). Es el peor momento posible para que el usuario dude si el sistema funcionó, justo después de la acción que más le importa.

**[Media] Bajo contraste en la pantalla de confirmación del Totem.** El número de ticket, "Farmacia" y "Ticket listo" se muestran en un rosa/salmón pálido sobre fondo crema — legible de cerca en condiciones ideales, pero notablemente más débil que el mismo número mostrado en `/mi-turno/<id>` (ahí sí aparece en naranja fuerte y negrita). Dos pantallas del mismo flujo, mismo dato, contraste muy distinto.

**[Media] La lista de colas no ayuda a elegir.** Al elegir cola aparecen 6 opciones ("Farmacia", "Farmacia Prioritaria", "PAMI", "PAMI Prioritaria", "Perfumería", "Perfumería Prioritaria") sin ninguna aclaración de cuándo corresponde cada una, y la primera queda pre-seleccionada visualmente por defecto. Un cliente apurado puede confirmar la cola equivocada sin darse cuenta de que ya había una marcada.

**[Baja] El número de turno que se muestra coincide con el número de socio ingresado (probado dos veces, con "4213" y "3141").** No indago la causa —podría ser una cuestión de numeración ya cubierta en la auditoría funcional— pero el efecto en la experiencia es relevante para esta revisión: si lo que se anuncia en la pantalla pública y de viva voz en el mostrador es el número de socio real, cualquier persona en la sala de espera puede asociar una identidad a ese número. Vale la pena confirmar si es intencional.

**Positivo:** la validación del campo de socio es clara e inmediata (borde, habilitación del botón, texto de ayuda "Ingresá un número de 1 a 5 dígitos"), y tras cancelar un turno aparece un CTA de recuperación claro ("Sacar otro turno").

### Staff walk-in (`/terminal`)

**[Alta] "Llamar siguiente" no da ninguna señal cuando la cola está vacía.** El botón se ve completamente habilitado (color sólido, sin aspecto de deshabilitado) incluso con "Cola de espera: 0". Al hacer clic no pasa absolutamente nada — ni toast, ni mensaje, ni cambio de estado. Para alguien operando el mostrador bajo presión, esto es indistinguible de "el sistema no responde".

**[Media] La sección "Filas asignadas" puede mostrarse vacía, con el botón "Cambiar" deshabilitado, sin ninguna explicación.** No hay texto tipo "Cargando…" ni tooltip que aclare por qué no se puede cambiar de fila en ese momento; en mis pruebas se resolvió solo tras unos segundos, pero durante esa ventana el panel no distingue "está cargando" de "está roto".

**[Baja] El estado de pausa (Pausar/Reanudar) tarda en reflejarse en el badge persistente** aunque sí aparece un toast de confirmación ("Terminal reanudada"); conviene confirmar que el estado visible (punto + texto "En línea"/"Pausada") se actualice tan rápido como el toast para que ambos nunca queden contradictorios en pantalla.

**Positivo:** buen uso de color semántico en los botones de acción — "Finalizar" en verde, "No presento" en rojo/salmón, "Llamar siguiente" como acción primaria destacada — permite reconocer la acción correcta de un vistazo. El estado de "Ventana flotante abierta/cerrada" también da feedback persistente claro.

### Pantalla pública walk-in (`/display`)

**[Baja] Buena legibilidad a distancia**: tema oscuro, reloj grande, título simple. El estado vacío ("Sin terminales activas") es correcto pero de bajo contraste (gris medio sobre gris oscuro); en una sala real, con luz ambiente variable, convendría subir el contraste de los estados sin actividad tanto como el de los llamados activos. No pude observar un llamado real en curso durante la sesión para evaluar ese estado.

### Cliente de Agenda (`/agenda`, `/agenda/:id`)

**[Alta] No pude completar una reserva: `/agenda` mostró "No hay servicios disponibles para agendar" de forma persistente**, incluso reintentando varias veces a lo largo de la sesión, mientras `/admin → Turnos con Cita` mostraba "Consulta general" y "Renovación de carnet" como Activos con disponibilidad 09:00–17:00 los 7 días. No indago la causa (podría ser del entorno compartido o algo más estructural, y no es el foco de esta revisión), pero el punto de UX es independiente de la causa: el mensaje de estado vacío es el mismo tanto si no hay servicios configurados, como si los hay pero no disponibles ahora, como si falló la carga — no hay forma de que el usuario (o el staff que recibe el reclamo) distinga un caso de otro, y no ofrece ningún camino ("reintentar", "volvé más tarde", datos de contacto). Como este mensaje bloquea el 100% del flujo del cliente de Agenda, es el hallazgo de mayor severidad de toda la revisión.

**[Media] Inconsistencia de terminología dentro del propio módulo: "turno" vs. "cita".** La pantalla de reserva se titula "Agendar turno" ("Elegí un servicio, un horario, y dejá tus datos") y el ítem de navegación dice "Agendar Turno" — pero la pantalla de gestión usa sistemáticamente "cita" ("Ver mi cita", "Ingresá tu número de socio para verla", "No encontramos esa cita"). Son dos nombres para el mismo objeto dentro de un mismo módulo, y "turno" es además la palabra que ya usa el otro módulo (walk-in) para un concepto distinto. Un cliente que reservó una "cita" puede no reconocerla si alguien le habla de su "turno", o viceversa.

**Positivo, y el mejor ejemplo de todo el producto:** el flujo de código inválido en `/agenda/:id` pide el número de socio para verificar identidad (coherente con el modelo de "código de URL + socio") y, ante un dato incorrecto, muestra "No encontramos esa cita — Revisá el código y tu número de socio" con un botón "Agendar un turno nuevo". Es cálido, específico y da un siguiente paso — muy por encima de los estados vacíos del módulo walk-in ("No hay colas disponibles", "Sin turno asignado"). Vale la pena tomarlo como referencia de tono para el resto del producto.

*Limitación de esta revisión:* no pude probar cancelar/reprogramar una cita real, ni verificar si esa acción tiene confirmación (relevante dado el hallazgo de "Cancelar turno" sin confirmación en walk-in), porque no logré crear una cita.

### Staff de Agenda (`/agenda-del-dia`)

**[Media, por alcance incompleto] No pude probar llamar/atender/finalizar/marcar no-show** porque no había citas cargadas para el día (consecuencia del bloqueo anterior). Esto en sí es una limitación de esta revisión, no un hallazgo de producto — pero significa que el punto más sensible pedido en la consigna (la doble confirmación de no-show) queda sin verificar.

**Positivo:** el layout de `/agenda-del-dia` es claro y da buena visión de conjunto: navegador de fecha (anterior/Hoy/siguiente), filtro por servicio, y contadores a la vista (Total, Pendientes, Atendidos, No-show) antes de la tabla. Es, en mi opinión, mejor jerarquía de información que la de `/terminal` para el mismo tipo de tarea (situar al staff de un vistazo).

### Pantalla pública de Agenda (`/agenda/pantalla`)

**[Baja] Buena consistencia visual con `/display`**: mismo tema oscuro, mismo reloj en vivo, mismo indicador "En tiempo real". El encabezado dice solo "Agenda", mientras que el del walk-in dice "Turnero Digital" — un detalle menor, pero si ambas pantallas conviven en la misma sala, no queda tan claro a simple vista que son parte del mismo sistema.

### Admin — "Turnos con Cita" (revisión secundaria)

**[Media] En el modal "Editar Servicio", los botones Guardar/Cancelar quedan fuera de vista sin scroll**, y no hay ninguna pista visual (footer fijo, sombra, contenido cortado) de que hay más contenido debajo. En una laptop de resolución estándar, un admin puede no darse cuenta de que tiene que scrollear para guardar, y cerrar el modal con la X pensando que no hay acción explícita de guardado.

**Positivo:** los selectores de día de la semana (Dom/Lun/.../Sáb) son claros y el estado activo se distingue bien por color; la tabla de Bloqueos es simple y legible.

## Comparación entre los dos módulos

Visualmente son muy consistentes — misma tipografía, misma paleta, mismo patrón de tarjeta centrada para pantallas de cliente, mismo tema oscuro para pantallas públicas — y el nav bar de staff nunca se filtra a las rutas de cliente, lo cual está bien resuelto. Un usuario que aprendió a usar el Totem entiende de inmediato la estructura de "Agendar turno".

Donde los dos módulos dejan de sentirse como "un mismo sistema" es en dos ejes:

1. **Confirmación de acciones destructivas.** Walk-in cancela un turno sin ningún paso intermedio; la consigna describe a Agenda con doble confirmación para no-show. Si esa asimetría es real (no pude verificarlo del lado de Agenda por el bloqueo de reservas), un mismo usuario tendría que aprender dos niveles de fricción distintos para acciones equivalentes en severidad ("perder mi lugar en la fila" vs. "perder mi cita").
2. **Calidad de los mensajes de error/estado vacío.** Agenda tiene el mejor mensaje del producto (cita no encontrada, con CTA de recuperación) mientras que walk-in tiene los más pobres (textos planos sin acción: "No hay colas disponibles", "Sin turno asignado", "Sin terminales activas"). Esto sugiere que no hay un lineamiento compartido de copy para estados vacíos/error entre los dos equipos o módulos.

Además, la terminología "turno" (walk-in) vs. "cita" (Agenda) se cruza dentro del propio módulo de Agenda (ver hallazgo arriba), lo que hace más difícil, no menos, que la transferencia de aprendizaje entre módulos sea completa.

## Quick wins vs. cambios más grandes

**Quick wins (bajo esfuerzo, alto impacto):**
- Agregar un toast/mensaje visible cuando se hace clic en "Llamar siguiente" sin nadie en cola ("No hay turnos esperando").
- Agregar confirmación ("¿Cancelar tu turno?") antes de ejecutar "Cancelar turno" en `/mi-turno`.
- Subir el contraste de la pantalla de confirmación del Totem (número de ticket, "Ticket listo") para que iguale al de `/mi-turno/<id>`.
- Unificar "turno" vs. "cita" dentro de Agenda (nav, título de `/agenda`, textos de `/agenda/:id`) — elegir una sola palabra para todo el módulo.
- Agregar un footer fijo (o indicador de scroll) al modal "Editar Servicio" en Admin para que Guardar/Cancelar siempre estén visibles.
- Unificar el encabezado de las pantallas públicas ("Turnero Digital" en ambas, con el nombre del módulo como subtítulo) para reforzar que son un mismo sistema.

**Cambios más grandes (requieren más diseño/trabajo):**
- Revisar el timeout de la pantalla de confirmación del Totem: dar al cliente una forma explícita de cerrarla (botón "Listo") en vez de un auto-reset por tiempo, o extender bastante la ventana de lectura.
- Diagnosticar por qué `/mi-turno/<id>` puede quedar en "Cargando tu turno…" sin resolver tras la creación del turno, y agregar manejo de error/reintento visible en vez de carga infinita.
- Escribir un lineamiento de copy compartido para estados vacíos y de error (tono, estructura, CTA de recuperación) y aplicarlo parejo en ambos módulos, tomando como modelo el mensaje de "cita no encontrada".
- Definir y documentar un único patrón de confirmación para acciones destructivas (cancelar turno walk-in, cancelar/reprogramar cita, marcar no-show) y aplicarlo consistentemente en los dos módulos.

---

## Actualización — flujos completados en segunda pasada

Fecha: 2026-09-25 (segunda pasada, mismo día). Contexto: se creó un Servicio nuevo y bien configurado ("Trámite general", 15 min, capacidad 3, disponible los 7 días 08:00–20:00, horizonte 14 días) para destrabar la reserva de Agenda. Retomé exactamente los puntos que había dejado sin probar: reserva real, cancelar/reprogramar una cita, y el ciclo completo de staff en `/agenda-del-dia` incluyendo la doble confirmación de no-show.

**El bloqueo original ("No hay servicios disponibles para agendar" de forma permanente) no se reproduce como bloqueo total.** Completé una reserva real de punta a punta (elegí "Trámite general", horario, nombre, número de socio, confirmé y recibí pantalla de ticket con código), y después cancelé esa misma cita y reprogramé una segunda. Así que la limitación que dejé anotada la vez pasada ("no pude probar cancelar/reprogramar, ni el ciclo de staff, ni la doble confirmación de no-show") queda resuelta: pude probar los tres.

Pero encontré algo más específico que conecta directo con mi hallazgo original, así que no lo dejo pasar:

### [Alta] La causa real no es "servicios mal configurados": es que no hay estado de carga en la lista de servicios, y el mensaje de "vacío" se muestra también mientras todavía está cargando

Con los cuatro Servicios activos y bien configurados en Firestore (lo verifiqué directo contra el emulador), `/agenda` me siguió mostrando "No hay servicios disponibles para agendar" en varias recargas a lo largo de la sesión — a veces cargaba bien, a veces no, sin ningún patrón visible y sin ningún error en consola. Investigué la causa (no es responsabilidad de esta revisión arreglarlo, pero sí entender qué le pasa al usuario): en `AppointmentBookingView.tsx`, la carga de Servicios (`getDocs(collection(db, "appointmentServices"))`, líneas 68–81) no tiene ningún estado de "cargando" — el componente arranca con `services = []`, y el render (línea 144) muestra el mismo texto de "no hay servicios" tanto si la carga terminó y está vacía de verdad, como si todavía no terminó. Medí una de esas llamadas directamente desde la consola del navegador: tardó **32.7 segundos** en resolver (con éxito, trayendo los 4 servicios). Durante esos 32 segundos, cualquier cliente que entre a `/agenda` ve el mensaje de "no hay servicios" — indistinguible del caso real de catálogo vacío.

Esto es exactamente el patrón que ya había señalado en la revisión anterior para el estado vacío de `/agenda` (mensaje ambiguo, sin acción de recuperación) pero ahora con una causa concreta y verificable, y con evidencia de que probablemente sea lo que me bloqueó la primera vez — no un problema de datos. El mismo patrón se repite en `/agenda-del-dia` (`AppointmentAgendaView.tsx`): el `onSnapshot` sobre `appointments` (líneas 59–73) y el `getDocs` sobre `appointmentServices` (líneas 50–57) tampoco tienen estado de carga, así que "No hay citas para este día" (línea 147) puede aparecer mientras todavía está conectando. Efecto secundario que alcancé a ver una vez: si el listener de citas resuelve antes que el de servicios, la columna "Servicio" de la tabla muestra el ID crudo de Firestore ("TRSzUHEEpL3ihKaS9wjz") en vez del nombre ("Trámite general") hasta que el segundo fetch termina.

*Nota metodológica:* esta sesión corrió con más de diez pestañas del navegador abiertas contra el mismo emulador de Firestore (incluyendo otro proceso trabajando en paralelo sobre los mismos datos), lo cual seguramente agravó los tiempos — en condiciones normales de un solo usuario esto probablemente resuelve en milisegundos y nunca se nota. Pero el bug de fondo (ausencia de estado de carga) es del código, no del entorno: cualquier latencia real de red, un cold-start del backend, o una conexión mala en producción va a producir el mismo falso "no hay servicios" o "no hay citas", sin loading visible y sin forma de que el usuario lo distinga de un vacío real.

**Recomendación:** agregar un estado `loadingServices` / aprovechar mejor el `loading` ya existente en `AppointmentAgendaView` para cubrir también la carga inicial, y no renderizar el estado vacío hasta que el primer fetch realmente haya resuelto.

### [Alta] "Cancelar cita" en Agenda tampoco tiene confirmación — no hay asimetría con walk-in, hay el mismo hueco en los dos módulos

En mi revisión anterior dejé abierta la pregunta de si Agenda replicaba la doble confirmación de no-show también para cancelar una cita. Ya lo puedo confirmar: **no.** Click en "Cancelar cita" en `/agenda/:id` ejecuta la cancelación al toque, sin ningún paso intermedio — mismo patrón exacto que "Cancelar turno" en `/mi-turno`. Esto cambia el marco de mi hallazgo anterior: no es una inconsistencia entre módulos (uno con fricción y otro sin ella), es un hueco parejo en los dos — la única acción destructiva que sí pide confirmación en todo el producto es marcar no-show en `/agenda-del-dia`. La recomendación de "definir un único patrón de confirmación para acciones destructivas" de mi resumen anterior aplica sin cambios, pero ahora con alcance confirmado a las tres acciones (cancelar turno walk-in, cancelar cita Agenda, reprogramar no aplica porque no es destructiva).

### Positivo — Reprogramar cita tiene mejor diseño de confirmación que Cancelar

"Reprogramar" sí tiene un paso intermedio real: primero elegís día y horario, y recién ahí un botón separado y explícito ("Confirmar nuevo horario") aplica el cambio — un commit en dos pasos, aunque no sea una confirmación tipo "¿estás seguro?". Es un contraste útil: la única diferencia entre "Cancelar" (un clic, sin vuelta atrás) y "Reprogramar" (elegís, después confirmás) es que Reprogramar fuerza al usuario a pasar por una pantalla intermedia antes del botón de compromiso final. Vale la pena tomarlo como modelo mínimo para agregarle ese mismo paso a Cancelar. Detalle menor [Baja]: el horario actual de la cita no se excluye de la grilla de horarios al reprogramar, así que técnicamente se puede "reprogramar" al mismo día y hora que ya tenías.

### Positivo — ciclo completo de staff en `/agenda-del-dia` funciona bien, y confirma la doble confirmación de no-show

Probé el ciclo completo sobre citas de prueba: **Llamar → Re-llamar → Atender → Finalizar**, y por separado **Llamar → No presentado**. Los cuatro botones de acción dan un toast de confirmación inmediato y específico ("Llamando a...", "Re-llamado", "Atención iniciada", "Cita finalizada") — un contraste directo y favorable contra el "Llamar siguiente" de `/terminal`, que mi revisión anterior marcó como el peor caso de falta de feedback de todo el producto. La doble confirmación de no-show existe y funciona bien: al hacer clic en "No presentado" el botón se reemplaza en la misma fila por "¿Seguro? Sí / No" — confirmación inline, sin modal, mantiene el contexto de la fila, y requiere una acción explícita adicional antes de aplicar el cambio. Es un buen patrón, liviano y claro; lo marco como la referencia a seguir si se define un estándar de confirmación para todo el producto (ver hallazgo anterior).

### Positivo — `/agenda/pantalla` funciona y se actualiza en tiempo real

Con varias citas llamadas simultáneamente (incluidas por el otro proceso corriendo en paralelo), la pantalla mostró una tarjeta por cada cita llamada, con el nombre del servicio, el horario y una etiqueta "Rellamado Nx" cuando corresponde — consistente en estética con `/display` y con buena legibilidad. Le aplica la misma advertencia de estado de carga mencionada arriba: el estado vacío ("Sin citas llamadas en este momento") es indistinguible de "todavía conectando".

---

*Reviewer C (segunda pasada)*
