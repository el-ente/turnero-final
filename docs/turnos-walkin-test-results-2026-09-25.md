# Resultados — Ejecución de casos de prueba, flujo Walk-in

**Fecha**: 2026-09-25. Dos pasadas: (1) madrugada, ejecución autónoma sin usuario presente, sin navegador disponible; (2) misma mañana, con la extensión de Chrome ya conectada, pase visual sobre los casos que habían quedado bloqueados.
**Base**: `docs/turnos-walkin-test-cases-2026-09-25.md` (64 casos).
**Entorno**: emuladores Firebase locales (`./dev.sh`), proyecto `turnero-1212-dev`, datos seedeados.

## Método (dos pasadas)

**Pasada 1 (sin navegador)**: la extensión de Chrome no estaba conectada — mismo bloqueo que ya había encontrado el otro orquestador para el módulo de Agenda, no resoluble de forma autónoma (requiere login humano en la extensión). Ejecuté los casos verificables contra la lógica de negocio real (Functions + Firestore, mismos emuladores que usaría la UI) llamando los endpoints HTTP directamente y verificando el estado resultante en Firestore. Cubre reglas de negocio, permisos, transacciones y estados — no cubre renderizado, temporizadores, animaciones ni sonido.

**Pasada 2 (con navegador, `mcp__claude-in-chrome`)**: una vez conectada la extensión, recorrí Totem, Mi Turno, Terminal (logueado como cajero vía el emulador de Auth) y Public Display en pestañas reales, con capturas de pantalla como evidencia en cada paso. Cubrió prácticamente todo lo que había quedado "Bloqueado (UI)" en la pasada 1. Únicos puntos no verificados: el audio del chime (no hay forma de "escuchar" desde acá) y la ventana Document PiP (feature de navegador de disponibilidad variable, no crítica).

## Bugs encontrados y corregidos en el camino (bloqueaban poder testear)

1. **`app/.env.local` apuntaba a `turnero-1212-prod`** en vez de `turnero-1212-dev` (mientras `authDomain`/`storageBucket` sí decían "dev" — inconsistencia interna). Con eso, la app y las Functions emuladas hablan de proyectos Firestore distintos entre sí: nada calza. Corregido (archivo local, gitignored, no afecta a nadie más).
2. **`functions/package.json` → `seed:emulator` tenía hardcodeado `FIREBASE_PROJECT_ID=turnero-60150`** (el proyecto "legacy"), no `turnero-1212-dev` como usa el resto del stack local. Los datos de prueba se sembraban en un namespace del emulador que la app nunca lee — Totem/Terminal arrancan siempre vacíos en un checkout nuevo. **Corregido** (`functions/package.json:12`) y re-seedeado correctamente.
3. **Bug real de producción**: `bootstrapUser` (`functions/src/services/userService.ts`) escribía `displayName: undefined` en Firestore cuando la cuenta de Google no tiene nombre de perfil — el Admin SDK rechaza `undefined` y tira 500, bloqueando el login por completo para esa cuenta. **Corregido**: default a `""` (mismo patrón que ya usa `adminService.ts` para otros campos opcionales, `userService.ts:40-52` y 3 sitios más). Mismo tipo de bug que el otro orquestador ya había corregido para el módulo de Agenda. `pnpm -F functions test` sigue en 213/213, `build`/`lint` limpios (solo warnings `max-len` preexistentes).

Los tres cambios están sin commitear — quedan para que los revises antes de decidir si los sumás.

## Resumen de resultados

**61 de 64 casos** verificados (43 a nivel API/Firestore en la pasada 1, el resto visualmente en la pasada 2), más los 5 hallazgos del analista. Todos con el resultado esperado según el código — incluyendo los casos donde "el resultado esperado" es la confirmación de un bug ya identificado. Sin discrepancias entre lo que predecía el código y lo que se vio en pantalla.

