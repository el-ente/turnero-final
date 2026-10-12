# WhatsApp Integration — Technical Plan v2 (appointments only, 2026-10-10)

Implements `docs/whatsapp-functional-spec-2026-10-10.md` v2 under `docs/whatsapp-platform-research-2026-10-10.md`. Tasks: WA-T1…WA-T7 in `docs/local/tasks.md`.

## 1. Decisions
- **D1 Firestore triggers send; services stay untouched.** `onDocumentCreated("appointments/{id}")` sends the confirmation. A Meta outage can never fail a booking; Firebase retries transient errors.
- **D2 Webhook processes synchronously and always answers 200** (after signature check). Cloud Functions v2 doesn't guarantee CPU after the response; non-200 makes Meta re-deliver a poison message forever.
- **D3 Phone stays on `appointments`** (already staff-only). `whatsappContacts/{phone}` holds only `optedOut`, `lastInboundMessageId`, `lastFallbackReplyAt`, `pendingCancelAppointmentId`. Nothing public changes.
- **D4 Secrets via `defineSecret`**, one set per Firebase project (`dev`/`qa` → Meta test number, `prod` → real number). `functions/.secret.local` for the emulator (git-ignored).
- **D5 Templates created by hand in WhatsApp Manager**; code references name + `es_AR`. Text versioned in the spec §8.
- **D6 No delivery-status tracking.** Status webhooks are acknowledged and ignored except `failed`, which updates the log row. No `delivered`/`read`.
- **D7 No retry queue.** Failed send → `whatsappMessages.status = "failed"` + `logger.error`.
- **D8 Phone normalization server-side** in `functions/src/utils/argentinaPhone.ts`; client only checks "10 digits".

## 2. Data
```ts
// shared/src/models/appointment.ts
export interface Appointment {
  /* … */
  /** @deprecated no longer written; read-only for old docs */
  contact?: string;
  phone?: string; // "549XXXXXXXXXX"; its presence is the WhatsApp opt-in
}
```
Firestore (functions-internal, no client access → default deny; document in README):
- `whatsappContacts/{phone}`: `{ phone, optedOut, lastInboundMessageId?, lastFallbackReplyAt?, pendingCancelAppointmentId?, updatedAt }`
- `whatsappMessages/{id}`: `{ to, templateName?, refId, refDate?, status: "sent"|"failed", waMessageId?, error?, createdAt }`
- `appointmentDailyStats/{serviceId_date}`: `{ serviceId, date, byStatus: Record<AppointmentStatus, number>, withPhone: Record<AppointmentStatus, number>, computedAt }`

Indexes: `whatsappMessages` composite `templateName, refId, refDate` (reminder idempotency); `appointments` composite `date, status` already covered by existing single-field + in-memory filter on `phone` — verify at implementation, add only if the query needs it.

## 3. Modules (functions/src)
| File | Does |
|---|---|
| `config/whatsapp.ts` | `defineSecret` × 4 (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`), `GRAPH_API_VERSION = "v24.0"`, `WHATSAPP_SECRETS`. |
| `utils/argentinaPhone.ts` | `normalizeArgentinePhone(input) → string \| null`, `phoneVariants(canonical) → [549…, 54…]`. Pure. |
| `services/whatsappService.ts` | `sendTemplate(to, name, bodyParams, buttons?, ref)`, `sendText(to, body, ref)`; `fetch` to Graph; writes `whatsappMessages`; never throws; skips `optedOut`. `verifyWebhookSignature(rawBody, header, secret)` with `timingSafeEqual`. |
| `services/whatsappCopy.ts` | Every customer string (spec §8) as functions. |
| `services/whatsappInbound.ts` | `handleInbound(msg)`: dedupe → `BAJA` → `cancel_appt:<id>` button → `SÍ` with pending cancel → otherwise fallback reply (max once / 24 h). Calls `appointmentService.cancelAppointment`. |
| `controllers/whatsappController.ts` | `whatsappWebhook = onRequest({invoker: "public", secrets})`: GET verify; POST signature → iterate `messages[]` (→ inbound) and `statuses[]` (only `failed` → update log); always 200. |
| `triggers/appointmentNotifications.ts` | `onAppointmentCreated` → `cita_confirmacion` when `phone`. |
| `services/appointmentReminderService.ts` | `sendTomorrowReminders()`: tomorrow ART, `reservada`, `phone`, not opted out, no `whatsappMessages` row for `(cita_recordatorio, id, date)`. |
| `services/appointmentStatsService.ts` | `rollupAppointments(date)` → `appointmentDailyStats`. |
| `services/whatsappPurgeService.ts` | FR-14 purge. |
| `controllers/scheduledController.ts` | + `appointmentReminders` (18:00 ART), `appointmentStatsRollup` (03:00), `whatsappPurge` (03:30). |
| `index.ts` | export `whatsappWebhook`, `onAppointmentCreated`, the three schedules. |

Modified: `appointmentService.createAppointment` (+`phone` normalize/validate, stop writing `contact`), `appointmentController.createAppointmentHandler` (pass-through).

## 4. Frontend
- `AppointmentBookingView.tsx`: phone field + hint + privacy line (FR-1/2), 10-digit check, confirmation copy (FR-4). `contact` removed from the form.
- `AppointmentAgendaView.tsx`: badge when `phone`.
- `lib/api.ts`: `createAppointment` payload `phone?`.
- No env var needed (no `wa.me` links in this scope).

## 5. Environments & ops
- `firebase functions:secrets:set <NAME> --project dev|qa|prod` × 4; grant `gh-deployer` SA `roles/secretmanager.secretAccessor` once per project.
- Meta test app webhook → `dev` only; `qa` sends, doesn't receive.
- Prod prerequisites (owner): business portfolio, dedicated number not on consumer WhatsApp, display name approved, payment method, both templates `APPROVED`.
- Alert: Cloud Logging metric on `whatsappMessages.status == "failed"` → email.

## 6. Templates (Utility, es_AR)
| Name | Body params | Buttons |
|---|---|---|
| `cita_confirmacion` | contactName, serviceName, long date, HH:mm, appointmentId | URL "Ver cita" → `/agenda/{{1}}?memberNumber={{2}}` |
| `cita_recordatorio` | contactName, serviceName, long date, HH:mm | Quick reply "Cancelar cita" (`cancel_appt:<id>`), URL "Ver / reprogramar" |

## 7. Tests
Pure: `argentinaPhone`, copy, signature, inbound table `[contactState, inbound] → [reply, writes, serviceCalls]`, reminder idempotency, rollup counts, purge selection. `whatsappService` with mocked `fetch`. Controller with fake `req`/`res` like `appointmentController.test.ts`. Manual: Bruno `whatsapp/` + Meta test number.

## 8. Order
T1 phone util → T2 model/rules/secrets → T3 sender → T4 webhook (verify, BAJA, cancel button, fallback) → T5 booking form + confirmation trigger → T6 reminder job → T7 stats rollup + purge + docs sweep. Owner's Meta onboarding runs from day one; T5/T6 can't be verified end-to-end until templates are `APPROVED`.
