# 🎫 Turnero Digital

Un sistema de gestión de turnos moderno construido con Firebase y React. Proporciona una solución completa para organizar colas en comercios, hospitales, administraciones públicas y más.

## 📋 Características

- **Gestión de Colas**: Soporte para múltiples colas con tipos normal y prioritario
- **Estrategias Inteligentes**: FIFO global o basado en ratios para balancear prioridades
- **Reencauzamiento**: Reintentos automáticos para clientes que no se presentan
- **Múltiples Interfaces**: Totem web, pantalla pública, terminal de operador, admin dashboard
- **Roles y Permisos**: Login con Google (admin/supervisor/cajero), cajero restringido a sus sectores asignados
- **Real-time**: Actualizaciones en tiempo real con Firestore listeners
- **Modular**: Arquitectura de servicios reutilizable y testeable

## 🏗️ Arquitectura

```
turnero-final/
├── shared/           # Tipos TypeScript compartidos
├── functions/        # Backend: Cloud Functions + servicios
├── app/              # Frontend: React + Vite
└── docs/             # Documentación
```

**Tech Stack:**
- Backend: Firebase Cloud Functions (Node.js 24), Firestore, TypeScript
- Frontend: React 19, Vite, React Router v7, Firebase SDK
- Testing: Jest, TypeScript strict mode

## 🚀 Setup

### Prerequisitos
- Node.js 24+
- pnpm 10+
- Firebase CLI (`npm i -g firebase-tools`)
- Google Cloud account con acceso a los proyectos `turnero-1212-dev`/`qa`/`prod`
- **Java Runtime (JRE)** — requerido por los emuladores de Firestore/Storage (ej. `brew install openjdk` en Mac)

### Instalación

```bash
git clone <repo>
cd turnero-final
pnpm install
firebase login
firebase use dev   # apunta el CLI local al proyecto turnero-1212-dev
```

### Entornos

Tres proyectos Firebase separados, mapeados por alias en `.firebaserc` y por branch en CI:

| Alias      | Proyecto            | Branch     | Deploy                         |
|------------|----------------------|------------|---------------------------------|
| `dev`      | `turnero-1212-dev`   | `develop`  | automático en push               |
| `qa`       | `turnero-1212-qa`    | `qa`       | automático en push               |
| `prod`     | `turnero-1212-prod`  | `main`     | automático, requiere aprobación manual en GitHub |
| `legacy`   | `turnero-60150`      | —          | proyecto original, sin uso activo |

Trabajo día a día: ramas de feature desde `develop`, PR a `develop`. `qa` y `main` se actualizan por merge/fast-forward cuando corresponde promover.

### Variables de Entorno

Crear `app/.env.local` (usar la config del proyecto **dev** para desarrollo local):

```
VITE_FIREBASE_PROJECT_ID=turnero-1212-dev
VITE_FIREBASE_API_KEY=<tu-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<tu-auth-domain>
VITE_FIREBASE_STORAGE_BUCKET=<tu-bucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<tu-sender-id>
VITE_FIREBASE_APP_ID=<tu-app-id>
```

Valores: `firebase apps:sdkconfig web <APP_ID> --project turnero-1212-dev`.

Para las Functions (no versionado, `functions/.env` o config del proyecto): `ADMIN_ALLOWLIST=persona@ejemplo.com,otra@ejemplo.com` — emails que se auto-provisionan como **admin** en su primer login con Google (bootstrap del primer usuario; después, ese admin invita al resto desde el panel Admin → Usuarios).

### Desarrollo

```bash
# Todo junto (emulators + functions watch + app dev)
./dev.sh

# O por separado:
firebase emulators:start                  # Terminal 1
pnpm -F functions build:watch             # Terminal 2
pnpm -F app dev                           # Terminal 3
```

Acceso:
- **App**: http://localhost:5173
- **Firestore Emulator UI**: http://localhost:4000
- **Functions**: http://localhost:5001

### Seed Data

```bash
pnpm -F functions seed:emulator
```

Crea datos de prueba: 3 sectores (Farmacia, Perfumería, PAMI), 6 colas (regular + prioritaria por sector), 3 terminales (uno por sector, ratio-based), 8 turnos.

## 🎨 Vistas Frontend

| Vista | URL | Propósito | Diseño | Acceso |
|-------|-----|-----------|--------|--------|
| **Totem** | `/` | Usuario final saca turno | Minimalista, colores vibrantes | Público |
| **Display** | `/display` | Pantalla pública de sala de espera | Brutal cyan/magenta, números ENORMES | Público |
| **Terminal** | `/terminal` | Operador atiende turnos | Industrial verde neon, panel de control | Login (admin/supervisor/cajero) |
| **Admin** | `/admin` | Administrador configura sistema | Dashboard moderno azul/púrpura | Login (admin) |

## 📡 API Endpoints

### Autenticación

