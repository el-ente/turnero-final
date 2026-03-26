# Turnero

## Setup

```bash
cp app/.env.local.example app/.env.local  # completar con los valores de Firebase
```

## Desarrollo local

**UI** (http://localhost:5173):
```bash
cd app
pnpm install
pnpm dev
```

**Emuladores de Firebase** (Firestore, Functions, etc.):
```bash
firebase emulators:start
```

**Functions** (watch mode):
```bash
cd functions
npm install
npm run build:watch
```

> Para que la UI use los emuladores, configurar el SDK de Firebase para apuntar a `localhost`.

## Deploy

El deploy se ejecuta automáticamente al mergear a `main` via GitHub Actions.
Deploya: hosting, functions, reglas de Firestore y Storage.

Para deployar manualmente:
```bash
firebase deploy
```
