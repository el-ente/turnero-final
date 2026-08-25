# Performance Review — 2026-08-24

Independent audit of `app/` (React 19 + Vite 8). Scope: bundle size/code-splitting, Firestore listener/re-render patterns, mobile perf for `WebTicketView`, and render-churn from `.map()` keys. Read-only — no source changes made. `pnpm -F app build` was run to inspect output only.

Baseline build output:
```
dist/assets/index-DyQC7jII.js   687.77 kB │ gzip: 201.01 kB
(!) Some chunks are larger than 500 kB after minification.
```
`app/vite.config.ts:6-18` has no `build.rolldownOptions`/manual chunking config at all — just `plugins: [react()]` and the `shared` alias. `app/App.tsx:3-9` imports every view (`TotemView`, `PublicDisplay`, `TerminalView`, `WebTicketView`, `AdminView`, `LoginView`) eagerly at module top level, and `<Routes>` renders them without `lazy()`/`Suspense`. One JS chunk, no route-level splitting.

---

## Prioritized findings

### 1. Route-level `lazy()` splitting — Totem/`mi-turno` ship Admin's ~1200-line CRUD view
**Problem:** `App.tsx:3-9` statically imports `AdminView` (1197 lines, `app/src/views/AdminView.tsx`), `TerminalView` (771 lines), and their transitive component tree (`AdminModal.tsx`, etc.) into the single bundle every route loads.
**Why it matters here:** `/` (Totem) and `/mi-turno` (`WebTicketView`) are the two customer-facing routes — a kiosk on a possibly-mediocre in-store connection, and a stranger's own phone on 4G/cold cache, per `WebTicketView.tsx:11-14`'s own comment about being "left open" on someone's personal device. Neither needs one byte of Admin's CRUD logic or Terminal's operator console to render a number pad and a ticket. This is the one item in the review where the generic "your bundle is 687KB" warning translates into an actual user-facing cost: added parse/exec time and data on a real phone, not a kiosk that boots once and runs for a shift.
**Fix:** Wrap each `<Route>` element in `App.tsx:57-70` with `React.lazy()` + a `<Suspense>` boundary — standard React Router v7 pattern, no other architecture change needed. `PublicDisplay` (kiosk, boots once) and `TerminalView`/`AdminView` (behind `RequireAuth`, staff-only) are exactly the ones worth deferring out of Totem/`mi-turno`'s critical path.
**Effort:** Small–medium (route wiring change + verifying Suspense fallback doesn't flash on the kiosk).

### 2. Dead Firebase SDK surface bundled into every route: `storage` + `functions` client
**Problem:** `app/src/lib/firebase.ts:3-5,20-21,27` initializes `getStorage`/`connectStorageEmulator` and `getFunctions`/`connectFunctionsEmulator`, exporting `storage` and `functions`. Neither is imported or referenced anywhere else in `app/src` — confirmed by grep across the codebase. All backend calls go through plain `fetch` in `app/src/lib/api.ts:16-40` (`callFunction`) hitting Cloud Functions HTTP endpoints directly, not `httpsCallable`.
**Why it matters here:** `firebase.ts` is imported (via `db`) by literally every view including Totem and `WebTicketView`. Two entire unused Firebase SDK modules (Storage, Functions callable client) ride along in the one shared chunk that customer phones download, for zero runtime benefit.
**Fix:** Delete the `storage`/`functions` init and their imports from `firebase.ts`. Trivial, no behavior change (nothing references the exports).
**Effort:** Small.

### 3. `TerminalView`'s waiting-queue listener re-subscribes on every terminal doc update, not just when `activeQueueIds` changes
**Problem:** `app/src/views/TerminalView.tsx:45-59` — the effect that opens the `onSnapshot` query for waiting turns depends on `terminal?.activeQueueIds` (line 59). `terminal` itself comes from the *other* `onSnapshot` at line 36-43 on the raw terminal doc, which fires on every field change — including `currentTurnId`, which changes on essentially every operator action (call/start/finish/recall). Each fresh snapshot produces a brand-new `activeQueueIds` array reference (Firestore's `snap.data()` doesn't preserve identity across calls) even when its contents are unchanged, so React's dependency-array comparison sees "changed" and the effect tears down and re-establishes the waiting-turns listener.
**Why it matters here:** This isn't cosmetic — it means the second `onSnapshot` (a live query over `turns` filtered by `queueId in [...]` + `status == waiting`) unsubscribes and resubscribes on essentially every terminal action an operator takes during a shift (call next, start, finish, recall, pause/resume all touch the terminal doc). Each resubscribe re-runs the full query server-side and re-delivers the entire waiting-turn result set as "added" events, instead of the incremental diff Firestore listeners are designed to give you. Over a busy shift with dozens of operator actions per hour across several terminals, that's needless read amplification and listener churn, not just an extra render.
**Fix:** Depend on a stable derived value instead of the array reference — e.g. `terminal?.activeQueueIds.join(",")`, or store/compare via `useMemo` with a custom equality check, or move `activeQueueIds` derivation to only update state when it actually differs (`JSON.stringify` compare or a small deep-equal before `setTerminal`).
**Effort:** Small.

### 4. `PublicDisplay`'s 1s clock `setInterval` re-renders the whole component tree every second
**Problem:** `app/src/views/PublicDisplay.tsx:35,66-69` — `time` state updates every second via `setInterval`, and it lives in the same component that also holds `calledTurns`, `terminals`, `sectorNames`, and renders the full `counter-grid` (`activeTerminals.map(...)` at line 154) plus the entire inline `<style>` block (a new template-string literal, harmless but non-zero) every render.
**Why it matters here — but honestly, less than it sounds:** this is a fullscreen board that runs unattended for hours, so a full re-render every second isn't dropping frames on a phone under someone's thumb; it's a static-ish grid (typically single-digit terminal count) with cheap derivations (`latestTurnByTerminal`, `sectorLabel`). Real-world impact is probably negligible. Still, it's a textbook case of state colocation causing avoidable reconciliation: the clock re-render forces React to re-diff DOM nodes (counter cards, badges) that didn't change, once a second, indefinitely, on a device nobody restarts. Cheap now; grows if more terminals/turn data get added to this view later.
**Fix (optional, low priority):** Extract the clock into its own `<Clock />` child component holding its own `useState`/interval, so `setInterval`'s state update only re-renders a `<span>`, not the counter grid.
**Effort:** Small, and arguably skippable — flagging for completeness, not urgency.

### 5. No `prefers-reduced-motion` handling anywhere in the app
**Problem:** Grepped `app/src` for `prefers-reduced-motion` — zero matches. Multiple infinite CSS animations exist: `WebTicketView.tsx` — `wt-ticket-pulse` (`app/src/views/WebTicketView.tsx:504,507-510`, 1.5s infinite) and `wt-status-blink` (`:569,572-575`, 1s infinite) both fire continuously while a ticket is in "called" status; `PublicDisplay.tsx` — `pulse-dot` (`:366,369-372`, 2.5s infinite) and `counter-recalling`/`recall-pulse` (`:342,345-348`); `TerminalView.tsx` — `pulse-online` (`:365,368-371`, 2.5s infinite).
**Why it matters here:** `WebTicketView`'s blink/pulse fire specifically when the customer's number is called — the moment they're most likely glancing at the phone screen while distracted/walking, on a device that may have reduced-motion set for vestibular/accessibility reasons. It's also the one screen among these four most likely to be viewed on a personal phone rather than a fixed kiosk/display, where OS-level motion prefs are more commonly configured.
**Fix:** Wrap the infinite-animation declarations in `@media (prefers-reduced-motion: reduce) { animation: none; }` overrides, at minimum for `wt-ticket-pulse`/`wt-status-blink` in `WebTicketView.tsx`.
**Effort:** Small.

### 6. Google Fonts loaded via CSS `@import`, not `<link>` — adds a serial round-trip before text renders
**Problem:** `app/src/index.css:1` — `@import url('https://fonts.googleapis.com/css2?...')` at the top of the global stylesheet. A CSS `@import` is resolved only after the importing stylesheet itself is fetched and parsed, so the browser can't discover/start the Google Fonts request until the app's own CSS has already round-tripped. This serializes what could be a parallel fetch.
**Why it matters here:** Same audience as #1/#5 — `WebTicketView`/Totem loading cold on a phone network pays this extra latency directly on the path to first meaningful paint (the ticket number is rendered in the custom display font `Fraunces`).
**Fix:** Move to `<link rel="preconnect" href="https://fonts.googleapis.com">` + `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` + `<link rel="stylesheet" href="...">` in `app/index.html`, so the font request kicks off in parallel with the HTML parse instead of waiting on `index.css`. `display=swap` is already set, which is good — this only fixes the *discovery* delay, not FOIT.
**Effort:** Small.

### 7. Listener count per view — not a problem today, noted for completeness
`PublicDisplay` opens 3 concurrent `onSnapshot` listeners (turns, terminals, sectors) + 1 interval; `TerminalView` opens 3 (`terminals/{id}` doc, waiting-turns query, `turns/{currentTurnId}` doc); `WebTicketView` opens up to 2 (`turns/{turnId}` doc, ahead-count query) plus one one-shot `getDocs` for queues. All have correct cleanup (`return unsubscribe`) and none showed a missing-cleanup or infinite-resubscribe bug except #3 above. Dependency arrays elsewhere (`WebTicketView.tsx:95`, `TerminalView.tsx:43,59,74`) look correctly scoped to primitives or IDs, not object references — #3 is the one instance where an object/array from Firestore leaks into a dependency array. Not flagging listener *count* itself as a problem; Firestore listeners are cheap to hold open, and none of these views hold more than 3 at once.

### 8. `.map()` key audit — clean, no action needed
Checked every `.map((` call in `app/src/views/*.tsx` and `app/src/components/*.tsx` (`AdminView.tsx` ×10, `PublicDisplay.tsx`, `TotemView.tsx`, `WebTicketView.tsx`, `TerminalView.tsx`, `TerminalSelector.tsx`). No `Math.random()`-generated keys, no bare `key={idx}`/`key={i}`/`key={index}`. `TerminalView.tsx:286` uses `(turn, idx)` but keys off `turn.id` (line 287) and only uses `idx` for a CSS `animationDelay` stagger — not a key-stability issue. Everything else keys off Firestore document IDs. No DOM-churn risk from key choice anywhere in the views.

---

## Honest take on the build warning

Vite's "687KB, consider code-splitting" warning is *directionally* right but its generic phrasing undersells the actual argument for this app. The real case isn't "687KB is a scary number" — a kiosk (`TotemView`) and a fullscreen board (`PublicDisplay`) that load once and run for a shift genuinely don't care about a few hundred extra KB of JS on first paint. The real case is narrower and sharper: **`/mi-turno` is a cold-load, customer-owned-device, single-visit route**, and today it pays full price for Admin's entire back-office bundle it will never execute. That's items #1 and #2 above. Fix those two and the single-chunk warning becomes close to moot for this app's actual usage pattern — the remaining bulk (React, Firestore SDK, Auth SDK for the RBAC nav check) is either shared unavoidable cost or genuinely used cost, not waste.
