# Revisión de UX — Turnero Digital
**Reviewer B — 25/09/2026**

Evaluación de usabilidad y diseño de producto, no de bugs de lógica de negocio. Recorrido end-to-end como cliente y como staff en ambos módulos (walk-in y Agenda), desde el navegador, en un entorno compartido con otros procesos de prueba corriendo en paralelo (aviso explícito del brief). Donde algo pudo estar afectado por esa concurrencia lo aclaro explícitamente; el resto son observaciones directas, repetidas varias veces para descartar parpadeos puntuales.

---

## Resumen ejecutivo

Turnero Digital tiene una identidad visual sólida y consistente: tipografía serif para números y títulos, acento naranja/salmón, tarjetas centradas para los flujos de cliente, y un tema oscuro de alto contraste compartido por las dos pantallas públicas (`/display` y `/agenda/pantalla`). Alguien que usó un módulo reconoce el "aire de familia" del otro de inmediato. La pantalla de seguimiento en vivo de `/mi-turno/:id` y la pantalla de error de `/agenda/:id` son, para mí, los dos mejores momentos del producto: dicen claramente qué está pasando, qué hacer a continuación, y no dejan a la persona en un callejón sin salida.

La mayor fricción que encontré no es cosmética: durante toda la sesión de revisión, `/agenda` (la pantalla donde un cliente reserva una cita) mostró "No hay servicios disponibles para agendar" de forma persistente y reproducible en tres pestañas distintas, a pesar de que el panel de Admin muestra 3 Servicios en estado "Activo". Esto bloqueó por completo mi intento de completar la tarea principal del módulo Agenda como cliente. En paralelo, encontré una segunda señal preocupante del mismo tipo: tanto la pantalla "Seleccionar Terminal" del staff walk-in como la pantalla pública `/display` reportaron "sin terminales activas/configuradas" mientras yo tenía, en otra pestaña, un terminal confirmado "En línea" atendiendo un ticket. No puedo garantizar que esto no sea un artefacto de la concurrencia de pruebas, pero el patrón se repitió de forma consistente (las vistas que "listan" fallan, el acceso directo por ID funciona), lo cual sugiere algo más sistemático que ruido aleatorio.

Fuera de esos dos bloqueos, el resto de los hallazgos son de fricción moderada a baja: etiquetas incompletas o con errores ("Iniciar atencion" sin tilde, "No presento" gramaticalmente incompleto, "Ratio" sin valor), una cabecera de estado en el Terminal que dice "ATENDIENDO" incluso cuando el ticket todavía no fue atendido, un temporizador de confirmación de ticket en el Totem que parece demasiado corto para el público (farmacia/PAMI, probablemente con proporción alta de personas mayores), y una superposición de intención poco clara entre "sacar un turno" y "seguir mi turno" en `/mi-turno`.

---

## Hallazgos por audiencia y módulo

### Cliente walk-in (Totem `/` y `/mi-turno`)

**[Media] Las colas "Prioritaria" no explican el criterio de elegibilidad.**
En la pantalla de selección de cola del Totem aparecen 6 opciones (Farmacia, Farmacia Prioritaria, PAMI, PAMI Prioritaria, Perfumería, Perfumería Prioritaria), y las tres "Prioritaria" llevan solo una etiqueta ("Prioritaria") sin ningún texto que explique quién puede usarlas. En un kiosko de autoservicio sin supervisión, no hay nada que impida que cualquier persona elija la fila prioritaria sin calificar, y no hay ninguna pista visual de qué la diferencia más allá del badge. Importa porque genera disputas en el mostrador ("¿por qué salté la fila?") y porque el sistema no le da al cliente la información que necesitaría para autorregularse.

**[Media] La primera cola de la lista aparece preseleccionada por defecto.**
Al llegar a la pantalla de selección de cola, "Farmacia" ya aparece resaltada (fondo salmón, borde naranja) sin que el usuario haya tocado nada — lo confirmé en dos corridas independientes, apareciendo así en el primer render. En un kiosko compartido, alguien apurado podría confirmar sin querer la cola por defecto en lugar de la que realmente necesita, especialmente porque las 6 opciones son visualmente muy parecidas entre sí.

