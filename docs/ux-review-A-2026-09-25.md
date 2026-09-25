# Revisión de UX — Turnero Digital (Reviewer A)

Fecha: 2026-09-25
Alcance: revisión de usabilidad/comodidad de uso de los dos módulos (walk-in y Agenda), para las cuatro audiencias (cliente walk-in, staff walk-in, cliente Agenda, staff Agenda) y las dos pantallas públicas. No es una auditoría funcional ni de bugs de negocio.

**Nota metodológica importante**: durante la sesión de prueba, el endpoint de "Servicios agendables" en `/agenda` devolvió permanentemente "No hay servicios disponibles para agendar" pese a que en `/admin > Turnos con Cita` había 2 servicios activos y correctamente configurados. Esto me impidió completar de punta a punta el flujo de reserva de cita como cliente y, en consecuencia, no había ninguna cita cargada en el sistema para poder operarla desde `/agenda-del-dia` como staff. De forma similar, hacia el final de la sesión el listado de colas del Totem (`/`) y el listado de terminales (`/terminal`) también empezaron a devolver "no hay X disponible/configurada" pese a que en Admin las colas y terminales existían y estaban activas. No evalúo la causa (es un tema funcional, fuera de mi alcance), pero sí evalúo el síntoma tal como lo viviría un usuario real: son pantallas sin ninguna acción posible, y ese síntoma aparece varias veces a lo largo del producto, así que lo trato como un hallazgo de UX transversal (ver más abajo).

**Actualización (segunda pasada, mismo día)**: en una segunda sesión pude reproducir el flujo completo de reserva/gestión de cita y de operación de staff en Agenda. El bloqueo de `/agenda` resultó ser intermitente, no permanente — ver la sección **"Actualización — flujos completados en segunda pasada"** al final del documento para el detalle, la causa observada (no confirmada) y los hallazgos nuevos que surgieron al completar los flujos pendientes.

---

## Resumen ejecutivo

La primera impresión de Turnero Digital es la de un producto prolijo: tipografía serif con carácter propio, paleta cálida y consistente, tarjetas centradas con buena jerarquía tipográfica, y una barra de navegación de staff que unifica ambos módulos bajo un mismo techo. Para alguien que solo mira capturas, se ve terminado y cuidado. El problema aparece en el detalle de la interacción: varias pantallas clave fallan exactamente en el momento en que el usuario más necesita información (el número de turno, la disponibilidad de un servicio, la cola para atender), y ahí la experiencia se vuelve frágil.

La mayor fortaleza del sistema son sus pantallas públicas (`/display` y `/agenda/pantalla`): fondo oscuro, números enormes en alto contraste, misma estructura visual en ambos módulos. Son legibles a la distancia y generan confianza ("En tiempo real" + reloj). También hay un excelente patrón de mensaje de error ("No encontramos esa cita" / "No encontramos ese turno") que debería ser el estándar de todo el producto, pero hoy convive con el opuesto: pantallas que se quedan en un callejón sin salida sin explicar nada ni ofrecer una acción.

La mayor fricción es doble. Primero, el ticket que un cliente saca en el Totem —el dato más importante de todo el flujo walk-in— se muestra en una tarjeta que aparece semitransparente y desaparece en uno o dos segundos, sin ningún respaldo en papel. Segundo, tres pantallas distintas (colas del Totem, terminales de staff, servicios de Agenda) comparten el mismo patrón de falla: un mensaje seco de "no hay nada" que es indistinguible de "todavía no configuraste nada", sin botón de reintentar y sin ninguna guía de qué hacer. Cuando eso ocurre en el Totem o en `/agenda`, el cliente literalmente no tiene nada para hacer.

---

## Hallazgos por audiencia y módulo

### Cliente walk-in (Totem `/`, `Mi Turno` `/mi-turno`)

