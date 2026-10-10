# WhatsApp Cloud API — Platform Research & Constraints (2026-10-10)

Input for `docs/whatsapp-functional-spec-2026-10-10.md` and `docs/whatsapp-technical-plan-2026-10-10.md`. Supersedes the Aug-11 WhatsApp docs. Vendor decision already taken: **Meta Cloud API direct, no BSP**. No WhatsApp Business Account (WABA) exists yet.

Everything below was checked against Meta docs + several BSP write-ups on 2026-10-10. Pricing figures from third parties disagree; treat them as indicative and re-check Meta's rate card (xlsx download on the pricing page) before go-live.

## 1. Pricing model (what every design decision hinges on)

- **Per delivered message**, by template category and recipient country. Conversation-based pricing ended July 2025.
- Categories: `marketing` (irrelevant for us), `utility` (every notification we send), `authentication` (OTP, not needed), `service` (free-form reply inside the 24 h window).
- **Changes effective 2026-10-01** (confirmed by Courier, YCloud, Zenvia, Wati, chat2desk, EngageLab):
  - Utility templates are charged **even inside** an open 24 h customer-service window. No free tier.
  - Free-form service replies are charged at the market's utility rate **after 1,000 free delivered service messages per business phone number per month** (non-cumulative).
  - Inbound customer messages stay free.
- **Argentina utility rate**: sources show US$0.012 (Ominiflow, "Rest of LatAm" card) up to US$0.026 (one source quoting the Oct-2026 card). Plan with **~US$0.02 per outbound message** until verified on Meta's rate card.
- Volume tiers lower utility rates, reset monthly, counted across the whole business portfolio; irrelevant at our volume.
- Implication: **each turn/appointment should cost at most 2–3 outbound messages**. "You're next"-style pings per position change would multiply cost; a single heads-up at a fixed threshold is the budget-friendly shape.

## 2. The 24-hour customer-service window

- Opens when the customer sends us a message (or clicks a `wa.me` link and sends the pre-filled text). Resets on every new inbound message.
- Inside the window: free-form text + interactive messages (reply buttons ≤3, list messages ≤10 rows) are allowed; no template approval needed. Billed as service messages after the 1,000 free.
- Outside the window: **only approved templates**; a free-form send fails with error `131047` ("re-engagement message").
- Implication: anything we send hours later (appointment reminder the day before, "you were called" for a ticket taken at the totem 40 min ago) must be a **utility template**. Conversational intake replies (sector list, confirmation) can be free-form because the customer just wrote to us.

## 3. Messaging limits & account tiers

- New, unverified business portfolio: **250 unique recipients per rolling 24 h** for business-initiated (template) messages. Inbound-triggered replies inside a window don't count.
- 250 → 2,000: business verification (legal docs / CUIT) **or** 2,000 delivered templates with good quality. Above that: automatic scaling every 6 h when ≥50 % of the limit is used over 7 days with high quality.
- Limits are per **portfolio**, not per number: adding numbers doesn't add capacity.
- Quality rating (customer blocks/reports) can pause templates (`PAUSED`, error `132015`) and stalls tier upgrades. Opt-in + low message volume keep this green.
- Unverified portfolio: max 2 phone numbers, 250 templates. Verified: 20 numbers, 6,000 templates.
- For one branch of a PAMI-style office, 250/day is enough for a pilot; verification is needed before a multi-branch rollout.

## 4. Onboarding path (nothing exists yet)