**[Alta] La confirmación del ticket se autodestruye en pocos segundos, sin acción para prolongarla.**
Después de "Confirmar turno" aparece una tarjeta "Ticket listo" con el número grande, la cola y la hora — pero medí que la pantalla vuelve sola al formulario inicial en algún punto entre 2 y 5 segundos, sin botón para cerrarla manualmente ni forma de recuperar el número después (no hay impresión, no hay QR). Para una audiencia de farmacia/PAMI, que probablemente incluye una proporción importante de personas mayores, cinco segundos es poco tiempo para leer y memorizar un número antes de que la pantalla se resetee para la siguiente persona. Un atenuante real: el número de ticket es el mismo número de socio que la persona acaba de tipear, así que en la práctica es más memorizable de lo que sería un número correlativo aleatorio — pero igual no le dice a la persona cuándo acercarse, solo cuál es "su" número.

**[Media] `/mi-turno` es visualmente idéntico a "sacar un turno nuevo", sin distinguir la intención de "seguir mi turno".**
`/mi-turno` muestra exactamente la misma pantalla "Sacar turno" que el Totem, con el mismo copy ("Ingresá tu número de socio"). Un cliente que ya tiene un ticket activo y vuelve a este link para consultar su estado no tiene ninguna pista de que está en el mismo flujo de "crear" un ticket hasta que completa todo el proceso de selección de cola y confirmación — recién ahí el sistema lo redirige a la vista de seguimiento en vivo (`/mi-turno/:id`). Esto puede hacer pensar al usuario que está sacando un turno duplicado. Comparar con Agenda, que sí separa "Agendar turno" de "Ver mi cita" como pantallas distintas (ver sección de comparación).

**[Positivo, sin severidad] La vista de seguimiento en vivo (`/mi-turno/:id`) está muy bien resuelta.**
Número grande, nombre de cola, badge de estado con color ("Esperando" / "Sos el próximo"), hora, un recordatorio explícito ("Guardá este enlace para volver a ver tu turno") y un botón "Cancelar turno". Es la pantalla más clara de todo el flujo de cliente walk-in y compensa parcialmente la fricción del punto anterior una vez que el usuario llega a ella.

---

### Staff walk-in (`/terminal`)

**[Alta, con reserva por concurrencia] La pantalla "Seleccionar Terminal" y `/display` reportaron "sin terminales" mientras un terminal estaba activo y atendiendo.**
Repetí la comprobación varias veces: con `terminal-farmacia` confirmado "En línea" y con un ticket en estado "Llamado" en una pestaña, tanto "Seleccionar Terminal" (`No hay terminales configuradas`) como la pantalla pública `/display` (`Sin terminales activas`) no lo reflejaron, incluso con el indicador "En tiempo real" en verde. El patrón se repitió igual en ambas pantallas de "listado", mientras que el acceso directo por URL al terminal (`/terminal/terminal-farmacia`) sí funcionaba correctamente en todo momento. No puedo descartar del todo que sea un efecto de tener múltiples procesos de prueba usando el mismo terminal en simultáneo, pero la consistencia del patrón (falla en listar, funciona por ID directo) amerita que ingeniería lo mire: si es real, un miembro de staff sin la URL exacta guardada no podría siquiera entrar al Terminal, y la sala de espera se quedaría sin ninguna pantalla informativa aunque haya gente siendo atendida.

**[Baja] En la tarjeta de selección de terminal, la etiqueta "Ratio" aparece sin ningún valor.**
Cada tarjeta dice "2 colas · Ratio", pero después de "Ratio" no hay número ni texto — se lee como una etiqueta cortada a mitad de camino.

**[Media] La cabecera "ATENDIENDO" no coincide con el estado real del ticket.**
Confirmé, viendo la transición completa de un mismo ticket, que el título de la sección central del Terminal dice siempre "ATENDIENDO" en mayúsculas — incluso cuando el badge de estado, debajo, todavía dice "Esperando" o "Llamado" (es decir, antes de que el staff haya presionado "Iniciar atención"). Como "atendiendo" tiene un significado específico ("en este momento se lo está atendiendo"), mostrarlo antes de tiempo puede hacer que un cajero distraído crea que ya inició la atención cuando no lo hizo. Convendría un título neutro tipo "TURNO ACTUAL" o que el texto cambie según el estado real.