**[Alta] La tarjeta de confirmación del ticket es casi invisible y dura demasiado poco.**
Después de confirmar el turno en el Totem, aparece una tarjeta "TU TURNO / [número] / [cola] / Ticket listo" con una animación de aparición (fade-in) que, en la captura tomada inmediatamente después del click, se ve en un gris rosado casi indistinguible del fondo. Aproximadamente 1-2 segundos después, la pantalla ya volvió sola al formulario inicial "Ingresá tu número de socio". En un kiosko compartido, sin impresora física, ese instante es la única oportunidad que tiene el cliente de registrar su número. Si mira para otro lado, si está sacando el turno para otra persona, o si el fade-in todavía no terminó de aparecer, se queda sin saber su número y tiene que confiar en `/mi-turno` (que requiere recordar volver a ingresar el número de socio desde su celular).

**[Alta, transversal] "No hay colas disponibles" es indistinguible de una falla temporal.**
Cuando el listado de colas no carga, el Totem muestra el mismo tono neutro que usaría si de verdad no hubiese colas configuradas. No hay botón de reintentar, no hay mensaje que sugiera "probá de nuevo" o "avisale a un empleado". Para un cliente parado frente al kiosko, es un cartel de "no se puede" sin ninguna salida.

**[Media] El placeholder "Ej: 4213" se confunde con un valor cargado.** Se renderiza en el mismo tipo grande y en negrita que usaría un número real ingresado, con el mismo peso visual. A primera vista, sobre todo para alguien que no está mirando con atención, puede parecer que el campo ya tiene un valor.

**[Media] Las colas "Prioritaria" no explican el criterio de elegibilidad.** El listado muestra 6 colas, 3 de ellas con badge "Prioritaria" (Farmacia, PAMI, Perfumería), sin ningún texto que aclare quién puede usarlas (edad, discapacidad, embarazo, etc.). El cliente debe adivinar si le corresponde o no; nada en la pantalla lo ayuda a decidir bien, y elegir mal (por exceso o por defecto) genera fricción después con el staff.

**[Media] `/mi-turno` reutiliza literalmente el wizard de "Sacar turno" del Totem**, con el mismo título "Sacar turno" y el mismo paso de selección de cola, en lugar de una experiencia distinta de "ver mi turno actual". Un cliente que ya tiene un ticket y entra a `/mi-turno` para hacerle seguimiento no ve de entrada ningún indicio de que el sistema reconoce su turno existente: tiene que volver a elegir la misma cola en la que ya está anotado, y recién ahí el sistema resuelve (correctamente, por detrás) que es el mismo turno y lo redirige a la pantalla de seguimiento. La sensación durante ese paso es la de estar por sacar un segundo ticket, no la de estar consultando el que ya tiene.

**[Positivo] Una vez resuelto, el card de seguimiento en `/mi-turno` es claro**: estado "Esperando", posición en la fila, hora, y el aviso "Guardá este enlace para volver a ver tu turno" — un buen detalle de continuidad. El botón "Cancelar turno" está visible y accesible.

**[Positivo] El estado de "turno no encontrado"** (`/mi-turno/:id` con un id vencido o inexistente) es un ejemplo de buen mensaje: "No encontramos ese turno" + "El enlace puede estar vencido, o el turno ya no existe." + CTA único "Sacar un turno nuevo".

---

### Staff walk-in (`/terminal`)

**[Alta] El selector de terminal miente sobre el estado real del sistema.** `/terminal` mostró "No hay terminales configuradas" durante gran parte de la sesión, mientras que `/admin > Terminales` listaba 3 terminales (Farmacia, PAMI, Perfumería) en estado "available". El mensaje sugiere fuertemente que falta configuración administrativa —lo que llevaría a un empleado a perder tiempo yendo a buscar a un admin— cuando en realidad las terminales existían y eran accesibles directamente por URL (`/terminal/terminal-pami`). Es el peor tipo de mensaje de error: técnicamente "no encontré nada" pero semánticamente "andá a arreglar la configuración", y ninguna de las dos cosas ayuda al empleado a entender qué pasa de verdad. *(Actualización: en la segunda pasada confirmé que este mismo listado a veces sí carga tras 15-40 segundos — ver nota al final. No cambia la severidad: el problema de fondo, un estado que se ve idéntico a "no hay nada" cuando en realidad es "todavía estoy cargando", sigue intacto.)*

