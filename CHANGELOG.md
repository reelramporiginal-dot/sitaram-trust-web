# CHANGELOG

## 2026-10-26 — Booking + Cashfree payment system (P0-P4 code)
### Added
- `db/sql/001-005`: bookings, payments, inventory (`room_inventory`), `quote_room`, `reserve_room` (advisory lock, 20-min hold), email contacts/jobs, rate limiter, `finalize_booking_payment`, `finalize_refund`; migration of existing `payment_requests`.
- API: `booking.js` (quote/create/retry/status/invoice), `cron.js` (reconcile / send-emails / enqueue-greetings), `unsubscribe.js`, `_gateway.js` (Cashfree adapter), `_booking-lib.js`, `_mail.js`.
- UI: "Book & Pay" + WhatsApp buttons on every room card, 3-step `BookPayModal`, `/booking/:ref` status page, admin `/admin/bookings`, Privacy / Terms / Refund / Contact pages and footer links.
- Tests (`tests/`), 10-way race script (`scripts/race-test.mjs`), CI workflow, `.env.example`, `data/hotelPolicy.json`, `data/greetingCalendar.json`.
### Changed
- `api/pay-webhook.js` now serves Cashfree and Razorpay (selected by signature header).
- `api/_pay-lib.js`: exports for reuse, neutral invoice URL, tax rows on invoice, `sendMail` supports headers.
- `api/post-facebook.js`: cron secret is Bearer-only, `timingSafeEqual`, 503 when unset (no `?key=`).
- `vercel.json`: rewrites, security headers (CSP report-only), function config. README: credentials removed.
- Admin "Save" now also syncs `room_inventory`.
### Removed
- `public/vercel.json` (stray duplicate).
