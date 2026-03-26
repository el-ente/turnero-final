# 🎫 Turnero Digital

Un sistema de gestión de turnos moderno construido con Firebase y React. Proporciona una solución completa para organizar colas en comercios, hospitales, administraciones públicas y más.

## 📋 Características

- **Gestión de Colas**: Soporte para múltiples colas con tipos normal y prioritario
- **Estrategias Inteligentes**: FIFO global o basado en ratios para balancear prioridades
- **Reencauzamiento**: Reintentos automáticos para clientes que no se presentan
- **Múltiples Interfaces**: Totem web, pantalla pública, terminal de operador, admin dashboard
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
- Google Cloud account

### Instalación

```bash
git clone <repo>
cd turnero-final
pnpm install
firebase login
```

### Variables de Entorno

Crear `app/.env.local`:

```
VITE_FIREBASE_PROJECT_ID=turnero-60150
VITE_FIREBASE_API_KEY=<tu-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<tu-auth-domain>
VITE_FIREBASE_STORAGE_BUCKET=<tu-bucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<tu-sender-id>
VITE_FIREBASE_APP_ID=<tu-app-id>
```

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

Crea datos de prueba: 2 sectores, 3 colas, 2 terminales, 7 turnos.

## 🎨 Vistas Frontend

| Vista | URL | Propósito | Diseño |
|-------|-----|-----------|--------|
| **Totem** | `/` | Usuario final saca turno | Minimalista, colores vibrantes |
| **Display** | `/display` | Pantalla pública de sala de espera | Brutal cyan/magenta, números ENORMES |
| **Terminal** | `/terminal` | Operador atiende turnos | Industrial verde neon, panel de control |
| **Admin** | `/admin` | Administrador configura sistema | Dashboard moderno azul/púrpura |

## 📡 API Endpoints

### Turn Management

```bash
POST /createTurn
  { queueId, memberId, channel }
  → { id, currentTurnNumber, status, ... }

GET /getCurrentTurn?memberId=member-1
  → { id, currentTurnNumber, ... }
```

### Terminal Operations

```bash
POST /nextTurn { terminalId }
POST /callTurn { terminalId, turnId }
POST /startTurn { terminalId, turnId }
POST /finishTurn { terminalId, turnId }
POST /noShow { terminalId, turnId }
POST /recallTurn { terminalId, turnId }
```

### Admin

```bash
GET /getQueueStats?queueId=queue-1
  → { totalTodayCreated, waitingCount, finishedCount, avgWaitTimeSeconds }

PUT /updateQueueConfig?queueId=queue-1
  { name, type, reenqueueConfig, priorityWeight }
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

**20 tests** covering turnService, queueService, terminalService, statsService.

### Testing Manual

```bash
curl -X POST http://localhost:5001/turnero-60150/us-central1/createTurn \
  -H "Content-Type: application/json" \
  -d '{"queueId":"queue-1", "memberId":"member-1", "channel":"totem"}'
```

Ver datos en Firestore Emulator UI: http://localhost:4000

## 📦 Build & Deploy

### Production Build

```bash
pnpm build
```

### Deploy a Firebase

```bash
firebase deploy
# o específico:
firebase deploy --only functions
firebase deploy --only hosting:app
```

Automático en merge a `main` (GitHub Actions).

## 🗂️ Estructura de Datos

**Firestore collections:**

- **sectors**: { id, name, description, createdAt, updatedAt }
- **queues**: { id, sectorId, name, type, reenqueueConfig, servedBy[], ... }
- **terminals**: { id, name, sectorIds[], activeQueueIds[], servingStrategy, ... }
- **turns**: { id, memberId, queueId, currentTurnNumber, status, ... }

Numeración diaria por cola, reset a medianoche Argentina (UTC-3).

## 🔌 Estrategias de Servicio

**FIFO Across Queues**: Atiende turnos por número global.

**Ratio Based**: Alterna entre colas según configuración:
- `normalQueueRatio: 2, priorityQueueRatio: 1` = 2 normales por 1 prioritario
- Counters persistidos en terminal doc

## 🛣️ Roadmap

- [x] Phase 1-6: Backend (types, config, CRUD, operations)
- [x] Phase 7-10: Frontend (4 vistas)
- [x] Phase 11: Unit tests
- [ ] Phase 12: Firestore security rules
- [ ] Phase 13: Firebase Auth
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