**[Baja] El botón "Iniciar atencion" no lleva tilde.**
Debería decir "Iniciar atención". Es un detalle chico, pero es el botón más usado de toda la pantalla, en cada ticket, todos los días.

**[Baja] La etiqueta "No presento" está gramaticalmente incompleta.**
Se lee como un fragmento de oración más que como una etiqueta de botón. Alternativas más naturales: "No se presentó", "Ausente" o "No asistió".

**[Baja] En la lista "Cola de espera", el número de ticket y la hora quedan pegados cuando el número tiene 5 dígitos.**
Con números de 4 dígitos hay espacio visible entre el número y la hora ("9034 10:37 a. m."), pero con 5 dígitos se pegan ("4128712:00 a. m."), lo que reduce la legibilidad justo cuando la cola tiene más movimiento (más dígitos suele coincidir con más actividad).

**[Positivo, sin severidad] Los toasts de "Terminal pausada" / "Terminal reanudada" son un buen patrón de feedback**, discreto y claro. Sería bueno extender ese mismo patrón a otras acciones que hoy no lo tienen (por ejemplo, "Turno finalizado" al presionar Finalizar).

---

### Cliente Agenda (`/agenda`, `/agenda/:id`)

**[Alta] No pude completar la reserva de una cita: `/agenda` mostró "No hay servicios disponibles para agendar" durante toda la sesión.**
Repetí la comprobación más de cinco veces a lo largo de ~10 minutos, desde tres pestañas distintas, con esperas de hasta 5 segundos entre intentos, y el resultado fue siempre el mismo. Sin embargo, en `/admin → Turnos con Cita` los 3 Servicios ("Consulta general", "Renovación de carnet", "Sin disponibilidad") figuran en estado "Activo". No determiné la causa raíz (queda fuera del alcance de esta revisión), pero desde la experiencia del cliente el resultado es contundente: la pantalla de entrada al módulo — cuyo subtítulo promete "Elegí un servicio, un horario, y dejá tus datos" — no ofrece ninguna opción, ningún botón de reintentar, ningún contacto alternativo. Es el bloqueo más severo que encontré en todo el sistema porque impide por completo la tarea principal del módulo. Como consecuencia directa, no pude evaluar los pasos de selección de horario/día ni la pantalla de confirmación de reserva — es un hueco de cobertura que prefiero declarar en vez de inventar una opinión sin haberlo visto.

**[Positivo, sin severidad] La pantalla de "Ver mi cita" con código inválido está muy bien resuelta.**
Al entrar a `/agenda/:id` con un código que no existe, después de pedir el número de socio, el sistema muestra un estado de error ejemplar: título claro ("No encontramos esa cita"), explicación breve en lenguaje simple ("Revisá el código y tu número de socio") y un botón de recuperación directo ("Agendar un turno nuevo"). Además, el solo hecho de tener el código (por ejemplo, desde un link reenviado) no alcanza para ver los datos de la cita: el sistema exige también el número de socio antes de mostrar cualquier información — un gesto de privacidad razonable para algo potencialmente compartible por URL. Esta es, junto con el seguimiento en vivo de `/mi-turno/:id`, la mejor experiencia de error de todo el producto, y contrasta con los estados vacíos más planos del módulo walk-in (ver comparación).

---

### Staff Agenda (`/agenda-del-dia`)

**[Sin severidad — cobertura incompleta] No había ninguna cita cargada para el día de hoy en ningún momento de la revisión** (contador "Total: 0" en todos los chequeos), consistente con el bloqueo de reservas descripto arriba. Esto me impidió ejercer el flujo de llamar/atender/finalizar/no-show con doble confirmación que pedía el brief. Reporto lo que sí pude ver de la pantalla en su estado vacío:

**[Positivo, sin severidad] La franja de contadores (Total / Pendientes / Atendidos / No-show) siempre visible arriba de la tabla** le da al staff una lectura del día completo de un vistazo, algo que el Terminal de walk-in no ofrece (ahí solo se ve el conteo de una cola a la vez, no un resumen del turno de trabajo). La navegación por día (◀ Viernes, 25 de Septiembre ▶, con atajo "Hoy") y el filtro "Todos los servicios" son claros y están donde se los espera.