1. **Meta Business Portfolio** for the organisation (the office's legal entity, not the developer) → Business Settings.
2. **Meta App** (type Business, use case "Connect with customers through WhatsApp"). Auto-creates a **test WABA + test number** (+1 555…): sends to up to **5 allow-listed recipients**, no payment method, relaxed limits. Enough for `dev` and `qa`.
3. **System user** with `whatsapp_business_messaging` + `whatsapp_business_management` → **permanent access token**. No App Review needed when the WABA belongs to the same business that owns the app (standard access).
4. **Production phone number**: a number **not registered on consumer WhatsApp / WhatsApp Business app** (or deleted from it first). Verified by SMS/voice; **two-step verification PIN is mandatory**. Display name goes through review (`PENDING_REVIEW` → `APPROVED`), naming rules apply.
5. **Payment method** on the WABA (credit card or Meta invoicing) before any paid template leaves the test number.
6. **Business verification** (optional for pilot, required for 2,000+ tier): legal documents, website/domain proof. Usually days, sometimes weeks.
7. **Message templates**: created in WhatsApp Manager or via Business Management API; auto-review "up to 24 h"; status `APPROVED` / `REJECTED` / `PAUSED`. Language code: `es_AR` is a supported locale (`es`, `es_ES`, `es_MX` also exist).
8. **Webhook**: public HTTPS URL; one-time `GET` handshake echoing `hub.challenge` after checking `hub.verify_token`; subscribe the app to the `messages` field of the WABA.

Environment mapping: `dev`/`qa` → test number (5 recipients, free); `prod` → real number. Each Firebase project holds its own token / phone-number-id / verify token / app secret as Secret Manager secrets.

## 5. API mechanics that shape the code

- Send: `POST https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}/messages`, bearer token. Types we need: `text`, `interactive` (`button`, `list`), `template`. Response carries `messages[0].id` (wamid) — persist it to correlate status webhooks.
- Template send: `template.name`, `template.language.code`, `components[]` with `body` parameters (positional `{{1}}` or named) and optional `button` quick-reply payloads.
- Webhook POST body: `entry[].changes[].value` with either `messages[]` (inbound; `from` = sender wa_id, `type`, `text.body`, `interactive.button_reply.id`, `interactive.list_reply.id`) or `statuses[]` (`sent` / `delivered` / `read` / `failed` with `errors[]`). Both share the same URL.
- **Signature**: header `X-Hub-Signature-256: sha256=<HMAC-SHA256(rawBody, APP_SECRET)>`. Must be computed on the **raw** body; Cloud Functions `onRequest` exposes `req.rawBody` (Buffer). Compare with `crypto.timingSafeEqual`.
- Reply **200 quickly** (<~5 s) or Meta retries; retries mean **duplicate deliveries** → dedupe by `messages[].id` / `statuses[].id`.
- Default throughput 80 messages/s per number — irrelevant at our scale.
- Mark-as-read is optional cosmetic (`status: "read"` on the inbound wamid).

## 6. Argentina phone-number gotcha

- WhatsApp IDs are E.164 digits without `+`. Argentine **mobiles** on WhatsApp are `54 9 <area> <number>` (the `9` is mandatory, the local `15` prefix must be dropped): `011 15 1234-5678` → `5491112345678`.
- Meta's webhook `contacts[].wa_id` may differ from the number we typed (`input`); store the `wa_id` Meta returns, not the raw input.
- The totem/mi-turno phone field needs a normaliser + validator for this; this is the most common source of "message never arrived" bugs for AR deployments.

## 7. Error codes to handle explicitly

| Code | Meaning | What we do |
|------|---------|-----------|
| `131026` | Recipient isn't a WhatsApp user / undeliverable | Mark contact unreachable, stop sending to it, tell the customer on screen when possible |
| `131047` | Outside 24 h window, template required | Code bug: we sent free-form when we needed a template |
| `132001` | Template missing / not approved for that language | Deploy-time misconfiguration; alert |
| `132000` | Parameter count mismatch | Code bug |
| `132015` | Template paused for low quality | Alert admin; degrade gracefully |
| `130429` / `80007` | Throughput / WABA rate limit | Retry with backoff |
| `131056` | Too many messages to same recipient | Back off per recipient |
| `131049` | Meta withheld delivery (engagement limits) | Log, don't retry |

Also the `statuses[].status = "failed"` webhook with the same codes for asynchronous failures.

## 8. Policy & privacy constraints

- **Opt-in is mandatory** for business-initiated messages: the consent must name the business and state they'll receive messages (since Nov 2024 it no longer has to say "via WhatsApp"). Capturing a phone number on a form with a clear "Avisarme por WhatsApp" checkbox/label satisfies it. Store `consentAt` + `source`.
- Only **transactional** content (ticket called, appointment reminder) qualifies as `utility`; anything promotional would be reclassified as `marketing` (5× price, stricter limits). Keep templates strictly about the customer's own turn.
- **PII**: `turns` is publicly readable in `firestore.rules` (Totem/Display listeners). Phone numbers must **not** be stored on the `turns` document; they belong in a separate, default-denied collection keyed by turn/appointment id. `appointments.contact` already exists and is already non-public.
- Argentina: Ley 25.326 (habeas data) — phone is personal data; keep retention short (purge contact docs when the turn/appointment closes + N days).

## 9. Design implications carried into the plan

1. Customer-initiated conversations (QR / `wa.me` link at totem, mi-turno, booking confirmation) are the cheapest and policy-simplest entry: they open the window and give us the `wa_id` with no normalisation risk.
2. Business-initiated pings are templates, cost ~US$0.02 each, and are capped at 250 unique recipients/day until verification → budget ≤3 per turn and ≤2 per appointment.
3. Sends must be **asynchronous** to the queue/agenda transactions (Firestore triggers), so a Meta outage never blocks a cashier calling the next ticket.
4. Everything must be idempotent (webhook retries) and record `wamid` + status for support.
5. Secrets via `defineSecret` (new to this repo, but the standard v2 mechanism), one set per Firebase project.

## Sources

- Meta — Pricing: https://developers.facebook.com/docs/whatsapp/pricing
- Meta — Messaging limits: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- Meta — Get started (Cloud API): https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
- Meta — Template fundamentals: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- Meta — Phone numbers: https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers
- Meta — Error codes: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
- Oct-2026 pricing change write-ups: https://www.courier.com/blog/whatsapp-pricing-changes-october-2026 · https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026 · https://www.engagelab.com/blog/whatsapp-business-api-pricing · https://zenvia.com/en/new-whatsapp-business-pricing-rules-for-2026/
- Argentina indicative rates: https://ominiflow.com/whatsapp-api-pricing/argentina
- Webhooks guide (signature, retries): https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices
- Opt-in policy: https://www.cm.com/blog/whatsapp-opt-in/
