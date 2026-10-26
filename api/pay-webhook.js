// ROOT PATH: api/pay-webhook.js
// One URL, two gateways (so the Razorpay dashboard URL for admin payment links keeps working):
//   x-webhook-signature  -> Cashfree  (room bookings)      Dashboard: https://<site>/api/pay-webhook
//   x-razorpay-signature -> Razorpay  (admin /pay/:token links, unchanged behaviour)
// Rules: verify HMAC on the RAW body (R4); never trust the payload - re-fetch from the gateway (R2);
// unknown order -> 200 ignore; our DB/gateway error -> 5xx so the gateway retries.
import { sb, rzp, verifyWebhookSignature, finalizePayment } from './_pay-lib.js';
import { verifyWebhook } from './_gateway.js';
import { q, syncOrder, syncRefund } from './_booking-lib.js';
import { notifyAdmin } from './_mail.js';

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

async function cashfree(req, res, raw) {
  if (!process.env.CASHFREE_SECRET_KEY) return res.status(503).json({ ok: false, error: 'CASHFREE_SECRET_KEY set nahi hai' });
  if (!verifyWebhook(raw, req.headers)) return res.status(400).json({ ok: false, error: 'Bad signature' });

  const event = JSON.parse(raw);
  const type = String(event.type || '');

  if (type.startsWith('PAYMENT_') && type.endsWith('_WEBHOOK')) {
    const orderId = event.data?.order?.order_id;
    if (!orderId) return res.status(200).json({ ok: true, ignored: 'no order' });
    const r = await syncOrder(String(orderId)); // re-fetches from Cashfree; payload is only a hint
    if (r.result === 'UNKNOWN_ORDER') return res.status(200).json({ ok: true, ignored: 'order hamari nahi' });
    return res.status(200).json({ ok: true, result: r.result });
  }

  if (type === 'REFUND_STATUS_WEBHOOK') {
    const orderId = event.data?.refund?.order_id || event.data?.order?.order_id;
    if (!orderId) return res.status(200).json({ ok: true, ignored: 'no order' });
    const pay = (await sb(`booking_payments?gateway_order_id=eq.${q(String(orderId))}&select=*`))[0];
    if (!pay) return res.status(200).json({ ok: true, ignored: 'order hamari nahi' });
    await syncRefund(pay);
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true, ignored: type || 'unknown' });
}

async function razorpay(req, res, raw) {
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
  if (pay.amount !== row.amount_paise) {
    await notifyAdmin('Razorpay amount mismatch (payment link)', { order: pay.order_id, expected: row.amount_paise, got: pay.amount });
    return res.status(200).json({ ok: true, ignored: 'amount mismatch' });
  }

  await finalizePayment(row, { paymentId: pay.id, method: pay.method });
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const raw = await readRaw(req);
    if (req.headers['x-webhook-signature']) return await cashfree(req, res, raw);
    if (req.headers['x-razorpay-signature']) return await razorpay(req, res, raw);
    return res.status(400).json({ ok: false, error: 'Unknown webhook source' });
  } catch (e) {
    console.error('pay-webhook failed:', e.message, e.details ? JSON.stringify(e.details) : '');
    return res.status(500).json({ ok: false }); // gateway dobara try karega
  }
}
