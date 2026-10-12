# WhatsApp Integration — Functional Spec v2 (appointments only, 2026-10-10)

Supersedes v1 of this file (walk-in + appointments) after review with product-manager and skeptic agents. Platform constraints in `docs/whatsapp-platform-research-2026-10-10.md`. Technical design in `docs/whatsapp-technical-plan-2026-10-10.md`.

## 1. Scope decision

**In:** WhatsApp for appointments (Agenda de Citas): confirmation at booking, reminder the evening before with a cancel button, opt-out.

**Out (and why):**
- Walk-in alerts ("te están llamando"). If the customer is in the room the message is redundant; if they're out, it's too late. The only useful variant ("3 ahead") depends on a volatile pace estimate and on an unproven linking step; Mi Turno already shows position + ETA to anyone with a smartphone.
- Taking a ticket via WhatsApp. Queue-picking by chat is where elderly users drop; one-turn-per-phone blocks helpers; stray texts become ghost tickets.
- Conversational bot of any kind. Any text that isn't a button reply or a keyword gets one fixed answer.
- Appointment "called"/"no-show" notices. Customer is on-site at a known time; `/agenda/pantalla` already announces them.
- Walk-in appetite, if ever wanted, is measured first with a plain QR to `/mi-turno/:id` on the Totem — no WhatsApp needed.

## 2. Value

Nothing reminds anyone of an appointment today. A `no_show` costs staff a call + recall + a manual decision and leaves a slot nobody can rebook. The reminder lands the evening before, when the customer (or the relative who booked for them) can still act, and "Cancelar" frees the slot automatically. This is the one place WhatsApp does something the product cannot do today.

## 3. Users

- **Customer / family helper booking online.** Leaves a mobile, gets confirmation + reminder, cancels with a tap.
- **Staff (Agenda del día).** Sees a WhatsApp badge on rows that were reminded. No new actions.
- **Admin.** Sees no-show and cancellation counts, split by "had WhatsApp" vs not.

## 4. User stories

- US1 As someone booking a cita, I leave my mobile and get a confirmation I can keep.
- US2 The evening before, I get a reminder with "Cancelar cita"; if I can't make it, one tap frees the slot.
- US3 If I reply BAJA, I never hear from the number again.
- US4 If WhatsApp is down or my number isn't on WhatsApp, my booking is unaffected.
- US5 As staff, I know which customers were reminded.

## 5. Functional requirements

### 5.1 Booking form (`app/src/views/AppointmentBookingView.tsx`)
- FR-1 Replace "Contacto (opcional)" with **"Celular para avisos por WhatsApp (opcional)"**, hint "Código de área sin 0 y número sin 15, ej. 11 5555 1234". Filling it **is** the consent (Meta opt-in: names the business and the purpose). No checkbox.
- FR-2 Under the field, one line: "Usamos tu número solo para avisarte de esta cita. Podés pedir la baja respondiendo BAJA." (Ley 25.326 notice: purpose + how to opt out.)
- FR-3 Client validates 10 digits after stripping non-digits; server normalizes to `549XXXXXXXXXX` and rejects anything else with 400.
- FR-4 Confirmation screen adds: "Si no te llega un WhatsApp en unos minutos, guardá este enlace."

### 5.2 Messages
- FR-5 **Confirmation** on successful booking with a phone: template `cita_confirmacion` (es_AR, utility) — name, service, long date, time, code; URL button "Ver cita" → `/agenda/{id}?memberNumber={n}`.
- FR-6 **Reminder** at 18:00 ART the day before, for `reservada` appointments with a phone and no opt-out: template `cita_recordatorio` — quick-reply **"Cancelar cita"** (payload `cancel_appt:{id}`) + URL **"Ver / reprogramar"**. Idempotent per appointment + date (a rescheduled cita is reminded again for its new date; one rescheduled to tomorrow after 18:00 is not — accepted).
- FR-7 **Cancel flow**: button tap → verify sender phone matches `appointment.phone` (both `549…`/`54…` forms) and status `reservada` → "¿Confirmás cancelar la cita del {fecha} a las {hora}? Respondé SÍ." → `SÍ`/`SI` → `cancelAppointment` → "Cita cancelada. Podés reservar otra en {link}." Any other reply → "No cancelamos nada." Mismatch or wrong status → "Esa cita ya no se puede cancelar desde acá."
- FR-8 **Opt-out**: `BAJA`/`STOP`/`BASTA` → `optedOut = true`, one confirmation, no further sends to that phone. Any later non-opt-out message clears it.
- FR-9 **Everything else** (free text, media, audio) → one fixed reply per phone per 24 h: "Este número solo manda avisos de citas. Para consultas: {teléfono del local}, {horario}." Nothing else.
- FR-10 Messages are sent after the business write commits and never block or fail it. Failure → logged, status `failed`, no retry.