**[Alta] Los botones de acción no reflejan su estado real y no dan feedback al hacer click.** En la pantalla de operación de una terminal (`/terminal/terminal-pami`), con "Cola de espera: 0" y "Sin turno asignado", los botones "Llamar siguiente", "Finalizar" y "No presentó" se ven con el mismo color sólido y peso visual que tendrían si sí hubiera algo para hacer (salmón, verde y texto rojo respectivamente), mientras que "Iniciar atención" y "Re-llamar" sí aparecen correctamente atenuados. Al hacer click en "Llamar siguiente" sin turnos en cola no pasa absolutamente nada visible: ni un toast, ni un mensaje, ni un cambio de estado. Un cajero no tiene manera de saber si el sistema no respondió, si el click no se registró, o si simplemente no hay nada para llamar.

**[Baja] Errores de acentuación en las etiquetas de botones de staff**: "Iniciar atencion" y "No presento" (faltan los acentos de "atención" y "presentó"). Menor, pero llamativo en una pantalla profesional pensada para uso diario.

**[Positivo] El layout de la terminal en sí está bien resuelto**: identidad + estado en línea + pausa a la izquierda, tarjeta central grande para el turno actual, panel de "Cola de espera" en tiempo real a la derecha. Es una distribución razonable para un mostrador con ritmo rápido. La opción "Abrir ventana flotante" (para un segundo monitor orientado al público, presumiblemente) es un detalle pensado para el uso real de un puesto de atención.

---

### Cliente Agenda (`/agenda`, `/agenda/:id`)

**[Alta → Media, ver actualización] La reserva de turno fue, en el momento de la primera pasada, un callejón sin salida.** `/agenda` mostró "No hay servicios disponibles para agendar" en todo momento durante la revisión inicial, sin un solo elemento interactivo en la página (lo confirmé también inspeccionando la estructura de la página: cero controles). Esto contradecía lo que mostraba `/admin > Turnos con Cita`, donde los servicios figuraban activos con disponibilidad diaria. En una segunda pasada (ver sección final) logré reservar, cancelar y reprogramar citas con normalidad, así que bajo la severidad de "bloqueo total" a "espera silenciosa sin feedback": el problema real no es que la reserva esté rota, es que la pantalla no distingue "cargando" de "vacío" y puede tardar 15-40 segundos en mostrar datos reales, sin ningún indicador de carga ni botón de reintentar. Para un cliente real eso sigue siendo, en la práctica, un callejón sin salida durante esa ventana: no tiene forma de saber si debe esperar o irse.

**[Positivo, y el mejor ejemplo del producto] El estado de "cita no encontrada" en `/agenda/:codigo` es excelente.** Al ingresar un código inválido + número de socio, la pantalla responde con "No encontramos esa cita" / "Revisá el código y tu número de socio." / un único botón de acción "Agendar un turno nuevo". Mensaje claro, causa probable explicada en términos simples, y un camino de salida concreto. Es el mismo patrón que el "turno no encontrado" del walk-in — muy buena consistencia interna en este punto puntual.

**[Media, consecuencia directa del punto anterior] Ese excelente botón de recuperación ("Agendar un turno nuevo") hoy lleva al callejón sin salida de `/agenda`.** El mejor mensaje de error del producto pierde su valor porque su única acción posible está rota.

---

### Staff Agenda (`/agenda-del-dia`)

**[Positivo] La pantalla de trabajo diario está bien planteada**: navegador de fecha con flechas y atajo "Hoy", filtro de servicio, chips de resumen (Total / Pendientes / Atendidos / No-show) y una tabla simple (Hora, Nombre, Socio, Servicio, Estado, Acciones). Es información compacta y accionable de un vistazo, buen candidato a pantalla de uso diario para el staff.