No puedo opinar sobre la claridad de la doble confirmación de no-show, ni sobre la consistencia de vocabulario de estados en esta pantalla, porque no tuve ningún registro sobre el cual ejecutar esas acciones.

---

### Admin — "Turnos con Cita" (prioridad secundaria, revisión breve)

**[Baja] Un servicio "Activo" sin franjas cargadas no tiene ninguna advertencia en la tabla.**
El servicio de prueba "Sin disponibilidad" figura como "Activo" igual que los otros dos, con la columna Disponibilidad en "Sin franjas cargadas" — pero nada en esa fila avisa al admin que, en la práctica, ese servicio es invisible/inutilizable para los clientes en `/agenda`. Un badge de advertencia inline ("sin franjas — los clientes no podrán reservar") cerraría ese hueco.

**[Baja] En el modal "Editar Servicio", los botones Guardar/Cancelar quedan fuera de la vista sin ninguna pista de que hay que hacer scroll.**
En una ventana de 1547×784 (tamaño de laptop estándar, sin zoom inusual), el modal corta justo después de "+ Agregar franja horaria" — que de por sí parece un punto de cierre plausible — sin sombra, degradé ni ningún indicador de que el formulario continúa. Es fácil que un admin cierre el modal pensando que no había forma de guardar, o que no note que sus cambios no se guardaron.

Por lo demás, la tabla de Servicios agendables y la de Bloqueos son legibles y no requieren entrar a cada fila para comparar información — buen diseño de tabla.

---

## Comparación entre los dos módulos

Al nivel visual, los dos módulos se sienten como un mismo producto: misma tipografía, mismo color de acento, mismo patrón de tarjeta centrada para cliente, y las dos pantallas públicas (`/display`, `/agenda/pantalla`) comparten el mismo tratamiento oscuro de alto contraste, el mismo reloj, y el mismo indicador "En tiempo real" al pie — alguien que usó una reconoce la otra de inmediato. Este es un acierto real de consistencia de marca.

Donde sí divergen es en el **vocabulario de interacción**, y ahí un usuario (o un mismo miembro de staff) que ya aprendió un módulo no necesariamente entiende el otro sin reaprender:

- **Crear vs. seguir un turno**: Agenda separa claramente "Agendar turno" (crear) de "Ver mi cita" (consultar/cancelar), con textos de ayuda distintos para cada intención. Walk-in, en cambio, hace que `/mi-turno` reutilice la pantalla completa de "Sacar turno" para ambas intenciones, revelando recién al final si era una consulta o una creación. Agenda resolvió mejor este problema; walk-in debería adoptar el mismo patrón.
- **Calidad de los estados de error/vacío**: Agenda responde con motivo + acción de recuperación ("No encontramos esa cita" → "Agendar un turno nuevo"). Walk-in tiende a mensajes planos sin salida ("Sin turno asignado", "Sin turnos esperando", "No hay terminales configuradas"). Alguien que se acostumbró a la Agenda encontraría el walk-in más brusco frente a un error.
- **Vocabulario de estados para staff**: no pude comparar de forma directa la confirmación de no-show de Agenda del Día (no había citas para probarla) contra el "No presento" del Terminal walk-in, pero dado que un mismo empleado puede operar ambos módulos en el mismo turno, vale la pena una pasada explícita para unificar cómo se llama a "el cliente no vino" en los dos lugares.
- **Unidad central del dominio**: "turno" (por orden de llegada, ticket = número de socio) vs. "cita" (día y hora específicos) son conceptualmente distintos y está bien que se llamen distinto — no es una inconsistencia, es la diferencia real entre los dos productos.

---

## Quick wins (bajo esfuerzo, impacto real)

