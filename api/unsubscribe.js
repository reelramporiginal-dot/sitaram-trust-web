// ROOT PATH: api/unsubscribe.js
// GET  ?t=TOKEN  -> confirmation page with one button (so mail scanners that prefetch links cannot unsubscribe people)
// POST ?t=TOKEN  -> unsubscribes (also the RFC 8058 one-click target used by List-Unsubscribe-Post)
import { sb, esc, HOTEL } from './_pay-lib.js';
import { q, rateLimit, clientIp } from './_booking-lib.js';

const page = (title, body) =>
  `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f1e8dc;font-family:Arial,sans-serif;"><div style="max-width:460px;margin:60px auto;background:#fff;border:1px solid #eadfce;border-radius:14px;padding:28px;text-align:center;">
<div style="font-size:12px;letter-spacing:2px;color:#b7812d;font-weight:bold;">${esc(HOTEL.nameEn.toUpperCase())}</div>${body}</div></body></html>`;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const token = String(req.query?.t || '');
  try {
    await rateLimit(`unsub:${clientIp(req)}`, 30, 600, { failOpen: true });
    if (!/^[a-f0-9]{16,64}$/i.test(token)) return res.status(400).send(page('Link sahi nahi', '<h2>Link sahi nahi hai</h2>'));
    const rows = await sb(`email_contacts?unsubscribe_token=eq.${q(token)}&select=id,unsubscribed_at`);
    const c = rows[0];
    if (!c) return res.status(404).send(page('Link sahi nahi', '<h2>Link sahi nahi hai</h2>'));

    if (req.method === 'POST') {
      if (!c.unsubscribed_at) {
        await sb(`email_contacts?id=eq.${c.id}&unsubscribed_at=is.null`, { method: 'PATCH', prefer: 'return=minimal', body: { unsubscribed_at: new Date().toISOString() } });
        await sb(`email_jobs?contact_id=eq.${c.id}&is_marketing=eq.true&status=eq.queued`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'skipped', last_error: 'unsubscribed' } });
      }
      return res.status(200).send(page('Unsubscribed', '<h2 style="color:#4b0718;">Aap unsubscribe ho gaye hain</h2><p style="color:#6b5560;">Ab aapko offers ya festival wishes ke mail nahi aayenge. Booking se jude zaroori mail (confirmation, invoice) aate rahenge.</p>'));
    }
    if (req.method === 'GET') {
      if (c.unsubscribed_at) return res.status(200).send(page('Unsubscribed', '<h2 style="color:#4b0718;">Aap pehle hi unsubscribe ho chuke hain</h2>'));
      return res.status(200).send(page('Unsubscribe', `<h2 style="color:#4b0718;">Offers aur wishes band karein?</h2><p style="color:#6b5560;">Booking confirmation aur invoice jaise zaroori mail phir bhi aayenge.</p><form method="POST" action="/api/unsubscribe?t=${esc(token)}"><button style="background:#4b0718;color:#f5d891;border:0;border-radius:999px;padding:13px 30px;font-weight:bold;font-size:15px;cursor:pointer;">Haan, unsubscribe karein</button></form>`));
    }
    return res.status(405).send(page('Error', '<h2>Method not allowed</h2>'));
  } catch (e) {
    console.error('unsubscribe failed:', e.message);
    return res.status(500).send(page('Error', '<h2>Server error, thodi der baad try karein</h2>'));
  }
}