**[Resuelto en segunda pasada] Se pudo ejercitar el ciclo completo llamar/re-llamar/atender/finalizar y la doble confirmación de "no-show".** En la primera pasada no había ninguna cita cargada para ningún día del sistema, así que no pude operar nada del lado del staff. En la segunda pasada sí pude completarlo — ver el detalle y los hallazgos nuevos en la sección final del documento. Adelanto el más importante: la confirmación de "no-show" existe y está bien resuelta, y contrasta positivamente con la falta total de confirmación al cancelar una cita del lado del cliente.

---

### Pantallas públicas (`/display`, `/agenda/pantalla`)

**[Positivo] Muy buena legibilidad a distancia y fuerte consistencia entre los dos módulos.** Ambas pantallas comparten la misma estructura: encabezado oscuro con punto de "en vivo" + título + reloj grande, tarjetas con nombre de cola/servicio en versalita y un número (o franja horaria) enorme en naranja de alto contraste sobre fondo oscuro para el estado "ahora atendiendo"/próximo llamado, y un pie "En tiempo real" que ayuda a confiar en que la pantalla no está congelada. Alguien que entendió `/display` entiende `/agenda/pantalla` sin ningún reaprendizaje.

**[Baja] El estado "esperando" sin nadie llamado todavía en `/display` no tiene texto de apoyo**, solo una raya horizontal en el lugar del número. Frente a la claridad total del estado "ahora atendiendo", esta ambigüedad es menor pero llamativa por contraste.

**[Media] Ninguna de las dos pantallas públicas tiene un aviso visual o sonoro cuando aparece un llamado nuevo.** En `/agenda/pantalla`, además, el llamado se identifica solo por Servicio + horario (correcto por privacidad, según lo pedido), lo cual obliga a la persona a estar mirando la pantalla en el momento exacto y a recordar su propio horario de memoria. A diferencia del walk-in —que tiene `/mi-turno` como respaldo en el celular del cliente—, Agenda no ofrece ningún respaldo equivalente si la persona se distrae y se pierde su llamado en la pantalla.

---

## Comparación entre los dos módulos

Hay una base de consistencia visual real: tipografía, paleta, tarjetas centradas con ícono superior, y sobre todo la barra de navegación de staff que expone los ocho destinos (Totem, Mi Turno, Pantalla Pública, Agendar Turno, Pantalla Agenda, Agenda del Día, Terminal, Admin) en un único menú. Un empleado que aprendió a operar el walk-in encuentra el módulo de Agenda a un click de distancia y con las mismas convenciones visuales (misma tipografía de tabla, mismos botones, mismo estilo de card).

Para el cliente, en cambio, la consistencia es más despareja. El patrón de "código no encontrado" (turno o cita) es idéntico en tono y estructura entre ambos módulos, lo cual está muy bien. Pero el patrón de "no hay nada disponible" (colas, terminales, servicios) también se repite igual en ambos módulos — solo que en este caso repetir es malo, porque el patrón en sí es pobre. Un usuario que ya vivió la frustración de "No hay colas disponibles" en el Totem no gana nada la primera vez que ve "No hay servicios disponibles para agendar" en Agenda: no aprende nada porque ambas pantallas no le enseñan a hacer nada distinto la próxima vez.

Conceptualmente, un cliente que ya usó el Totem tiene que reaprender una distinción importante: el walk-in es "ahora, por orden de llegada" y Agenda es "un día y horario futuro concretos". Los nombres en la navegación ("Totem" vs. "Agendar Turno") comunican bastante bien esa diferencia, pero ninguna de las dos pantallas de cliente linkea a la otra ni aclara "si buscás algo distinto, es este otro sistema" — alguien que llega a `/agenda` esperando sacar un número para hoy, o viceversa, no tiene ninguna señal en pantalla de que existe una alternativa.

---

## Quick wins (cambio chico, impacto alto)