- Agregar la tilde faltante en "Iniciar atención".
- Reescribir "No presento" como "No se presentó" o "Ausente".
- Cambiar el título fijo "ATENDIENDO" del Terminal por uno neutro ("TURNO ACTUAL") o hacer que refleje el estado real del ticket.
- Completar o quitar la palabra suelta "Ratio" en las tarjetas de selección de terminal.
- Agregar espaciado entre el número de ticket y la hora en la lista "Cola de espera" para números de 5 dígitos.
- Agregar una sombra/indicador de scroll (o un footer fijo) en el modal "Editar Servicio" para que Guardar/Cancelar no queden ocultos.
- Agregar un aviso visual en la tabla de Servicios cuando un servicio "Activo" no tiene franjas cargadas.
- Extender (o hacer cerrable manualmente) el tiempo de la pantalla "Ticket listo" del Totem, hoy demasiado breve para una audiencia con proporción alta de personas mayores (farmacia/PAMI).
- Sumar una línea explicando qué significa "Prioritaria" en la pantalla de selección de cola del Totem, y reconsiderar que la primera cola aparezca preseleccionada por defecto en un kiosko compartido.

## Cambios más grandes

- Resolver el bloqueo de `/agenda` ("No hay servicios disponibles para agendar" pese a haber servicios activos) — hoy impide por completo la tarea principal del módulo Agenda del lado del cliente.
- Investigar por qué las vistas de "listado" (Seleccionar Terminal, `/display`) no reflejan terminales que sí están activos y funcionando cuando se accede a ellos directamente por URL.
- Separar `/mi-turno` en dos intenciones claras (crear vs. seguir un turno), replicando el patrón que Agenda ya usa entre "Agendar turno" y "Ver mi cita".
- Hacer una pasada completa de estados vacíos/error del módulo walk-in para llevarlos al estándar que ya tiene Agenda (motivo + acción de recuperación, no solo un mensaje plano).
- Unificar el vocabulario de estados y acciones de staff (no-show, llamar/atender) entre Terminal y Agenda del Día, para que un mismo empleado no tenga que sostener dos modelos mentales distintos.

---

## Actualización — flujos completados en segunda pasada

Retomo exactamente lo que quedó bloqueado en la primera pasada. Contexto nuevo: se creó un servicio bien configurado ("Trámite general", 15 min, capacidad 3, todos los días 08:00-20:00, horizonte 14 días) y el entorno sigue siendo compartido con al menos otro proceso de prueba corriendo en paralelo sobre la misma base y el mismo grupo de pestañas del navegador — donde eso afectó una observación lo aclaro explícitamente.

**El bloqueo original de `/agenda` ya no se reproduce de forma permanente, pero cambió de forma y sigue siendo un problema real.** Con "Trámite general" activo pude completar una reserva de punta a punta (servicio → día → horario → datos → confirmación con código). Sin embargo, en varias cargas frescas de `/agenda` el mensaje "No hay servicios disponibles para agendar" siguió apareciendo, en un caso durante más de 20 segundos, antes de que los servicios aparecieran solos sin que yo hiciera nada. Confirmé en la consola el motivo: `@firebase/firestore: Could not reach Cloud Firestore backend. Backend didn't respond within 10 seconds` — es decir, el estado "sin servicios" y el estado "todavía cargando/reconectando" son visualmente idénticos para el usuario. Esto es distinto del bloqueo total que describí en la primera pasada (ahí el mensaje era persistente indefinidamente), pero el efecto para un cliente real es parecido: una pantalla que dice "no hay nada para vos" cuando en realidad solo está tardando.

**[Alta] La pantalla "Agendar turno" no distingue "cargando" de "vacío", y no ofrece reintentar.** Como se describe arriba, la misma frase ("No hay servicios disponibles para agendar") cubre tanto el estado transitorio de reconexión como un estado realmente vacío. No hay spinner, skeleton, ni botón "Reintentar". Un cliente real no tiene forma de saber si debe esperar, recargar, o irse. Recomendación: mostrar un estado de carga explícito mientras la primera respuesta de Firestore no llegó, y reservar el mensaje "no hay servicios" solo para cuando la consulta ya resolvió y la lista vino vacía.

