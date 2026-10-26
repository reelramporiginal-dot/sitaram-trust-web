// ROOT PATH: api/_gateway.js
// Payment gateway adapter. Cashfree is the booking gateway (PAYMENT_GATEWAY=cashfree).
// Razorpay stays ONLY for the existing admin-made /pay/:token links (api/pay.js, unchanged).
// Cashfree docs re-checked 2026-10-25: POST /pg/orders (x-client-id, x-client-secret, x-api-version),
// webhook signature = base64(HMAC-SHA256(x-webhook-timestamp + rawBody, secret)).
import crypto from 'node:crypto';
import { httpError } from './_pay-lib.js';

export const gatewayName = () => (process.env.PAYMENT_GATEWAY || 'cashfree').toLowerCase();
export const cfEnv = () => (String(process.env.CASHFREE_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox');
const base = () => (cfEnv() === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');
const apiVersion = () => process.env.CASHFREE_API_VERSION || '2025-01-01';

export const gatewayConfigured = () =>
  gatewayName() === 'cashfree' && Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);

// ---------- pure helpers (unit-tested) ----------
export const cfSignature = (timestamp, rawBody, secret) =>
  crypto.createHmac('sha256', secret).update(String(timestamp) + String(rawBody)).digest('base64');

export function verifyCashfreeSignature(rawBody, signature, timestamp, secret) {
  if (!secret || !signature || !timestamp) return false;
  const a = Buffer.from(cfSignature(timestamp, rawBody, secret));
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const paiseToRupees = (paise) => Number((paise / 100).toFixed(2));
export const rupeesToPaise = (r) => Math.round(Number(r) * 100);

// Order status -> our state
export function mapOrderStatus(s) {
  const v = String(s || '').toUpperCase();
  if (v === 'PAID') return 'success';
  if (v === 'EXPIRED' || v === 'TERMINATED' || v === 'TERMINATION_REQUESTED') return 'failed';
  return 'pending'; // ACTIVE
}
export function mapRefundStatus(s) {
  const v = String(s || '').toUpperCase();
  if (v === 'SUCCESS') return 'success';
  if (v === 'CANCELLED' || v === 'FAILED') return 'failed';
  return 'pending'; // PENDING / ONHOLD
}

// ---------- HTTP ----------
async function cf(path, { method = 'GET', body } = {}) {
  const id = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!id || !secret) throw httpError(503, 'Payment gateway abhi set nahi hai (CASHFREE_APP_ID / CASHFREE_SECRET_KEY)');
  const r = await fetch(`${base()}${path}`, {
    method,
    headers: { 'x-client-id': id, 'x-client-secret': secret, 'x-api-version': apiVersion(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw httpError(502, j?.message || `Cashfree error ${r.status}`, { status: r.status, code: j?.code, type: j?.type });
  return j;
}

// order = { orderId, amountPaise, customer:{id,name,email,phone}, returnUrl, notifyUrl, expiresAt(ISO), note }
export async function createOrder(o) {
  const j = await cf('/orders', {
    method: 'POST',
    body: {
      order_id: o.orderId,
      order_amount: paiseToRupees(o.amountPaise),
      order_currency: 'INR',
      customer_details: {
        customer_id: o.customer.id,
        customer_name: o.customer.name,
        customer_email: o.customer.email,
        customer_phone: o.customer.phone,
      },
      order_meta: { return_url: o.returnUrl, notify_url: o.notifyUrl },
      order_expiry_time: o.expiresAt,
      order_note: o.note || undefined,
    },
  });
  if (!j.payment_session_id) throw httpError(502, 'Gateway ne payment session nahi di', j);
  return { orderId: j.order_id, paymentSessionId: j.payment_session_id, status: j.order_status };
}

export async function fetchOrder(orderId) {
  const j = await cf(`/orders/${encodeURIComponent(orderId)}`);
  return { status: mapOrderStatus(j.order_status), rawStatus: j.order_status, amountPaise: rupeesToPaise(j.order_amount), raw: j };
}

// Normalised payment attempts of an order
export async function fetchPayments(orderId) {
  const j = await cf(`/orders/${encodeURIComponent(orderId)}/payments`);
  const list = Array.isArray(j) ? j : [];
  return list.map((p) => ({
    id: String(p.cf_payment_id),
    status: String(p.payment_status || '').toUpperCase(), // SUCCESS | FAILED | PENDING | USER_DROPPED | NOT_ATTEMPTED | CANCELLED | VOID
    amountPaise: rupeesToPaise(p.payment_amount),
    currency: p.payment_currency || 'INR',
    method: p.payment_group || null,
    raw: p,
  }));
}

export async function refund({ orderId, refundId, amountPaise, note }) {
  try {
    const j = await cf(`/orders/${encodeURIComponent(orderId)}/refunds`, {
      method: 'POST',
      body: { refund_amount: paiseToRupees(amountPaise), refund_id: refundId, refund_note: (note || 'Refund').slice(0, 100), refund_speed: 'STANDARD' },
    });
    return { refundId: j.refund_id || refundId, status: mapRefundStatus(j.refund_status), rawStatus: j.refund_status };
  } catch (e) {
    // same refund_id sent twice (retry) -> read the existing one instead of failing
    const existing = await fetchRefund(orderId, refundId).catch(() => null);
    if (existing) return existing;
    throw e;
  }
}

export async function fetchRefund(orderId, refundId) {
  const j = await cf(`/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`);
  return { refundId: j.refund_id || refundId, status: mapRefundStatus(j.refund_status), rawStatus: j.refund_status };
}

export function verifyWebhook(rawBody, headers) {
  return verifyCashfreeSignature(rawBody, headers['x-webhook-signature'], headers['x-webhook-timestamp'], process.env.CASHFREE_SECRET_KEY);
}