- Sacar el fade-in de la tarjeta de "Ticket listo" del Totem (o acortarlo a algo casi instantáneo) y mantenerla en pantalla más tiempo (5-8 segundos) o hasta que el cliente la cierre con un botón "Listo".
- Revisar el copy de los tres mensajes de "no hay nada" (colas, terminales, servicios) para que expliquen mejor la situación y ofrezcan un botón de reintentar, en vez del texto seco actual.
- Igualar el estado visual "deshabilitado" de "Llamar siguiente", "Finalizar" y "No presentó" en la Terminal al de "Iniciar atención"/"Re-llamar" cuando no hay nada para hacer, y agregar un toast/mensaje al hacer click sin efecto.
- Corregir acentos en "Iniciar atencion" y "No presento".
- Agregar un texto breve o tooltip explicando qué significa "Prioritaria" y quién puede usarla.
- Aclarar visualmente el placeholder "Ej: 4213" (más liviano/gris) para que no se confunda con un valor cargado.
- Agregar un texto de apoyo al estado "esperando" sin número en `/display` (ej. "esperando el primer llamado").

## Cambios más grandes (a planificar)

- Diferenciar de verdad `/mi-turno` del wizard de "Sacar turno" del Totem: preguntar primero "¿ya tenés un turno?" o detectarlo automáticamente (cookie/enlace guardado), en vez de repetir el mismo flujo de alta.
- Adoptar el patrón "No encontramos X" + causa + CTA único (ya usado en `/mi-turno/:id` y `/agenda/:id`) como estándar para **todos** los estados vacíos/de error del producto, incluyendo colas, terminales y servicios.
- Sumar una señal de atención (destello, sonido) en las pantallas públicas cuando aparece un llamado nuevo, sobre todo en `/agenda/pantalla` donde no hay ningún respaldo personal como `/mi-turno`.
- Dar alguna señal cruzada entre Totem y Agenda para que un cliente que llegó al sistema equivocado (quiere algo "ahora" y está en Agenda, o quiere un día futuro y está en el Totem) se dé cuenta sin tener que preguntarle a alguien.

---

## Actualización — flujos completados en segunda pasada

Se agregó un servicio nuevo y bien configurado ("Trámite general", 15 min, capacidad 3, 08:00-20:00 todos los días incluido hoy) y se me pidió confirmar si `/agenda` ya mostraba opciones, y completar los flujos que habían quedado bloqueados: reservar, cancelar y reprogramar una cita como cliente, y operar el ciclo completo de staff (incluida la doble confirmación de no-show) en `/agenda-del-dia`. Esta sección documenta lo que encontré. Seguí usando la misma sesión de navegador; en paralelo había otros dos procesos operando el mismo entorno, así que algunos hallazgos de esta sección están marcados como observados en un entorno compartido bajo carga.

### Sobre el bloqueo original: causa observada

`/agenda` **sí** mostró las 4 opciones de servicio (incluyendo "Trámite general") una vez que logré que la página cargara. Pero "lograr que cargara" no fue inmediato ni consistente: en repetidos intentos, una navegación fresca a `/agenda` (o a `/agenda-del-dia`, o a `/terminal`) se quedaba mostrando "No hay X disponible" durante-15 a 40 segundos, y solo después mostraba los datos reales. Revisando la consola del navegador encontré, de forma reproducible en cada carga, este mensaje:

> `@firebase/firestore: Firestore (12.11.0): Could not reach Cloud Firestore backend. Backend didn't respond within 10 seconds. [...] The client will operate in offline mode until it is able to successfully connect to the backend.`