**[Alta] La grilla de horarios puede reordenarse mientras el usuario está eligiendo, y el click puede terminar reservando un turno distinto al elegido.** Lo reproduje reservando una segunda cita: hice click sobre lo que en pantalla se veía como "16:00" para "Vie, 25 Sept", pero la confirmación final mostró "Sáb, 26 Sept 19:00" — un día y horario que nunca toqué. La causa más probable es que la lista de horarios se recalcula en tiempo real (por reservas concurrentes de otros procesos sobre el mismo servicio) y los botones se desplazan de posición entre el momento en que el usuario mira la pantalla y el momento en que hace click, sin que haya ningún paso de revisión ("vas a reservar X día, Y hora") antes de tocar "Confirmar turno". Es un problema de integridad real, no solo cosmético: el sistema permite terminar una reserva en una franja horaria que la persona nunca eligió conscientemente, y no hay pantalla de confirmación intermedia que lo hubiera evitado.

**[Positivo, sin severidad] El flujo de reserva hasta la confirmación con código está bien resuelto.** El formulario es corto (servicio, día, horario, nombre, número de socio, contacto opcional), y la pantalla final ("Reservada", código, "Guardá este enlace para gestionar tu cita") es clara y, de forma práctica, ya incluye ahí mismo los botones "Cancelar cita" y "Reprogramar" — no hace falta ir a buscar `/agenda/:id` por separado justo después de reservar.

**[Alta] "Cancelar cita" no pide ninguna confirmación — un solo click cancela la cita de inmediato.** Probé esto directamente: entré a la cita reservada, toqué "Cancelar cita", y sin ningún diálogo intermedio la cita pasó a "Cancelada" en el acto. Para una acción irreversible desde la perspectiva del cliente (no hay "deshacer cancelación"), la ausencia total de un paso de confirmación es una fricción de severidad alta — un click accidental (fácil en mobile, con el dedo) borra la cita sin aviso. Contrasta directamente con "No presentado" en Agenda del Día del staff, que sí tiene doble confirmación (ver más abajo): dentro del mismo producto, una acción destructiva del lado del cliente tiene menos fricción protectora que una del lado del staff, cuando debería ser al revés o al menos igual.

**[Media] "Reprogramar" no es una reprogramación: es cancelar y volver a agendar desde cero, sin ningún contexto heredado.** Al tocar "Reprogramar" el sistema cancela la cita original (lo confirmé: el código viejo queda con estado "Cancelada") y manda al usuario a la pantalla genérica "Agendar turno" — con el mismo problema de la pantalla en blanco descripto arriba, el mismo servicio preseleccionado por defecto ("Sin disponibilidad", el primero de la lista, no el que tenía la cita original) y el formulario vacío otra vez. El resultado es un código de gestión completamente nuevo. Ningún texto en pantalla avisa "estás reprogramando tu cita del [día/hora anterior]" ni "guardá este nuevo enlace en lugar del anterior" — alguien que guardó el link original (como el propio sistema le sugiere hacer) se queda con un enlace a una cita cancelada, sin ninguna pista de que ahora existe un enlace distinto que tiene que guardar en su lugar.

**Staff — Agenda del Día: ejecuté el ciclo completo (Llamar → Re-llamar → Atender → Finalizar) sobre una cita, y funciona.** "Re-llamar" queda deshabilitado brevemente después de "Llamar" (parece un cooldown para evitar reiteración accidental, razonable). "Atender" cambia el estado a "En atención" y habilita "Finalizar". Hubo una demora notable entre click y actualización visual en más de una acción (coherente con la misma latencia de Firestore mencionada arriba) — en un caso "Finalizar" no pareció surtir efecto y tuve que tocarlo una segunda vez para que el estado pasara a "Finalizada". **[Positivo]** Además, "Llamar" ahora dispara un toast ("Llamando a [nombre]"), lo cual extiende el buen patrón de feedback que ya había visto en Terminal a esta pantalla también.