### 5.3 Staff & admin
- FR-11 `AppointmentAgendaView`: badge "WhatsApp" when `appointment.phone` is set. Number not shown.
- FR-12 Daily appointments rollup (new): per service per date, counts by final status and by `hadPhone` true/false. Feeds the pilot metric: no-show rate with vs without WhatsApp.

### 5.4 Data & privacy
- FR-13 Phone lives on `appointments` (already staff-only) and in `whatsappContacts/{phone}` (opt-out flag, last inbound id). No phone ever touches public collections.
- FR-14 Nightly purge: `appointments.phone` removed 7 days after the cita is `finalizada|cancelada|no_show`; `whatsappMessages` older than 90 days deleted; `whatsappContacts` with no activity in 180 days deleted unless `optedOut` (opt-outs are kept).

## 6. Acceptance criteria
- [ ] Booking with "11 5555 1234" → `phone == "5491155551234"`, `contact` absent, confirmation template sent with correct params and URL button.
- [ ] Booking with "011 15 5555 1234" → 400 client- and server-side with the hint.
- [ ] Booking without phone → no message, no `whatsappMessages` doc.
- [ ] Reminder job for tomorrow's `reservada` with phone → one template each; rerun → zero sends; `cancelada`/`no_show`/no phone/opted-out → none.
- [ ] Tap "Cancelar cita" → confirm prompt with date/time; `si` → `cancelada`, `cancelledAt` set, slot visible again in `getAvailableSlots`.
- [ ] Tap from a phone that isn't `appointment.phone` → rejection line, nothing changes.
- [ ] `BAJA` → confirmation; next day's reminder for that phone not sent; a later "hola" clears the flag.
- [ ] Random text / audio → the fixed reply once; a second text within 24 h → silence.
- [ ] Graph API down (mock 5xx) → booking still 201; `whatsappMessages.status == "failed"`; error in Cloud Logging.
- [ ] `GET` verify with right token → 200 challenge; wrong → 403. `POST` bad signature → 403; duplicate message id → one state change.
- [ ] Purge job removes phone 7 days after close; opted-out contacts survive.
- [ ] Agenda del día shows the badge only for rows with a phone.

## 7. Edge cases
- Number not on WhatsApp → Meta error `131026`, logged `failed`; customer relies on the web link (FR-4). Accepted v1 gap.
- Two citas, same phone (helper booking for two relatives) → two reminders, each button carries its own id. Fine.
- Reply "SÍ" with no pending cancel → fixed reply (FR-9).
- Customer reschedules via the URL after the reminder → reminded again before the new date.
- Meta webhook retry → dedupe by `lastInboundMessageId`.
- Template rejected or paused by Meta → sends fail with `132001`/`132015`; booking unaffected; ops alert.

## 8. Copy (es_AR)
- `cita_confirmacion`: "Hola {{1}}. Tu cita de {{2}} quedó reservada para el {{3}} a las {{4}}. Código: {{5}}." Button: Ver cita.
- `cita_recordatorio`: "Hola {{1}}, te recordamos tu cita de {{2}} mañana {{3}} a las {{4}}. Si no podés venir, cancelá para liberar el lugar." Buttons: Cancelar cita · Ver / reprogramar.
- Confirm cancel: "¿Confirmás cancelar la cita del {fecha} a las {hora}? Respondé SÍ."
- Cancelled: "Cita cancelada. Podés reservar otra en {link}."
- Opt-out: "Listo, no te escribimos más."
- Fallback: "Este número solo manda avisos de citas. Para consultas: {teléfono}, {horario}."

## 9. Impact (README + Bruno in the same change)
- `Appointment.phone?` added, `contact` deprecated. `createAppointment` body: `phone?` replaces `contact?`.
- New collections `whatsappContacts`, `whatsappMessages`, `appointmentDailyStats`. New function `whatsappWebhook`; scheduled `appointmentReminders` (18:00 ART), `whatsappPurge` (03:30 ART), `appointmentStatsRollup` (03:00 ART).
- Business rules unchanged. No-show stays manual.

## 10. Open questions
1. Dedicated new number for the WABA? (recommended yes)
2. Who provides CUIT/legal docs for Meta, and when?
3. Branch phone + hours for the fallback reply?
4. Drop `contact` from the form entirely? (assumed yes)
5. Who signs off the Spanish copy before Meta submission?
