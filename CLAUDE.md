# Turnero Digital

Queue management system — totem, display, terminal, admin views.

## Stack

- **Monorepo**: pnpm workspaces (`app`, `functions`, `shared`)
- **Frontend**: React 19 + Vite 8 + React Router v7
- **Backend**: Firebase Cloud Functions (Node 24)
- **DB**: Firestore (real-time listeners)
- **Deploy**: Firebase Hosting + GitHub Actions

## Commands

```bash
pnpm dev                        # Full local stack (emulators + functions watch + app dev)
pnpm -F app build               # Vite build → app/dist
pnpm -F app lint                # ESLint (flat config, ESLint 9)
pnpm -F functions build         # tsc → functions/lib
pnpm -F functions test          # Jest (20 tests across 4 services)
pnpm -F functions test:coverage # Coverage report
pnpm -F functions lint          # ESLint (Google config)
pnpm -F shared build            # Types only → shared/lib
pnpm -F functions seed:emulator # Populate test data
```

## Architecture

- `shared/` exports types/models → imported as `"shared"` in app & functions
- `functions/`: controllers → services → Firestore (transactions for atomicity)
- `app/`: views (Totem, Terminal, Admin, PublicDisplay), api client in `src/lib/api.ts`
- Firestore collections: `sectors`, `queues`, `terminals`, `turns`

## Code Style

- 2-space indent, double quotes
- TypeScript strict mode everywhere
- `async/await` over `.then()`
- PascalCase: components & types. camelCase: functions/vars

## Testing

- Jest 30 + ts-jest (functions only, no frontend tests)
- Tests in `functions/src/__tests__/`
- Run `pnpm -F functions test` before pushing backend changes

## Deploy

- Push to `main` → GitHub Actions builds & deploys all
- PR → preview deploy on Firebase Hosting
- Secrets: `VITE_FIREBASE_*` vars in GitHub Secrets
- Manual: `firebase deploy --only functions` / `firebase deploy --only hosting:app`

## Gotchas

- Firestore Timestamps need `.toDate()` conversion (see `app/src/lib/dates.ts`)
- Timezone: Argentina offset hardcoded (`ARGENTINA_OFFSET`)
- `shared` uses path mapping in both app and functions tsconfigs
- Dev requires Firebase emulators running (handled by `./dev.sh`)