**[Media] La doble confirmación de "No presentado" existe y funciona, pero los botones son chicos, están pegados, y no dan ningún aviso si se cancela.** Confirmo lo que el brief anticipaba: al tocar "No presentado" no se ejecuta directamente — aparece inline, en el mismo lugar del botón, un "¿Seguro?" con "Sí" / "No". Es el único punto de todo el sistema (cliente o staff) con un paso de confirmación real, y cumple su función. Pero: los dos botones están muy próximos entre sí y ocupan poco espacio horizontal, lo que hace fácil tocar el que no era; y si se toca "No" (o se falla el click), la fila vuelve en silencio al estado anterior sin ningún mensaje — no hay forma de distinguir "cancelé la acción a propósito" de "mi click no funcionó", así que un miembro de staff apurado podría reintentar sin saber si su primer intento realmente se descartó. Recomendación: separar más los botones "Sí"/"No" (o usar un mini-modal en vez de inline) y mostrar un toast breve tipo "No se marcó como ausente" cuando se toca "No".

**[Alta] La tabla de Agenda del Día puede reordenarse mientras el staff va a hacer click, haciendo que la acción caiga sobre la fila equivocada.** Me pasó directamente: fui a tocar "Llamar" en la fila de un cliente mío, pero entre que miré la pantalla y until que el click se ejecutó, otro proceso agregó una fila nueva más arriba y todo se corrió — terminé llamando a la cita de otra persona. Es el mismo patrón de fondo que el de la grilla de horarios en `/agenda`: una lista que se reordena en tiempo real por escrituras concurrentes, sin ningún mecanismo (fila fija, transición animada, confirmación) que proteja el click del usuario. En un mostrador real, con un solo empleado operando y sin otro proceso escribiendo al mismo tiempo, el riesgo es menor — pero en cuanto haya más de un miembro de staff trabajando la misma agenda simultáneamente (el caso de uso más probable de esta pantalla), el riesgo de llamar/atender/marcar no-show al turno equivocado es real y con consecuencias de cara al cliente.

**Sobre el hallazgo de "sin terminales activas" — persiste parcialmente.** Repetí la comprobación con `terminal-farmacia` confirmado "En línea" y atendiendo un ticket en vivo: la pantalla de staff "Seleccionar Terminal" (`/terminal`) **ya no reproduce** el bloqueo — ahora lista correctamente las 3 terminales con su indicador verde. Pero la pantalla pública **`/display` sigue mostrando "Sin terminales activas"**, de forma persistente y reproducible, incluso después de recargar la página y esperar más de 10 segundos con el indicador "En tiempo real" en verde. Es decir: el problema no era genérico a "toda pantalla que lista terminales" como sugería la primera pasada — ya se resolvió del lado del staff, pero sigue intacto del lado de la pantalla pública de sala de espera, que es justamente la que ve el público general. Sigue siendo **[Alta]**: la sala de espera no tiene ninguna pantalla informativa funcionando aunque haya un puesto activo atendiendo.

**[Positivo, sin severidad] `/agenda/pantalla` reacciona correctamente en tiempo real.** La miré en paralelo mientras llamaba una cita desde Agenda del Día: la tarjeta correspondiente aparece con su horario y, al volver a llamar la misma cita, se le agrega un badge "Rellamado 1x" — buen detalle de feedback para quien espera en sala. A diferencia de `/display`, esta pantalla pública del módulo Agenda sí funcionó sin problemas en todas mis pruebas.

### Resumen de esta pasada

- El bloqueo duro de `/agenda` no se repite, pero la pantalla no distingue carga de vacío real — mismo síntoma visible, causa distinta, y sigue siendo alta fricción para un cliente real.
- Encontré un problema nuevo y más serio que lo que se pudo ver en la primera pasada: tanto la grilla de horarios del cliente como la tabla de Agenda del Día del staff pueden reordenarse en el momento del click y hacer que la acción recaiga sobre el turno equivocado. Esto amerita atención de ingeniería antes que la mayoría de los quick wins de la primera pasada.
- "Cancelar cita" (cliente) no tiene ninguna confirmación; "No presentado" (staff) sí la tiene pero con problemas de usabilidad en el propio diálogo. Vale la pena parejar el nivel de protección entre ambos lados.
- "Reprogramar" funciona a nivel de datos (cancela + crea) pero no comunica nada de eso al usuario ni conserva contexto.
- `/display` sigue sin reflejar terminales activos; `/terminal` (staff) y `/agenda/pantalla` (Agenda) ya funcionan bien.

---

*— Reviewer B (segunda pasada)*
