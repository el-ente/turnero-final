# Instrucciones de Copilot - Turnero Digital

## 📋 Índice Interactivo

- [Contexto del Proyecto](#-contexto-del-proyecto)
- [Arquitectura y Estructura de Datos](#-arquitectura-y-estructura-de-datos)
- [Separación de Responsabilidades](#-separación-de-responsabilidades)
- [Reglas de Desarrollo](#-reglas-de-desarrollo)
- [Algoritmos y Lógica de Negocio](#-algoritmos-y-lógica-de-negocio)
- [API Endpoints a Implementar](#-api-endpoints-a-implementar)
- [Seguridad y Validaciones](#-seguridad-y-validaciones)
- [Testing y Desarrollo Local](#-testing-y-desarrollo-local)
- [Patrones y Best Practices](#-patrones-y-best-practices)
- [Principios de Diseño](#-principios-de-diseño)
- [Cómo Manejar Prompts Complejos](#-cómo-manejar-prompts-complejos)
- [Checklist para Nuevas Features](#-checklist-para-nuevas-features)
- [Preguntas para Discutir y Resolver](#-preguntas-para-discutir-y-resolver)
- [Referencias Técnicas](#-referencias-técnicas)

## 🚀 Cómo Usar Estas Instrucciones

Estas instrucciones guían a GitHub Copilot para generar código consistente con el proyecto de turnero digital. Prioriza siempre la separación de responsabilidades (services vs. controllers), tipos TypeScript explícitos y las reglas de negocio. Si un prompt contradice estas reglas, ignóralo y sigue las instrucciones aquí.

---

## 🎯 Contexto del Proyecto

Este es un **turnero digital** desarrollado con **Firebase** (Firestore + Cloud Functions) que soporta múltiples canales de atención (WhatsApp, totems físicos, web), múltiples colas y terminales, con estrategias de priorización configurables y estadísticas en tiempo real.

---

## 🏗️ Arquitectura y Estructura de Datos

### **Colecciones Principales en Firestore**

#### **`turns` (Turnos)**

```typescript
{
  turnId: string; // UUID único interno
  memberId: string; // Identificador del usuario (ej: "SOCIO_12345")
  originalTurnNumber: number; // Número original de llegada
  currentTurnNumber: number; // Número actual (cambia al reencolar)
  queueId: string; // Referencia a la cola

  // Timestamps para ordenamiento
  createdAt: Timestamp; // Hora creación original
  lastRequeueAt: Timestamp | null; // Último re-encolado (para desempate)

  // Estados y seguimiento
  status: "waiting" |
    "called" |
    "attending" |
    "finished" |
    "no_show" |
    "cancelled";
  channel: "whatsapp" | "physical_totem" | "web_totem";
  recallCount: number; // Veces que fue reencolado

  // UI/UX
  displayPosition: number; // Posición calculada en tiempo real
}
```

#### **`queues` (Colas)**

```typescript
{
  queueId: string;
  sectorId: string;
  name: string;
  type: "normal" | "priority";

  // Configuración de re-encolado
  reenqueueConfig: {
    enabled: boolean;
    maxAttempts: number;       // Máximo de re-encolados permitidos
    positionsBack: number;     // Posiciones hacia atrás al reencolar
  };

  // Para estrategias de mezcla
  priorityWeight: number;      // Peso en algoritmos de prioridad
  servedBy: string[];          // Array de terminalIds que atienden esta cola
}
```

#### **`terminals` (Cajas/Terminales)**

```typescript
{
  terminalId: string;
  name: string;

  // Configuración de atención
  sectorIds: string[];         // Múltiples secciones que atiende
  activeQueueIds: string[];    // Todas las colas que puede atender

  // Estrategia de atención
  servingStrategy: "ratio_based" | "fifo_across_queues";
  strategyConfig: {
    normalToPriorityRatio: number; // Ej: 2 (2 normales por 1 prioritario)
  };

  // Estado actual
  currentTurnId: string | null;
  status: "active" | "paused" | "inactive";
}
```

---

## 🎨 Separación de Responsabilidades

### **REGLA FUNDAMENTAL: Services vs Controllers**

**Services (`src/services/`)**: Contienen TODA la lógica de negocio

- ✅ Funciones puras que reciben parámetros y retornan resultados
- ✅ Interactúan con Firestore y otros servicios de Firebase
- ✅ Implementan algoritmos y reglas de negocio
- ✅ Son reutilizables desde múltiples controllers
- ✅ NO conocen nada sobre HTTP, request, response

**Controllers (`src/controllers/`)**: Son adaptadores HTTP delgados

- ✅ Parsean y validan parámetros del request
- ✅ Llaman a funciones de services
- ✅ Formatean y envían respuestas HTTP
- ✅ Manejan errores y códigos de estado
- ✅ NO contienen lógica de negocio

### **Tabla Comparativa: Qué va en Services vs. Controllers**

| Aspecto           | Services (`src/services/`)      | Controllers (`src/controllers/`)                 |
| ----------------- | ------------------------------- | ------------------------------------------------ |
| **Propósito**     | Lógica de negocio pura          | Adaptadores HTTP delgados                        |
| **Interacciones** | Firestore, algoritmos           | Parseo de request, formato de response           |
| **Dependencias**  | Solo imports de config y models | Imports de services y Firebase Functions         |
| **Ejemplo**       | `getNextTurn(queueId)`          | `onRequest(async (req, res) => { ... })`         |
| **Prohibido**     | Conocer HTTP, request/response  | Contener queries a Firestore o lógica de negocio |

### **Ejemplo de Refactorización**

```typescript
// ❌ INCORRECTO - Controller con lógica de negocio
export const nextTurn = onRequest(async (req, res) => {
  const turns = await db
    .collection("turns")
    .where("status", "==", "waiting")
    .get();
  res.json({ turn: turns.docs[0] });
});

// ✅ CORRECTO - Después de refactorizar
// 1. Mover lógica a service
export async function getNextTurn(queueId: string): Promise<Turn | null> {
  const turns = await db
    .collection("turns")
    .where("queueId", "==", queueId)
    .where("status", "==", "waiting")
    .get();
  return turns.empty ? null : (turns.docs[0].data() as Turn);
}

// 2. Controller delgado
export const nextTurn = onRequest(async (req, res) => {
  const result = await getNextTurn(req.body.queueId);
  res.json({ turn: result });
});
```

---

## 🔧 Reglas de Desarrollo

### **Tecnologías y Herramientas**

- **Runtime**: Node.js 24
- **Lenguaje**: TypeScript (strict mode)
- **Backend**: Firebase Cloud Functions v2
- **Database**: Firestore
- **Package Manager**: npm

### **Estructura de Archivos**

```
functions/
├── src/
│   ├── index.ts              # Entry point de Cloud Functions
│   ├── seed.ts               # Script de datos de prueba
│   ├── config/
│   │   └── firebase-admin.ts # Inicialización de Firebase Admin
│   ├── services/             # Lógica de negocio (funciones puras)
│   ├── controllers/          # Handlers de endpoints HTTP
│   ├── models/               # Tipos e interfaces TypeScript
│   └── utils/                # Funciones auxiliares
├── lib/                      # Código compilado (generado)
└── package.json
```

### **Convenciones de Código**

#### **Nomenclatura**

- **Variables/Funciones**: `camelCase` (ej: `nextTurnNumber`, `getQueueById`)
- **Tipos/Interfaces**: `PascalCase` (ej: `Turn`, `QueueConfig`)
- **Constantes**: `UPPER_SNAKE_CASE` (ej: `MAX_REQUEUE_ATTEMPTS`)
- **Colecciones Firestore**: `lowercase_snake` (ej: `turns`, `queues`)
- **IDs de documentos**: `snake_case` con prefijo (ej: `queue_priority_perfumes`, `terminal_1`)

#### **Tipos TypeScript**

- **SIEMPRE** definir tipos explícitos para parámetros y retornos de funciones
- **NUNCA** usar `any`, preferir `unknown` si es necesario
- Crear interfaces para estructuras de datos de Firestore
- Usar enums o union types para estados fijos

```typescript
// ✅ CORRECTO - Usar enums para estados
enum TurnStatus {
  Waiting = "waiting",
  Called = "called",
  Attending = "attending",
  Finished = "finished",
  NoShow = "no_show",
  Cancelled = "cancelled",
}

interface Turn {
  turnId: string;
  status: TurnStatus;
  createdAt: admin.firestore.Timestamp;
}

// ❌ INCORRECTO - Tipos implícitos o any
async function getNextTurn(queueId: any): Promise<any> {
  // No usar any
  // ...
}
```

#### **Manejo de Errores**

- Usar try-catch en todas las funciones async
- Loguear errores con contexto relevante usando `logger` de Firebase
- Retornar respuestas HTTP apropiadas (200, 400, 404, 500)

```typescript
import * as logger from "firebase-functions/logger";

// ✅ CORRECTO - Clase de error personalizada
class BusinessError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(message);
  }
}

// En service
if (!queueDoc.exists) {
  throw new BusinessError(`Queue ${queueId} not found`, 404);
}

// En controller
} catch (error) {
  if (error instanceof BusinessError) {
    res.status(error.statusCode).json({ error: error.message });
  } else {
    logger.error("Unexpected error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}
```

---

## 🧮 Algoritmos y Lógica de Negocio

### **Sistema de Numeración**

- Cada cola mantiene su **propia secuencia numérica**
- Al reencolar: `currentTurnNumber = currentTurnNumber + positionsBack`
- **Ordenamiento**: `ORDER BY currentTurnNumber ASC, createdAt ASC, lastRequeueAt ASC`
- **Desempate**: Usar `createdAt` y `lastRequeueAt` como timestamps secundarios

### **Algoritmo de Re-encolado**

```typescript
// Pseudo-código
if (turn.recallCount < queue.reenqueueConfig.maxAttempts) {
  turn.currentTurnNumber += queue.reenqueueConfig.positionsBack;
  turn.recallCount += 1;
  turn.lastRequeueAt = admin.firestore.FieldValue.serverTimestamp();
  turn.status = "waiting";
} else {
  turn.status = "cancelled"; // Máximo de intentos alcanzado
}
```

### **Implementaciones de Algoritmos**

```typescript
// ✅ Algoritmo de Re-encolado en TypeScript
export async function requeueTurn(turnId: string): Promise<Turn> {
  return db.runTransaction(async (transaction) => {
    const turnRef = db.collection("turns").doc(turnId);
    const turnDoc = await transaction.get(turnRef);
    if (!turnDoc.exists) throw new BusinessError("Turn not found", 404);

    const turn = turnDoc.data() as Turn;
    const queueDoc = await transaction.get(
      db.collection("queues").doc(turn.queueId),
    );
    const queue = queueDoc.data();
    const config = queue?.reenqueueConfig;

    if (!config?.enabled) throw new BusinessError("Requeue not enabled", 400);
    if (turn.recallCount >= config.maxAttempts) {
      transaction.update(turnRef, { status: "cancelled" });
      throw new BusinessError("Max requeue attempts reached", 400);
    }

    const updatedTurn = {
      currentTurnNumber: turn.currentTurnNumber + config.positionsBack,
      recallCount: turn.recallCount + 1,
      lastRequeueAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "waiting" as TurnStatus,
    };
    transaction.update(turnRef, updatedTurn);
    return { ...turn, ...updatedTurn };
  });
}

// Advertencia: Usa transacciones para evitar race conditions en asignación de turnos.
```

---

## 📡 API Endpoints a Implementar

### **Endpoints para Terminales**

```typescript
// Ejemplo de controller para POST /terminals/:terminalId/next-turn
import { onRequest } from "firebase-functions/v2/https";
import { getNextTurn } from "../services/turnService";

export const nextTurnHandler = onRequest(async (req, res) => {
  const { terminalId } = req.params;
  const { queueId, strategy } = req.body;
  // Validaciones y llamada a service...
});
```

```typescript
POST /terminals/:terminalId/next-turn
  → Obtener siguiente turno considerando estrategia configurada

POST /terminals/:terminalId/call-turn/:turnId
  → Llamar a un turno específico (cambiar status a "called")

POST /terminals/:terminalId/recall-turn/:turnId
  → Re-llamar turno (incrementar recallCount si aplica)

POST /terminals/:terminalId/no-show/:turnId
  → Marcar como no presentado y reencolar si aplica

POST /terminals/:terminalId/start-turn/:turnId
  → Comenzar atención (status = "attending")

POST /terminals/:terminalId/finish-turn/:turnId
  → Finalizar atención (status = "finished")
```

### **Endpoints para Usuarios**

```typescript
// Ejemplo de controller para POST /turns
import { onRequest } from "firebase-functions/v2/https";
import { createTurn } from "../services/turnService";

export const createTurnHandler = onRequest(async (req, res) => {
  const { memberId, queueId, channel } = req.body;
  // Validaciones y llamada a service...
});
```

```typescript
GET /members/:memberId/current-turn
  → Estado actual del turno del miembro

POST /turns
  → Crear nuevo turno (body: { memberId, queueId, channel })
```

### **Endpoints de Administración**

```typescript
// Ejemplo de controller para GET /queues/:queueId/stats
import { onRequest } from "firebase-functions/v2/https";
import { getQueueStats } from "../services/statsService";

export const getQueueStatsHandler = onRequest(async (req, res) => {
  const { queueId } = req.params;
  // Llamada a service...
});
```

```typescript
GET /queues/:queueId/stats
  → Estadísticas de la cola (turnos esperando, tiempo promedio, etc.)

PUT /queues/:queueId/config
  → Actualizar configuración de cola
```

---

## 🔐 Seguridad y Validaciones

### **Reglas de Firestore** (pendiente implementar)

- Usuarios solo pueden leer sus propios turnos
- Terminales solo pueden escribir en colección `turns` con validación
- Administradores tienen acceso completo

### **Validaciones en Cloud Functions**

- Verificar que `queueId` existe antes de crear turno
- Validar que `terminalId` tiene permiso para atender `queueId`
- Verificar límites de re-encolado antes de aplicar
- Validar transiciones de estado válidas (ej: no pasar de "finished" a "waiting")

---

## 🧪 Testing y Desarrollo Local

```bash
# Ejecutar emuladores
firebase emulators:start

# Seed de datos de prueba en emulador
npm run seed:emulator
```

### **Scripts Disponibles**

```bash
npm run build          # Compilar TypeScript
npm run build:watch    # Compilar en modo watch
npm run serve          # Emuladores + functions
npm run seed           # Seed datos de prueba (producción)
npm run seed:emulator  # Seed datos de prueba (emulador)
npm run deploy         # Deploy a Firebase
```

---

## 📝 Patrones y Best Practices

### **Estructura de un Service**

```typescript
// src/services/turnService.ts
import { db } from "../config/firebase-admin";
import { Turn, TurnStatus } from "../models/turn";
import * as admin from "firebase-admin";

/**
 * Crea un nuevo turno en la cola especificada
 */
export async function createTurn(params: {
  memberId: string;
  queueId: string;
  channel: "whatsapp" | "physical_totem" | "web_totem";
}): Promise<Turn> {
  const { memberId, queueId, channel } = params;

  // 1. Validar que la cola existe
  const queueDoc = await db.collection("queues").doc(queueId).get();
  if (!queueDoc.exists) {
    throw new Error(`Queue ${queueId} not found`);
  }

  // 2. Obtener el siguiente número de turno
  const lastTurnQuery = await db
    .collection("turns")
    .where("queueId", "==", queueId)
    .orderBy("originalTurnNumber", "desc")
    .limit(1)
    .get();

  const nextNumber = lastTurnQuery.empty
    ? 1
    : lastTurnQuery.docs[0].data().originalTurnNumber + 1;

  // 3. Crear el turno
  const turnRef = db.collection("turns").doc();
  const newTurn: Turn = {
    turnId: turnRef.id,
    memberId,
    originalTurnNumber: nextNumber,
    currentTurnNumber: nextNumber,
    queueId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastRequeueAt: null,
    status: "waiting",
    channel,
    recallCount: 0,
    displayPosition: 0, // Se calculará después
  };

  await turnRef.set(newTurn);

  return newTurn;
}

/**
 * Re-encola un turno según la configuración de la cola
 */
export async function requeueTurn(turnId: string): Promise<Turn> {
  return db.runTransaction(async (transaction) => {
    const turnRef = db.collection("turns").doc(turnId);
    const turnDoc = await transaction.get(turnRef);

    if (!turnDoc.exists) {
      throw new Error("Turn not found");
    }

    const turn = turnDoc.data() as Turn;
    const queueDoc = await transaction.get(
      db.collection("queues").doc(turn.queueId),
    );

    const queue = queueDoc.data();
    const config = queue?.reenqueueConfig;

    if (!config?.enabled) {
      throw new Error("Requeue not enabled for this queue");
    }

    if (turn.recallCount >= config.maxAttempts) {
      transaction.update(turnRef, { status: "cancelled" });
      throw new Error("Max requeue attempts reached");
    }

    const updatedTurn = {
      currentTurnNumber: turn.currentTurnNumber + config.positionsBack,
      recallCount: turn.recallCount + 1,
      lastRequeueAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "waiting",
    };

    transaction.update(turnRef, updatedTurn);

    return { ...turn, ...updatedTurn };
  });
}
```

### **Estructura de un Controller**

```typescript
// src/controllers/turnController.ts
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { createTurn, requeueTurn } from "../services/turnService";

/**
 * POST /turns
 * Crea un nuevo turno
 */
export const createTurnHandler = onRequest(async (req, res) => {
  try {
    // 1. Validar método HTTP
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // 2. Validar parámetros
    const { memberId, queueId, channel } = req.body;

    if (!memberId || !queueId || !channel) {
      res.status(400).json({
        error: "Missing required fields: memberId, queueId, channel",
      });
      return;
    }

    if (!["whatsapp", "physical_totem", "web_totem"].includes(channel)) {
      res.status(400).json({ error: "Invalid channel" });
      return;
    }

    // 3. Llamar al service
    const turn = await createTurn({ memberId, queueId, channel });

    // 4. Enviar respuesta
    res.status(201).json({
      success: true,
      data: turn,
    });
  } catch (error) {
    logger.error("Error creating turn", {
      error: error instanceof Error ? error.message : String(error),
      body: req.body,
    });

    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /turns/:turnId/requeue
 * Re-encola un turno
 */
export const requeueTurnHandler = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { turnId } = req.params;

    if (!turnId) {
      res.status(400).json({ error: "Missing turnId" });
      return;
    }

    const turn = await requeueTurn(turnId);

    res.status(200).json({
      success: true,
      data: turn,
    });
  } catch (error) {
    logger.error("Error requeuing turn", {
      error: error instanceof Error ? error.message : String(error),
      turnId: req.params.turnId,
    });

    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;

    res.status(status).json({
      success: false,
      error: message,
    });
  }
});
```

### **Registro de Funciones en index.ts**

```typescript
// src/index.ts
import { setGlobalOptions } from "firebase-functions/v2";

// Importar controllers
import {
  createTurnHandler,
  requeueTurnHandler,
} from "./controllers/turnController";
import {
  nextTurnHandler,
  callTurnHandler,
} from "./controllers/terminalController";

setGlobalOptions({ maxInstances: 10 });

// Exportar funciones HTTP
export const createTurn = createTurnHandler;
export const requeueTurn = requeueTurnHandler;
export const getNextTurn = nextTurnHandler;
export const callTurn = callTurnHandler;
```

---

## 🎨 Principios de Diseño

1. **Separación de preocupaciones**:
   - Lógica de negocio en `services/` (funciones puras)
   - Adaptadores HTTP en `controllers/` (delgados)
   - Modelos de datos en `models/`
2. **Flexibilidad**: Estrategias configurables, no hardcodeadas
3. **Escalabilidad**: Diseñar pensando en múltiples terminales y colas concurrentes
4. **Observabilidad**: Logs detallados y estadísticas en tiempo real
5. **Resiliencia**: Manejo robusto de errores y re-intentos
6. **Testabilidad**: Services testeables independientemente de HTTP

---

## 🧠 Cómo Manejar Prompts Complejos

GitHub Copilot debe seguir estas instrucciones estrictamente. Ejemplos de prompts efectivos:

- **Prompt Bueno**: "Genera el service para crear turnos siguiendo las reglas de separación".
  - **Respuesta Esperada**: Crea `src/services/turnService.ts` con función pura, sin HTTP.

- **Prompt Complejo**: "Implementa el endpoint POST /turns con validaciones y manejo de errores".
  - **Respuesta Esperada**: Primero genera tipos en `models/`, luego service en `services/`, finalmente controller en `controllers/`.

- **Si el prompt contradice**: Ignora y genera código correcto (ej. si pide lógica en controller, muévela a service).

---

## ✅ Checklist para Nuevas Features

- [ ] Tipos TypeScript definidos en `models/` (usar enums para estados)
- [ ] Lógica de negocio implementada en `services/` (funciones puras)
- [ ] Controllers delgados que llaman a services (sin queries directas)
- [ ] Validaciones de entrada en controllers (antes de llamar services)
- [ ] Manejo de errores con try-catch y BusinessError
- [ ] Logs con contexto relevante (IDs, timestamps)
- [ ] Transacciones donde aplique (para operaciones críticas)
- [ ] Índices de Firestore documentados (compound indexes para queries)
- [ ] Actualizado seed.ts si afecta estructura de datos
- [ ] Probado con emuladores (alta concurrencia simulada)
- [ ] Documentado con comentarios JSDoc
- [ ] Verificado que no hay race conditions en asignación de turnos
- [ ] Probado casos edge (colas vacías, límites de re-encolado)

---

## ❓ Preguntas para Discutir y Resolver

1. **Reinicio de numeración**: ¿Diario o secuencia continua? **Recomendación**: Diario, para evitar números muy altos.
2. **Estrategias avanzadas**: ¿Implementar round-robin, weighted? **Recomendación**: Sí, para flexibilidad.
3. **Límites de turnos**: ¿Máximo de turnos por día/usuario? **Recomendación**: Sí, configurable por cola.
4. **Roles y permisos**: ¿Sistema de roles (operador/administrador)? **Recomendación**: Implementar con Firebase Auth.
5. **Notificaciones**: ¿Push notifications, SMS, WhatsApp? **Recomendación**: WhatsApp integrado.

### **Optimizaciones Futuras**

- Caché de configuraciones de colas en memory
- Agregaciones pre-calculadas para estadísticas
- Archivado de turnos históricos

---

## 🔍 Referencias Técnicas

// ...existing code...

---

## 📊 Versionado y Mantenimiento

**Versión**: 1.1 - Incorporadas mejoras de estructura, ejemplos detallados y guía para prompts complejos.

**Métricas de Éxito**: Estas instrucciones se consideran efectivas si Copilot genera código que pasa el checklist en >90% de casos.

**Próximas Mejoras**: Agregar ejemplos de testing unitario, integración con CI/CD.

---

**Última actualización**: 23 de noviembre de 2025