Esto apunta a que, bajo la carga concurrente del entorno de prueba (varios procesos usando el mismo emulador local al mismo tiempo), la conexión en tiempo real a la base de datos tarda en establecerse, y mientras tanto la app no tiene ningún estado de "conectando" — muestra directamente el mismo texto que usaría si la colección estuviera genuinamente vacía. No es una conclusión definitiva sobre la causa (puede ser una particularidad de este entorno de prueba compartido y no algo que ocurra en producción con carga normal), pero si algo similar puede pasar con tráfico real concurrente, es un hallazgo serio: la severidad no baja por ser "intermitente", en todo caso sube, porque un mensaje de error que aparece y desaparece sin patrón es mucho más difícil de diagnosticar para soporte que uno que falla siempre igual.

**[Alta] Ningún estado de carga distingue "conectando" de "vacío".** En las tres pantallas afectadas (Totem, Terminal, Agenda) el usuario ve el mismo texto terminal ("no hay X") tanto si de verdad no hay datos como si la app todavía está intentando conectarse. No hay spinner, no hay skeleton, no hay "cargando…", no hay reintento automático visible ni manual. Esto aplica tanto a clientes (quedan sin poder sacar turno/reservar) como a staff (quedan sin poder ver terminales o citas del día), y es la causa raíz que explica los tres hallazgos "Alta" de bloqueo total de la primera pasada.

### Cliente Agenda — reservar, cancelar, reprogramar (completado)

Una vez cargado, el flujo de reserva es sencillo y se completa en una sola pantalla larga (no hay pasos separados): elegir Servicio (chips), elegir Día (chips horizontales, uno por día dentro del horizonte configurado), elegir Horario (grilla densa, un botón por franja de 15 min), completar Nombre y Número de socio (Contacto queda como opcional), y confirmar. Al confirmar, se pasa directamente a la pantalla de gestión de la cita ("TU CITA", con Cancelar/Reprogramar) — un paso menos de lo esperado, lo cual es una buena decisión de diseño.

**[Media] El servicio seleccionado por defecto es, por orden alfabético/de creación, el que no tiene disponibilidad.** Al entrar a `/agenda` con varios servicios cargados, el chip preseleccionado fue "Sin disponibilidad" (un servicio de prueba sin franjas cargadas), mostrando de entrada "No hay horarios disponibles próximamente" — la primera impresión real de un cliente que sí puede reservar es un mensaje de que no puede. Correguible fácil: preseleccionar el primer servicio que tenga franjas.

**[Baja] El día por defecto no siempre es "hoy".** En una de las cargas, con el servicio "Trámite general" ya seleccionado, el día preseleccionado fue el sábado siguiente en vez de hoy viernes, pese a que hoy también tenía franjas libres. Un cliente que busca el turno más próximo tiene que notar y corregir esto manualmente.

**[Alta] "Cancelar cita" no pide ninguna confirmación.** Un solo click sobre "Cancelar cita" en `/agenda/:id` cambia el estado a "Cancelada" al instante, sin ningún diálogo de "¿estás seguro?", sin deshacer. Es una acción irreversible en una página que no requiere login (solo el código de la URL + número de socio) — un toque accidental, un doble click, o un clic mal apuntado en un celular basta para perder la cita sin aviso. Esto contrasta directamente con "No presentado" del lado del staff (ver más abajo), que sí tiene doble confirmación pese a ser, en teoría, una acción menos grave para el cliente que perder su propia cita.

**[Positivo] "Reprogramar" funciona bien y sin fricción innecesaria.** Lleva a una pantalla dedicada ("Reprogramar cita", con la fecha/hora actual como referencia), se elige un nuevo día/horario y se confirma; no pide doble confirmación, lo cual es correcto porque no es una acción destructiva (se puede reprogramar de nuevo).

### Staff Agenda — ciclo completo y no-show (completado)

Pude ejecutar el ciclo Llamar → Re-llamar → Atender → Finalizar sobre una cita, y por separado, Llamar → No presentado sobre otra.

**[Positivo] Cada acción de staff da feedback inmediato con un toast** ("Re-llamado", "Marcada como no presentado", etc.) y el estado de la fila se actualiza al toque (incluso mostrando "Llamada (x2)" cuando se re-llama, lo cual es un lindo detalle de trazabilidad). Esto es exactamente lo que le falta al Terminal del walk-in (ver hallazgo de esa sección) — es la misma casa, dos estándares distintos para la misma clase de acción.

