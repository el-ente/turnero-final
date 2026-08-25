# WhatsApp Integration v1 — Implementation Plan

## Context

`docs/whatsapp-integration-v1-2026-08-11.md` defines the agreed v1 scope: take a ticket via WhatsApp, show queue length + confirm, recall alert, position heads-up (raw count, not ETA), on-demand position check, passive no-show notify, remote cancel. `Channel` already has a `"whatsapp"` literal (`shared/src/models/turn.ts`) but nothing implements it — `README.md` lists it as unbuilt `Phase 14`. This plan wires it up using only patterns that already exist in the codebase — no new frameworks, no state machine, no Firestore trigger unless unavoidable.

**Vendor: Meta Cloud API direct (confirmed).** No BSP, no new SDK dependency — `whatsappService.ts` calls the Graph API with native `fetch`.

## 1. Data model — `shared/src/models/turn.ts`

Add one field to `Turn`:
```ts
phone?: string;          // WA-format phone number, E.164
positionNotified?: boolean; // set true once the position-heads-up has fired, prevents re-sending
```
Nothing else changes in `shared/`. No new model file for WA sessions — that state is functions-internal, not shared.

Run `pnpm -F shared build` as part of this change (required for app/functions runtime to see it — the `paths` alias only affects the type-checker, not the built `lib/` that's actually imported).

## 2. Session state — plain Firestore doc, no new abstraction

Collection `whatsappSessions/{phone}`, doc shape (documented inline in `whatsappService.ts`, not a shared model):
```ts
{ pendingQueueId?: string; updatedAt: Date }
```
Written when a customer picks a sector (awaiting confirm), read/cleared on confirm or on the next inbound message. No TTL/cleanup job — an abandoned session is just overwritten next time that phone number writes, or ignored.

## 3. New service — `functions/src/services/whatsappService.ts`

Two functions, nothing more:
- `sendWhatsAppMessage(to: string, body: string): Promise<void>` — `fetch` POST to the Meta Graph API `/messages` endpoint. Uses native `fetch` (Node 24 has it built in) — no new dependency.
- `verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean` — HMAC-SHA256 check using the app secret, same shape Meta requires.

Both throw/return plain values — no retry queue, no message-template registry class. If sends fail, `logger.error` and move on (matches existing error-logging style in services).

## 4. Hooks into existing services — direct calls, not an event system

Three call sites get a WA send appended after their existing write, guarded by `if (turn.phone)`:
- `terminalService.recallTurn` — after the existing `update()`, send recall alert.
- `terminalService.handleNoShow` — after the transaction commits, branch on requeued-vs-cancelled (already known from which branch executed) and send the matching message.
- `turnService.createTurn` — if `channel === "whatsapp"`, after creating, send a confirmation with the ticket number.

No pub/sub, no generic "on turn changed" dispatcher — three call sites, three direct calls. This matches the existing codebase's style (services call each other directly, no event bus anywhere).

## 5. Position heads-up (feature 4) — no Firestore trigger

A turn's position can change because of someone *else's* action (e.g. the person ahead gets called), so this can't be a hook on "your own" turn action alone. Add one small helper to `queueService.ts`:

```ts
export async function notifyPositionThreshold(queueId: string, threshold = 5): Promise<void>
```
It calls the existing `getWaitingTurns(queueId)`, and for any turn at index `threshold - 1` (i.e., exactly at the threshold) with `phone` set and `positionNotified` not yet true, sends the heads-up and sets `positionNotified: true`. Called at the end of the three places that already shift the waiting list: `callTurn`, `handleNoShow` (requeue branch), `cancelTurn`. No new trigger, no new infrastructure — reuses the exact query already used for requeue-position math.

## 6. Inbound webhook — `functions/src/controllers/whatsappController.ts`

- `whatsappWebhookHandler`, exported as `whatsappWebhook` from `index.ts` (same re-export pattern as every other function).
- `GET` — Meta's verification handshake (`hub.challenge` echo, checked against `WHATSAPP_WEBHOOK_VERIFY_TOKEN`).
- `POST` — verify signature via `whatsappService.verifyWebhookSignature`, else `401` via new `UnauthorizedError`. Then simple keyword routing on the inbound text (no NLP): a number → pick sector + show `getWaitingTurns(queueId).length` + write session; "si"/"confirmar" → `turnService.createTurn(..., "whatsapp")`, clear session; "donde"/"posicion" → look up the phone's active turn, reply with position; "cancelar" → `turnService.cancelTurn`, but only if the found turn's `phone` matches the sender (ownership check).

## 7. Errors — `functions/src/utils/errors.ts`

Add `UnauthorizedError extends BusinessError` (401), for webhook signature failures. Nothing else needed — `NotFoundError`/`ConflictError` already cover the rest.

## 8. Secrets — `firebase-functions/params`

`defineSecret` for `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`. Bound via `onRequest({cors: true, secrets: [...]})` on the webhook handler; `whatsappService` reads `.value()` at call time. This is a new pattern for the repo (nothing uses `defineSecret` today) but it's the built-in v2 mechanism, not a new dependency.

## 9. Frontend — small, not zero

- `app/src/lib/api.ts`: `createTurn` gets one new optional param, `phone?: string`.
- `app/src/views/TotemView.tsx`: one optional phone input on the ticket-creation form, passed through.
Nothing else in `app/` changes — no position display, no new views.

## 10. Docs — same change as the code, per project rule

- `README.md` `## 📡 API Endpoints`: add the webhook entry. `## 🗂️ Estructura de Datos`: add `phone?`/`positionNotified?` to the `turns` line.
- `bruno/turnero-api/whatsapp/`: new folder, one `.bru` per webhook verb (GET verify, POST event).
Each slice below updates docs for what it touches — not deferred to the end.

## 11. Tests

- `terminalService.test.ts` / `turnService.test.ts`: extend existing describe blocks — assert `whatsappService.sendWhatsAppMessage` is called when `turn.phone` is set, not called when absent (mock `../services/whatsappService`, same `jest.mock` pattern already used for `queueService`).
- New `whatsappService.test.ts`: mock global `fetch`, test send + signature verification.
- New `whatsappController.test.ts`: first controller test in the repo — call the handler directly with mock `req`/`res` objects (plain objects with jest.fn() `status`/`json`), mock `whatsappService` and the called services, same `db` automock pattern.

## 12. Build order (land incrementally, each slice self-contained incl. docs)

1. Data model + `whatsappService` (send/verify) + secrets + tests. No behavior change yet.
2. Recall + no-show passive notify hooks. Smallest, safest, highest customer value.
3. Webhook: take-a-ticket + confirm + cancel + on-demand position check.
4. Position heads-up helper + totem phone field.