| Sección | Verificado (API, pasada 1) | Verificado visualmente (navegador, pasada 2) | Sin verificar |
|---|---|---|---|
| A. Totem | TOT-01, 02, 12, 13, 14 | TOT-01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11 | — |
| B. Mi Turno | MT-01, 04, 05, recuperación por `getCurrentTurn` | MT-01, 02, 03, 05, 06, 07, 08 | MT-09 (nota de diseño, no un caso ejecutable) |
| C.1 Permisos Terminal | TERM-01 a 04 | TERM-01 (visual) | — |
| C.2 Ciclo de atención | TERM-05, 06, 07, 08, 09, 11, 14, 15, 16, 17, 18 | TERM-10, 11, 12, 13 | — |
| C.3 Pausar/reasignar | TERM-19 a 24 | TERM-19...24 (parcial, ver abajo), 21 (visual, confirma bug) | TERM-25 (ventana PiP, no crítico) |
| D. Public Display | — | DISP-01, 03, 04, 06 | DISP-02 (el disparador está confirmado por código+datos, pero no logré capturar el frame exacto del pulso de 3s — ver nota), audio del chime (no puedo "escuchar") |
| E. Seguridad | SEC-01, 02, 03 | — | — |
| F. Stats | STAT-01, 02 | — | — |
| G. Hallazgos del análisis | FIND-01, 02, 03, 05 (runtime) · FIND-04 (código) | FIND-03 (severidad, confirmado por código+API, no re-verificado en UI) | — |

## Hallazgos confirmados en vivo (reproducidos contra el emulador real)

- **TW-FIND-01** — Cancelar el turno de otro socio leyendo su `memberNumber` real desde la colección pública `turns`: reproducido, `cancelTurn` acepta y cancela.
- **TW-FIND-02** — Re-llamar 2 veces (cupo `maxAttempts=2`) antes de marcar no-show: el no-show subsiguiente cancela en vez de reencolar, aunque sea el primer no-show real del cliente. Reproducido exactamente como lo predijo el análisis.
- **TW-FIND-03** — Confirmado, y **más severo de lo estimado**: `finishTurn` con el `terminalId` de una terminal distinta a la que realmente tiene el turno no valida pertenencia. Al reproducirlo, la terminal dueña real del turno queda con `currentTurnId` apuntando a un turno ya `FINISHED`, y **no hay ningún endpoint que la pueda liberar** — `finishTurn` y `noShow` exigen `ATTENDING`/`CALLED` respectivamente, y el turno ya está `FINISHED`. La terminal queda inutilizable (cualquier `callTurn` futuro choca con 409 "already serving turn X") sin vía de recuperación desde la app — solo editando Firestore directamente. Subo la prioridad de este hallazgo de Media a **Alta**.
- **TW-FIND-05** — Confirmado: `noShowCount` en stats se mantiene en 0; los no-shows caen en `cancelledCount`.
- **TW-FIND-04** (`priorityWeight` no-op) — confirmado por lectura de código (`getNextTurnRatioBased` nunca lo referencia), no requiere runtime porque es una ausencia de comportamiento.

## Evidencia visual (pasada 2, navegador real)

Confirmado en pantalla, sin discrepancias con lo esperado:

