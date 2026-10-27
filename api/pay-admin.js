// api/pay-admin.js — sirf admin (Supabase login) ke liye
//   GET  -> latest payment requests
//   POST {action:'create'|'cancel'|'resend'|'mark_offline', ...}
import { requireAdmin, sb, byId, newToken, isEmail, httpError, siteUrl, finalizePayment, emailInvoice, invoiceUrl, gatewayReady } from './_pay-lib.js';
import { gatewayConfigured, gatewayName, cfEnv } from './_gateway.js';
import { q, startRefund } from './_booking-lib.js';
import { enqueueJob, runJobs } from './_mail.js';

const payUrl = (p) => `${siteUrl()}/pay/${p.token}`;
const view = (p) => ({
  ...p,
  payUrl: payUrl(p),
  invoiceUrl: p.status === 'paid' ? invoiceUrl(p) : null,
  expired: p.status === 'created' && new Date(p.expires_at).getTime() < Date.now(),
});
const rupeesToPaise = (v, label) => {
  const n = Math.round(Number(v) * 100);
  if (!Number.isFinite(n) || n < 100 || n > 100000000) throw httpError(400, `${label}: ₹1 se ₹10,00,000 ke beech daalein`);
  return n;
};
const clean = (v, max) => (v === undefined || v === null || v === '' ? null : String(v).trim().slice(0, max));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await requireAdmin(req);

    if (req.method === 'GET') {
      const viewName = String(req.query?.view || '');
      if (viewName === 'bookings') {
        const rows = await sb('guest_bookings?select=*,booking_payments(*)&order=created_at.desc&limit=300');
        return res.status(200).json({ success: true, gateway: { name: gatewayName(), configured: gatewayConfigured(), env: cfEnv() }, items: rows });
      }
      if (viewName === 'emails') {
        const rows = await sb('email_jobs?select=id,kind,status,is_marketing,send_at,sent_at,attempts,last_error,dedupe_key,booking_id,email_contacts(email,full_name,unsubscribed_at,marketing_consent)&order=created_at.desc&limit=300');
        const stats = await sb('email_contacts?select=id&limit=1', { prefer: 'count=exact' }).catch(() => []);
        return res.status(200).json({ success: true, items: rows, contactsSample: stats.length });
      }
      const rows = await sb('payment_requests?select=*&order=created_at.desc&limit=200');
      return res.status(200).json({ success: true, gatewayReady: gatewayReady(), items: rows.map(view) });
    }
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed');
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    if (b.action === 'create') {
      const name = clean(b.guestName, 100);
      if (!name) throw httpError(400, 'Guest ka naam zaroori hai');
      const email = clean(b.guestEmail, 254)?.toLowerCase() || null;
      if (email && !isEmail(email)) throw httpError(400, 'Email sahi nahi hai');
      const amount = rupeesToPaise(b.amount, 'Amount');
      const total = b.total ? rupeesToPaise(b.total, 'Total amount') : null;
      const days = Math.min(Math.max(parseInt(b.expiresDays, 10) || 7, 1), 60);
      const created = await sb('payment_requests', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          token: newToken(),
          booking_id: clean(b.bookingId, 40),
          guest_name: name,
          guest_phone: clean(b.guestPhone, 20),
          guest_email: email,
          room: clean(b.room, 100),
          check_in: clean(b.checkIn, 30),
          guests: clean(b.guests, 10),
          description: clean(b.description, 200),
          amount_paise: amount,
          total_amount_paise: total,
          expires_at: new Date(Date.now() + days * 86400000).toISOString(),
        },
      });
      let row = created[0];
      if (b.offline) {
        const { row: done, mail } = await finalizePayment(row, { method: clean(b.offline.method, 40) || 'Offline', reference: clean(b.offline.reference, 100) });
        return res.status(200).json({ success: true, item: view(done), emailed: Boolean(mail.ok), mailError: mail.ok ? undefined : mail.error });
      }
      return res.status(200).json({ success: true, item: view(row) });
    }

    // ---------- booking system actions ----------
    if (b.action === 'sync_inventory') {
      // Rooms from the admin panel (site_config) -> room_inventory. total_units = room.available.
      const cfg = (await sb('site_config?id=eq.main&select=data'))[0]?.data;
      const rooms = Array.isArray(cfg?.rooms) ? cfg.rooms : [];
      if (!rooms.length) throw httpError(409, 'Admin panel me rooms publish nahi hue hain. Pehle Save/Publish karein.');
      const adv = (b.advancePercent && Number(b.advancePercent) > 0 && Number(b.advancePercent) <= 100) ? Math.round(Number(b.advancePercent)) : null;
      const existing = await sb('room_inventory?select=room_id,advance_percent');
      const keep = Object.fromEntries(existing.map((r) => [r.room_id, r.advance_percent]));
      const body = rooms.map((r) => ({
        room_id: String(r.id),
        room_name: String(r.name),
        total_units: Math.max(0, parseInt(r.available, 10) || 0),
        unit_price_paise: Math.round(Number(r.price) * 100),
        tax_paise_per_night: Math.round((Number(r.tax) || 0) * 100),
        max_guests_per_unit: /dorm/i.test(String(r.name)) ? 1 : Math.max(1, parseInt(String(r.capacity), 10) || 2), // dormitory: 1 guest per bed
        advance_percent: adv ?? keep[String(r.id)] ?? 50,
        active: true,
        updated_at: new Date().toISOString(),
      })).filter((r) => r.unit_price_paise > 0);
      await sb('room_inventory?on_conflict=room_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body });
      return res.status(200).json({ success: true, synced: body.length });
    }

    if (b.action === 'set_advance') {
      const pct = Math.round(Number(b.percent));
      if (!(pct >= 1 && pct <= 100)) throw httpError(400, 'Advance 1 se 100 % ke beech daalein');
      await sb(`room_inventory?room_id=eq.${q(String(b.roomId))}`, { method: 'PATCH', prefer: 'return=minimal', body: { advance_percent: pct, updated_at: new Date().toISOString() } });
      return res.status(200).json({ success: true });
    }

    if (['refund', 'resend_confirmation', 'cancel_booking', 'retry_job'].includes(b.action)) {
      if (b.action === 'retry_job') {
        const job = (await sb(`email_jobs?id=eq.${q(String(b.jobId))}&select=id,dedupe_key,status`))[0];
        if (!job) throw httpError(404, 'Job nahi mila');
        if (!['failed', 'skipped'].includes(job.status)) throw httpError(409, 'Sirf failed/skipped job dobara queue hota hai');
        await sb(`email_jobs?id=eq.${job.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'queued', attempts: 0, last_error: null, send_at: new Date().toISOString() } });
        const r = await runJobs({ keys: [job.dedupe_key] });
        return res.status(200).json({ success: true, result: r.results[0] || null });
      }
      const booking = (await sb(`guest_bookings?id=eq.${q(String(b.bookingId))}&select=*,booking_payments(*)`))[0];
      if (!booking) throw httpError(404, 'Booking nahi mili');
      const paid = (booking.booking_payments || []).find((p) => p.status === 'success' && p.raw_status === 'SUCCESS');

      if (b.action === 'resend_confirmation') {
        if (!paid || !['confirmed', 'completed'].includes(booking.status)) throw httpError(409, 'Sirf confirmed booking ka mail dobara jata hai');
        const email = clean(b.email, 254)?.toLowerCase();
        if (email) {
          if (!isEmail(email)) throw httpError(400, 'Email sahi nahi hai');
          await sb(`guest_bookings?id=eq.${booking.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { guest_email: email } });
        }
        const contact = (await sb(`email_contacts?last_booking_id=eq.${booking.id}&select=id`))[0] || (await sb(`email_contacts?email_lower=eq.${q((email || booking.guest_email).toLowerCase())}&select=id`))[0];
        if (!contact) throw httpError(409, 'Contact nahi mila');
        const key = `booking_confirmed:resend:${booking.id}:${Date.now()}`;
        await enqueueJob({ contactId: contact.id, bookingId: booking.id, kind: 'booking_confirmed', key });
        const r = await runJobs({ keys: [key] });
        const ok = r.results[0]?.result === 'sent';
        return res.status(ok ? 200 : 502).json({ success: ok, error: ok ? undefined : r.results[0]?.error || r.results[0]?.reason || 'Mail nahi gaya' });
      }

      if (b.action === 'refund') {
        if (!paid) throw httpError(409, 'Is booking me koi successful payment nahi hai');
        const amount = b.amount ? rupeesToPaise(b.amount, 'Refund amount') : paid.amount_paise;
        const out = await startRefund(paid, amount, clean(b.reason, 200) || 'Admin refund', { kind: 'refund_notice' });
        return res.status(200).json({ success: true, ...out });
      }

      if (b.action === 'cancel_booking') {
        if (['cancelled', 'refunded', 'completed'].includes(booking.status)) throw httpError(409, 'Ye booking pehle hi band hai');
        await sb(`guest_bookings?id=eq.${booking.id}&status=in.(pending,confirmed,expired)`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'cancelled', cancel_reason: clean(b.reason, 200) || 'Admin cancelled', updated_at: new Date().toISOString() } });
        await sb(`email_jobs?booking_id=eq.${booking.id}&status=eq.queued&kind=in.(pre_arrival,thank_you)`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'skipped', last_error: 'booking cancelled' } });
        let refund = null;
        if (b.refund && paid) {
          const amount = b.amount ? rupeesToPaise(b.amount, 'Refund amount') : paid.amount_paise;
          refund = await startRefund(paid, amount, clean(b.reason, 200) || 'Booking cancelled', { kind: 'refund_notice' });
        }
        return res.status(200).json({ success: true, refund });
      }
    }

    const row = b.id ? await byId(String(b.id)) : null;
    if (!row) throw httpError(404, 'Payment request nahi mili');

    if (b.action === 'cancel') {
      if (row.status !== 'created') throw httpError(409, 'Sirf pending link cancel ho sakta hai');
      await sb(`payment_requests?id=eq.${row.id}&status=eq.created`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'cancelled' } });
      return res.status(200).json({ success: true });
    }

    if (b.action === 'mark_offline') {
      if (row.status !== 'created') throw httpError(409, 'Ye payment pehle hi paid ya band hai');
      const email = clean(b.email, 254)?.toLowerCase();
      if (email) {
        if (!isEmail(email)) throw httpError(400, 'Email sahi nahi hai');
        await sb(`payment_requests?id=eq.${row.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { guest_email: email } });
      }
      const { row: done, mail } = await finalizePayment(row, { method: clean(b.method, 40) || 'Offline', reference: clean(b.reference, 100) });
      return res.status(200).json({ success: true, item: view(done), emailed: Boolean(mail.ok), mailError: mail.ok ? undefined : mail.error });
    }

    if (b.action === 'resend') {
      if (row.status !== 'paid') throw httpError(409, 'Invoice sirf paid payment ka hota hai');
      const email = clean(b.email, 254)?.toLowerCase();
      let cur = row;
      if (email) {
        if (!isEmail(email)) throw httpError(400, 'Email sahi nahi hai');
        await sb(`payment_requests?id=eq.${row.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { guest_email: email } });
        cur = await byId(row.id);
      }
      const mail = await emailInvoice(cur, { force: true });
      return res.status(mail.ok ? 200 : 502).json({ success: Boolean(mail.ok), error: mail.ok ? undefined : mail.error });
    }
    throw httpError(400, 'Unknown action');
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('pay-admin failed:', e.message, e.details || '');
    return res.status(e.status || 500).json({ success: false, error: e.message });
  }
}
