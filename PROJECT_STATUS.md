# PROJECT_STATUS.md — Shri Sitaram Seva Trust (sitaram-trust-web)

_Last updated: 2026-10-26. Rule: a milestone is "Frozen" only after the owner has run its walkthrough (PAYMENT_BIBLE.md section 14)._

## Milestones

| Phase | Scope | Code | Owner walkthrough |
|---|---|---|---|
| P0 Foundation | SQL committed, `.env.example`, README fix, CI, policy pages, cron-secret fix, security headers | Written | Pending |
| P1 Server core | `room_inventory` sync, `reserve_room`, quote, create, retry, status, gateway adapter (Cashfree), webhook, finalize, reconcile cron | Written | Pending (needs sandbox keys) |
| P2 UI | Book & Pay on every room card, `BookPayModal`, `/booking/:ref`, admin Bookings page | Written | Pending |
| P3 Transactional email + invoice | confirmation + invoice, admin alert, refund/apology notices | Written | Pending (needs verified sending domain) |
| P4 Email queue + cron | contacts, consent, jobs, worker, pre-arrival, thank-you, festival, unsubscribe | Written | Pending |
| P5 Hardening | rate limits, Turnstile (optional), alerts, runbook | Partly (see Open items) | Pending |

Nothing is Frozen yet.

## Run order (owner)
1. Supabase SQL editor: `db/sql/001` -> `002` -> `003` -> `004` -> `005` (all safe to re-run).
2. Vercel env: every name in `.env.example` (sandbox first).
3. Admin panel > Rooms > Save (syncs `room_inventory`); check Admin > Bookings.
4. Cashfree: webhook URL `https://<domain>/api/pay-webhook`.
5. cron-job.org: three jobs with `Authorization: Bearer <CRON_SECRET>`.
6. `node scripts/race-test.mjs` (10-way race), then the section 14 walkthrough.

## Decisions made (assumptions, change if wrong)
- Advance default 50% per room (`room_inventory.advance_percent`, editable via admin action `set_advance`).
- Tax = existing `room.tax` per night per room, as set in the admin panel.
- `total_units` = the Rooms tab "available" number. Treat it as the physical count (it is no longer decremented by hand).
- Dormitory: 1 guest per bed, up to 30 beds per booking.
- Refund tiers (100% / 50% / 0 at 7 / 3 / 0 days) are **proposed** in `data/hotelPolicy.json`; the owner must confirm.
- Vercel Hobby 12-function limit: booking endpoints share `api/booking.js`, cron endpoints share `api/cron.js` (clean URLs via `vercel.json` rewrites). Total functions: 8.
- Razorpay stays only for admin-made `/pay/:token` links. Online booking uses Cashfree only (`PAYMENT_GATEWAY=razorpay` is not implemented for bookings).
- Public `public/vercel.json` removed (stray file; the root `vercel.json` is the real config).

## Open items / not built
- Resend bounce/complaint webhook (column `email_contacts.email_status` exists and is honoured; nothing sets it yet).
- Cashfree webhook timestamp freshness is not enforced (replays are harmless: every event is re-verified against the gateway).
- No GST breakup logic beyond showing tax as a line; GST treatment/GSTIN is the owner/CA's call.
- Web3Forms / CallMeBot calls for the old enquiry form are still client-side in `Home.tsx` (separate from the paid flow).
- Admin password in the old README must be rotated in Supabase (owner action).
- Policy page wording needs owner/CA/lawyer review before gateway KYC.
- Domain verification (SPF, DKIM, DMARC) and `MAIL_FROM`: owner action.
