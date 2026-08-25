# Task: Remove shared navbar from Totem's kiosk route

Commit: `c0f9e19` — fix(app): remove staff navbar from Totem's kiosk route

## What changed

`app/src/App.tsx`: `<Route path="/" element={<TotemView />} />` moved out of the
nav-wrapped `/*` route into a top-level sibling route, alongside `/display`
(same existing pattern `PublicDisplay` already used). `TotemView` stays an
eager import — this was a routing change only, not a lazy-loading one.
`/mi-turno` was deliberately left inside the nav-wrapped layout (visited from
a customer's own device via a shared link, not an unattended shared kiosk —
different tradeoff).

## Verification

- Independent reviewer agent confirmed: no leftover duplicate `/` route inside
  the inner routes; React Router v7's route-ranking (checked against the
  actual installed `react-router-dom@7.13.2` source) means a static `/`
  always outranks the `/*` splat regardless of declaration order — same
  mechanism `/display` already relied on; all other nested routes
  (`/mi-turno`, `/login`, `/terminal`, `/admin`) untouched.
- `pnpm -F app build` / `pnpm -F app lint` — clean, no new issues.
- Visually confirmed live at `http://localhost:5173/`: loads with no navbar.
- Number-entry → queue-select → ticket → auto-reset flow untouched by this
  change (routing-only, no changes to `TotemView.tsx` itself).

## Origin

Task was added to this file by a separate concurrent session's consistency
audit (`docs/consistency-audit-2026-08-24.md`), not authored by the session
that implemented the fix.