Login con Google (Firebase Auth). Todo endpoint que no sea de Totem lleva `Authorization: Bearer <idToken>`; sin ese header, o con una cuenta todavía no activada por un admin, responde `401`. Sin el rol requerido, `403`.

| Rol | Puede |
|-----|-------|
| **admin** | Todo: CRUD de sectors/queues/terminals, gestión de usuarios, ver stats, operar cualquier terminal |
| **supervisor** | Ver stats, operar cualquier terminal (sin CRUD estructural ni gestión de usuarios) |
| **cajero** | Operar terminales solo en sus `assignedSectorIds` |

El filtro de sector es la respuesta a "no quiero que cualquier cajero pueda elegir cualquier terminal": se define por usuario (`assignedSectorIds`), no por terminal, así un cajero que atiende varios sectores no necesita más de un rol.

### Turn Management

Sin auth — Totem es un kiosco público y `cancelTurn` es autoservicio del cliente sobre su propio turno. Como no hay auth, `cancelTurn` exige `memberNumber` en el body y verifica que coincida con el `memberNumber` del turno (si no coincide, `403`) — así conocer/filtrarse un `turnId` (URL `/mi-turno/:turnId`, historial del navegador, etc.) no alcanza para cancelar el turno de otra persona.

El **número de ticket es el número de socio** (`memberNumber`, entero de 1 a 99999) que el cliente ingresa en el Totem — no es un contador secuencial diario. Es externo y no se valida contra ningún padrón; la app solo verifica el rango.

```bash
POST /createTurn
  { queueId, memberNumber, channel }
  → { id, memberNumber, status, queuedAt, ... }

GET /getCurrentTurn?memberNumber=12345
  → { id, memberNumber, status, ... }
```

`getCurrentTurn` es también el mecanismo de recuperación: un socio puede ingresar su número en cualquier Totem y recuperar su turno activo (waiting/called/attending), sin depender de `localStorage` del dispositivo.

```bash
POST /cancelTurn
  { turnId, memberNumber }
  → { success: true }
```

### Terminal Operations

Requiere login como admin/supervisor/cajero. Un cajero solo puede operar terminales en su(s) sector(es) asignado(s) — 403 si `terminalId` cae fuera de `assignedSectorIds`.

```bash
POST /nextTurn { terminalId }
POST /callTurn { terminalId, turnId }
POST /startTurn { terminalId, turnId }
POST /finishTurn { terminalId, turnId }
POST /noShow { terminalId, turnId }
POST /recallTurn { terminalId, turnId }
```

### Admin

CRUD de sectors/queues/terminals: solo admin. `getQueueStats`: admin o supervisor.

```bash
GET /getQueueStats?queueId=queue-1
  → { totalTodayCreated, waitingCount, finishedCount, avgWaitTimeSeconds }
```

CRUD completo para sectors, queues y terminals (`GET` lista, `POST` crea, `PUT ?<id>=...` actualiza, `DELETE ?<id>=...` elimina):

```bash
POST   /createSector    { name, description? }
GET    /listSectors
PUT    /updateSector?sectorId=sector-1     { name?, description? }
DELETE /deleteSector?sectorId=sector-1

POST   /createQueue     { sectorId, name, type, reenqueueConfig, priorityWeight?, servedBy, active }
GET    /listQueues
PUT    /updateQueue?queueId=queue-1        { name?, type?, reenqueueConfig?, priorityWeight? }
DELETE /deleteQueue?queueId=queue-1

POST   /createTerminal  { name, sectorIds, activeQueueIds, servingStrategy, strategyConfig }
GET    /listTerminals
PUT    /updateTerminal?terminalId=terminal-1   { name?, sectorIds?, activeQueueIds?, servingStrategy?, strategyConfig? }
DELETE /deleteTerminal?terminalId=terminal-1
```

### Users

`bootstrapUser`: cualquier cuenta autenticada (es la que crea/resuelve su propio perfil al loguearse). El resto: solo admin.

```bash
POST   /bootstrapUser
  → { id, uid, email, role, assignedSectorIds, status, createdAt, updatedAt }
  # Se llama automáticamente tras el login con Google. Primera vez:
  # invitación pendiente por email -> la reclama; email en ADMIN_ALLOWLIST -> admin activo;
  # si no, crea un perfil "pending" (sin permisos) para que un admin lo active.

GET    /listUsers
  → AppUser[]

POST   /inviteUser      { email, role, assignedSectorIds? }
  → AppUser   # status "pending" hasta que esa persona inicia sesión con ese email

PUT    /updateUserRole?userId=<id>   { role?, assignedSectorIds?, status? }
  → AppUser

DELETE /deleteUser?userId=<id>
  # Revoca acceso (borra el perfil; la cuenta de Google sigue existiendo, solo pierde permisos)
```

## 🧪 Testing

```bash
# Run unit tests
pnpm -F functions test

# Watch mode
pnpm -F functions test:watch

# Coverage
pnpm -F functions test:coverage
```

