# WhatsApp Integration — v1 Feature List

Customer-facing scope for the first WhatsApp Business API integration. Derived from a functional analysis debate covering the existing data model (`Turn`, `TurnStatus`, `Channel`), the original multi-channel design intent (`project-specs.md`, README `Phase 14`), and known gaps (`docs/functional-ux-review-2026-08-04.md`, `docs/app-review-2026-08-04.md`).

## v1 features

1. **Take a ticket via WhatsApp** — join a queue remotely, skip the physical walk-up. Core value for anyone who can't stand around waiting (this system's base skews elderly/PAMI).
2. **Show queue length, then confirm** — before creating the ticket, tell the customer how many people are ahead so they can decide if it's worth coming. Shown as a count, not a time estimate — no reliable service-time history to predict from yet.
3. **Recall alert** — notify the customer the instant they're called. Frees them from watching the public display screen.
4. **Position heads-up** (e.g. "you're 5th") — for anyone who took a ticket via WhatsApp or registered a phone, even from the totem. Deliberately a raw position count, not an ETA: walk-up service time is too variable to predict reliably, and a wrong ETA causes the exact problem this is meant to prevent (customer arrives late, thinking they had more time).
5. **On-demand position check** — "where am I" on customer request. Pull-based, so no spam/cost risk from unsolicited pings.
6. **No-show notify (passive only)** — tell the customer what happened (bumped back N spots, or ticket released) when staff makes the normal no-show call. No auto-timeout or automation replacing staff judgment — that was considered and cut as overengineering (staff already has better information than a phone timer).
7. **Remote cancel** — give up a spot by text, no trip needed.

## Explicitly out of scope for v1

- **Ticket recoverability via phone number** — not a separate feature. It's a free side effect of #1 (a WhatsApp ticket is inherently keyed to a phone number). The underlying real bug (totem ticket ID lives in `localStorage`, unrecoverable from a different browser/device) is a **totem bug**, not a WhatsApp feature — track separately.
- **ETA-based notifications** — rejected in favor of raw position counts (see #4).
- Take a ticket on someone's behalf, practical info in the confirmation, one-reply rebooking, closure/delay broadcast, priority/PAMI-aware routing, opt-out control — real value, deferred to v2.
- Post-service CSAT — mostly benefits the business, not the customer; low priority.
- QR-to-WA totem shortcut, predictive demand-shaping bot — speculative, no grounding in an observed gap.

## Known open questions

- WhatsApp Business account ownership + Meta template approval process.
- Per-conversation messaging budget/cost ceiling.