- **Totem**: entrada de socio rechaza letras y trunca a 5 dígitos (TOT-03/05); botón deshabilitado con input vacío (TOT-04); "cambiar" vuelve a la pantalla de número (TOT-06); ticket se muestra y se auto-resetea (TOT-01/02/07 — el primer intento "se me escapó" el frame del ticket por la latencia de las llamadas a herramientas, capturado bien al repetirlo inmediatamente); auto-reset por inactividad a los 25s limpia el input (TOT-08, confirmado con espera real); "No hay colas disponibles" con las 6 colas desactivadas (TOT-10); con solo `queue-perfumeria-prioritaria` desactivada, esa cola no aparece en la lista mientras las otras 5 sí (TOT-11).
- **Mi Turno**: `/mi-turno/:id-inventado` muestra "No encontramos ese turno" (MT-06); turno recién creado muestra "Esperando" + "N personas por delante tuyo" (MT-02); al llamar el turno desde Terminal **en otra pestaña**, la tarjeta de Mi Turno pasa a "Llamado" / "Dirigite al mostrador" **sin recargar** y el botón "Cancelar turno" desaparece solo (MT-03, y confirma visualmente MT-05); al re-llamar aparece "Rellamado 1x" en vivo (MT-08); al finalizar pasa a "Finalizado" y aparece "Sacar otro turno" (MT-07).
- **Terminal** (logueado como cajero, cuenta creada ad-hoc en el emulador de Auth y activada vía API): `TerminalSelector` solo lista la terminal del sector asignado (TERM-01 visual); con la terminal libre, "Iniciar atención"/"Finalizar"/"Re-llamar"/"No presento" están deshabilitados y "Llamar siguiente" habilitado (TERM-10); tras llamar, se habilitan los que corresponden a estado `CALLED`; al apretar "No presento" aparece el diálogo "¿Seguro?" con "Sí, no presentó"/"Cancelar" (TERM-12); "Cancelar" cierra el diálogo sin tocar el turno (TERM-13); confirmar sí lo marca no presentado y lo reencola (visible en la cola de espera con badge "R1"); "Cambiar" (filas asignadas) se deshabilita con hint "Finalizá el turno actual antes de cambiar de fila" mientras hay turno en curso.
- **Bug TW-TERM-21 confirmado visualmente**: como cajero, tocar "Pausar" muestra el toast **"Requires one of roles: admin"** — el error crudo del backend, sin traducir, y el estado de la terminal no cambia. Coincide exactamente con lo predicho.
- **Public Display**: al llamar un turno desde Terminal (pestaña separada), la tarjeta correspondiente pasa de "ESPERANDO" a mostrar el número **en vivo**, sin recargar (DISP-01); al pausar una terminal desaparece su tarjeta y la grilla se reacomoda (DISP-03); con las 3 terminales pausadas, "Sin terminales activas" (DISP-04); nombre de sector visible bajo el nombre de cada terminal (DISP-06).
- **Nota sobre DISP-02** (parpadeo de 3s en re-llamado): confirmé que el re-llamado se propaga correctamente al Display (el contador "Reintentos" del lado Terminal sube, y el dato que dispara el flash — `lastRecallAt` — cambia), pero no logré capturar por screenshot el frame exacto dentro de la ventana de 3 segundos que dura la animación CSS — la latencia real entre llamadas a herramientas terminó siendo mayor a esos 3s en mis intentos. El mecanismo está confirmado por código y por los datos que lo disparan; el frame visual específico queda como el único ítem genuinamente no capturado (no por sospecha de bug, sino por límite de la técnica de captura).

## Nota de corrección propia

Mi primer intento de TW-TERM-06 (ratio-based) usó una expectativa incorrecta (esperaba 3 normal : 1 priority en 4 llamados consecutivos). Al trazar el algoritmo a mano, el ciclo real es de 3 llamados (2 normal + 1 priority) y arranca en "priority" cuando los contadores están en (0,0) — la secuencia observada `P,N,N,P` es exactamente la esperada. No es un bug: era mi assertion la que estaba mal planteada. Corregido en el registro de resultados antes de reportarlo acá.

## Estado del entorno al momento de escribir esto

- Stack local sigue corriendo (`./dev.sh` en background, log en `/tmp/turnero-dev.log`).
- Firestore reseedeado limpio (3 sectores, 6 colas, 3 terminales, 8 turnos) al cierre de cada pasada — ninguna terminal queda pausada ni "atascada" de las pruebas.
- Usuarios de prueba ya provisionados en el emulador de Auth para cuando quieras entrar manualmente (contraseña `Test1234!` para todos los de tipo password):
  - `admin@turnero.test` — admin
  - `cajero1@turnero.test` — cajero, sector Farmacia
  - `supervisor1@turnero.test` — supervisor
  - `cajero2@turnero.test` — cajero sin activar (status pending, para probar ese caso)
  - `cajero-ui@turnero.test` — cajero, sector Farmacia, creado vía el flujo real de "Continuar con Google" del emulador de Auth (no password) — usalo si querés repetir algo en Terminal sin recrear el login.
- App: http://localhost:5173 · Emulator UI: http://127.0.0.1:4000

## Pendiente

Solo quedan sin verificar: el audio del chime del Display (no hay forma de escucharlo de forma autónoma), el frame exacto de la animación de 3s en un re-llamado (mecanismo confirmado, frame no capturado), y la ventana Document PiP de Terminal (feature opcional del navegador, no crítica). Todo lo demás del documento de 64 casos quedó verificado, entre lógica de negocio (pasada 1) y UI real (pasada 2).
