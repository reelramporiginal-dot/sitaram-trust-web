// api/pay-invoice.js — GET ?t=TOKEN : paid payment ka printable invoice page
import { byToken, invoicePage, esc } from './_pay-lib.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    const p = req.query?.t ? await byToken(String(req.query.t)) : null;
    if (!p || p.status !== 'paid' || !p.invoice_no) {
      return res.status(404).send(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px;"><h2>${esc('Invoice nahi mila')}</h2></body>`);
    }
    return res.status(200).send(invoicePage(p));
  } catch (e) {
    console.error('pay-invoice failed:', e.message);
    return res.status(500).send('<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px;">Server error</body>');
  }
}