**106 tests** covering turnService, queueService, terminalService, statsService, adminService, y la capa de auth (middleware + gating de cada endpoint protegido).

### Testing Manual

```bash
# Público, sin token:
curl -X POST http://localhost:5001/turnero-1212-dev/us-central1/createTurn \
  -H "Content-Type: application/json" \
  -d '{"queueId":"queue-1", "memberNumber":12345, "channel":"totem"}'

# Protegido, requiere Bearer token (obtenido del cliente tras el login con Google):
curl -X POST http://localhost:5001/turnero-1212-dev/us-central1/callTurn \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <idToken>" \
  -d '{"terminalId":"terminal-1", "turnId":"turn-1"}'
```

Ver datos en Firestore Emulator UI: http://localhost:4000

## 📦 Build & Deploy

### Production Build

```bash
pnpm build
```

### Deploy a Firebase

CI (GitHub Actions) despliega automáticamente en push a `develop`/`qa`/`main`, hacia sus proyectos correspondientes (ver tabla de Entornos arriba). El deploy a `main`/prod queda en espera hasta que alguien lo aprueba manualmente en la pestaña Actions del repo (GitHub Environment `prod` con required reviewer).

Deploy manual (poco frecuente, usar el alias correcto):

```bash
firebase deploy --project dev
# o específico:
firebase deploy --project dev --only functions
firebase deploy --project dev --only hosting:app
```

**Nota:** `functions/package.json` usa `"shared": "workspace:*"` para desarrollo local (resuelto por pnpm). El predeploy hook lo reemplaza temporalmente por una copia vendorizada (`functions/vendor/shared` + `file:` dependency) porque el build aislado de Cloud Functions no entiende el protocolo `workspace:`, y lo revierte después. Si un deploy local se interrumpe a mitad de camino, `functions/package.json` puede quedar con `file:vendor/shared` — revertir a mano con `git checkout functions/package.json` si pasa.

## 🗂️ Estructura de Datos

**Firestore collections:**

- **sectors**: { id, name, description, createdAt, updatedAt }
- **queues**: { id, sectorId, name, type, reenqueueConfig, servedBy[], ... }
- **terminals**: { id, name, sectorIds[], activeQueueIds[], servingStrategy, ... }
- **turns**: { id, memberNumber, queueId, status, queuedAt, ... }
- **users**: { id, uid?, email, role (`admin`\|`supervisor`\|`cashier`), assignedSectorIds[], status (`pending`\|`active`), createdAt, updatedAt } — `id` es el `uid` de Firebase Auth una vez activo; mientras está `pending` (invitado por email, todavía no logueado) es un id autogenerado.

El ticket mostrado en Totem/Display/Terminal **es** `memberNumber` — no hay numeración secuencial diaria ni reset a medianoche. `queuedAt` es la clave de orden interna (= `createdAt` al crear el turno, se adelanta al reencolar por no-show) y reemplaza los antiguos `originalTurnNumber`/`currentTurnNumber`.

## 🔌 Estrategias de Servicio

**FIFO Across Queues**: Atiende turnos por número global.

**Ratio Based**: Alterna entre colas según configuración:
- `normalQueueRatio: 2, priorityQueueRatio: 1` = 2 normales por 1 prioritario
- Counters persistidos en terminal doc

## 🛣️ Roadmap

- [x] Phase 1-6: Backend (types, config, CRUD, operations)
- [x] Phase 7-10: Frontend (4 vistas)
- [x] Phase 11: Unit tests
- [x] Phase 12: Firestore security rules (`firestore.rules` real: lectura pública de sectors/queues/terminals/turns para Totem/Display; `users` restringido al propio doc o admin/supervisor; toda escritura pasa por Cloud Functions con Admin SDK, así que las rules la deniegan siempre)
- [x] Phase 13: Firebase Auth (Google Sign-In, roles admin/supervisor/cashier, cajero restringido a `assignedSectorIds`). Pendiente como follow-up: UI dedicada para las capacidades de supervisor (hoy solo tiene permiso de ver stats vía backend, sin pantalla propia) y refresco de token en la ventana flotante PiP más allá de lo que ya cubre compartir el mismo contexto JS
- [ ] Phase 14: WhatsApp integration
- [ ] Phase 15: Mobile app

## 📝 Desarrollo

### Commit conventions

```
feat: nueva feature
fix: correción de bug
refactor: refactorización
test: tests
docs: documentación
```

### Branch naming

`feature/description` o `bugfix/description`

## 🤝 Contribución

PRs bienvenidos. Por favor:
1. Crear issue para feature discussion
2. Crear branch desde `main`
3. Commit concisos
4. PR con descripción detallada
5. Tests para features nuevas

## 📞 Soporte

Issues en GitHub con:
- Descripción clara
- Steps to reproduce
- Expected vs actual
- Environment info

---

**Construido con ❤️ usando Firebase + React + TypeScript**
