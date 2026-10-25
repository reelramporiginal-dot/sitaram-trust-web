// api/pay-webhook.js — Razorpay webhook (backup: agar guest ka browser payment ke baad band ho jaye)
// Razorpay Dashboard -> Settings -> Webhooks: URL https://shrisitaramsevatrust.com/api/pay-webhook
// Events: payment.captured, order.paid | Secret = RAZORPAY_WEBHOOK_SECRET
import { sb, rzp, verifyWebhookSignature, finalizePayment } from './_pay-lib.js';

async function readRaw(req) {
  // req.body ko chhue bina pehle raw stream padhte hain (signature ke liye exact bytes chahiye)
  const chunks = [];
  try {
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  } catch {
    /* stream pehle hi consume ho chuki */
  }
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  return typeof req.body === 'string' ? req.body : req.body ? JSON.stringify(req.body) : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const raw = await readRaw(req);
    const sig = req.headers['x-razorpay-signature'];
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).json({ ok: false, error: 'RAZORPAY_WEBHOOK_SECRET set nahi hai' });
    if (!verifyWebhookSignature(raw, sig)) return res.status(401).json({ ok: false, error: 'Bad signature' });

    const event = JSON.parse(raw);
    if (!['payment.captured', 'order.paid'].includes(event.event)) return res.status(200).json({ ok: true, ignored: event.event });

    const entity = event.payload?.payment?.entity;
    if (!entity?.id) return res.status(200).json({ ok: true, ignored: 'no payment' });

    // Sachchai Razorpay se dubara poochte hain (webhook ke data par akela bharosa nahi)
    const pay = await rzp(`/payments/${encodeURIComponent(entity.id)}`);
    if (pay.status !== 'captured' || !pay.order_id) return res.status(200).json({ ok: true, ignored: `status ${pay.status}` });

    const rows = await sb(`payment_requests?razorpay_order_id=eq.${encodeURIComponent(pay.order_id)}&select=*`);
    const row = rows[0];
    if (!row) return res.status(200).json({ ok: true, ignored: 'order hamari nahi' });
    if (pay.amount !== row.amount_paise) return res.status(200).json({ ok: true, ignored: 'amount mismatch' });

    await finalizePayment(row, { paymentId: pay.id, method: pay.method });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('pay-webhook failed:', e.message, e.details || '');
    return res.status(500).json({ ok: false }); // Razorpay dobara try karega
  }
}