**[Positivo, y responde directamente a lo que se pidió verificar] "No presentado" sí tiene doble confirmación**, e implementada de una forma liviana y buena: al hacer click aparece, en el lugar de los botones de esa misma fila, un "¿Seguro?" con "Sí" / "No" (no es un modal que tapa la pantalla, es un cambio in-line), y al confirmar aparece el toast "Marcada como no presentado". Es el mejor patrón de confirmación de todo el producto — mejor incluso que un modal genérico, porque no saca al staff del contexto de la fila en la que estaba trabajando. Debería ser el molde para "Cancelar cita" del lado del cliente (hallazgo de arriba) y para cualquier otra acción irreversible que se agregue a futuro.

**[Media] La tabla de "Agenda del Día" se reordena en vivo mientras se trabaja, con riesgo real de clic equivocado.** Al ser una tabla en tiempo real, cuando el estado de una fila cambia (la mía o la de otra persona/proceso) las filas de abajo se corren porque el bloque de botones de acción cambia de alto según el estado. En esta sesión me pasó en carne propia: hice click en las coordenadas donde un segundo antes estaba el botón "Llamar" de una cita, y por el reacomodo de la tabla terminé llamando a otra cita distinta. En un mostrador real, con un cajero mirando la pantalla y no las coordenadas de pixel, el riesgo es menor que en mi caso (interactúo por coordenadas), pero igual existe: una fila que cambia de alto justo cuando el cursor ya está en camino puede hacer que el click caiga en la acción de la fila vecina. Conviene evaluar altura fija por fila o animar el reacomodo en vez de saltar de golpe.

**[Baja] La pantalla pública de Agenda puede acumular llamados "viejos" sin límite.** Mientras probaba, `/agenda/pantalla` mostró simultáneamente 5 tarjetas de "Llamada", incluyendo dos con horario "10:00" que, a esa altura del día (13:37), llevaban horas sin pasar a "Atendida". A diferencia de `/display` del walk-in —que tiene un número acotado de tarjetas, una por cola fija—, acá cada cita llamada agrega una tarjeta nueva y no hay evidencia de que se retiren solas si el staff tarda en marcarlas como atendidas. En un día ocupado con muchas citas y un staff que se atrasa, el tablero podría llenarse de tarjetas de horarios ya pasados, con el consiguiente ruido visual para quien espera. Compensa parcialmente lo bueno: confirmé que la reacción es rápida (la tarjeta nueva apareció en `/agenda/pantalla` unos 2 segundos después de tocar "Llamar" en `/agenda-del-dia`, sin necesidad de refrescar), así que el problema es de "limpieza" del tablero, no de tiempo de reacción.

### Ajustes al resumen ejecutivo y a los quick wins

- El hallazgo de mayor severidad de todo el documento pasa a ser el de **"no hay estado de carga"** (arriba): explica y unifica los tres bloqueos "Alta" de la primera pasada, y es más difícil de detectar en QA manual porque es intermitente.
- Sumo un quick win: **agregar un estado de "cargando…" (spinner o skeleton) a las pantallas de Colas, Terminales y Servicios agendables**, distinto del estado de "vacío real", antes de mostrar cualquier variante de "no hay X".
- Sumo un quick win: **agregar una confirmación a "Cancelar cita"** del lado del cliente, reutilizando el mismo patrón in-line de "¿Seguro? Sí/No" que ya existe en "No presentado" del lado del staff — el patrón ya está construido, solo falta aplicarlo del otro lado.
- Sumo un cambio más grande: **revisar el reordenamiento en vivo de la tabla de Agenda del Día** para evitar el riesgo de clic equivocado en el botón de la fila vecina, y **poner un límite/expiración a las tarjetas de "Llamada" en `/agenda/pantalla`** para que no se acumulen indefinidamente.

---

Reviewer A
