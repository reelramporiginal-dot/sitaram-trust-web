// api/pay-admin.js — sirf admin (Supabase login) ke liye
//   GET  -> latest payment requests
//   POST {action:'create'|'cancel'|'resend'|'mark_offline', ...}
import { requireAdmin, sb, byId, newToken, isEmail, httpError, siteUrl, finalizePayment, emailInvoice, invoiceUrl, gatewayReady } from './_pay-lib.js';

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
