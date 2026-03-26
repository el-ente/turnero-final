# Turnero

Appointment queue management system. Stack: React + Vite, Firebase (Hosting, Firestore, Functions).

## Requirements

- Node 24
- pnpm
- Firebase CLI (`npm i -g firebase-tools`)

## Environment variables

Create `app/.env.local` with your Firebase project values:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Development

Start everything with one command:

```bash
pnpm dev
```

Or run each service in a separate terminal:

```bash
# UI
cd app && pnpm install && pnpm dev

# Firebase emulators (Firestore, Functions, etc.)
firebase emulators:start

# Functions watch mode
cd functions && npm install && npm run build:watch
```

## Deploy

Runs automatically on merge to `main`. To deploy manually:

```bash
firebase deploy
```
