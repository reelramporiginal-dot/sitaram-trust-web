// ROOT PATH: api/_booking-lib.js
// Booking core: validation, rate limits, order creation, gateway sync, finalize side effects, refunds.
// Money rules: R1 server prices (SQL), R2 gateway-verified only, R3 one winner (SQL), R9 never twice.
import { sb, httpError, isEmail, siteUrl, safeEq, sendMail, adminAlertEmail } from './_pay-lib.js';
import * as gw from './_gateway.js';
import { notifyAdmin, enqueueJob, runJobs, bookingInvoiceShape } from './_mail.js';

export const q = encodeURIComponent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rpc = (name, body) => sb(`rpc/${name}`, { method: 'POST', body });

// ---------- request helpers ----------
export function readBody(req, max = 16000) {
  if (Number(req.headers['content-length'] || 0) > max) throw httpError(413, 'Request bahut badi hai');
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  } catch {
    throw httpError(400, 'Request sahi nahi hai');
  }
}
export const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

export async function rateLimit(key, max, windowSec, { failOpen = false } = {}) {
  try {
    const ok = await rpc('hit_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSec });
    if (ok !== true) throw httpError(429, 'Bahut zyada koshish ho gayi. Thodi der baad dobara try karein.');
  } catch (e) {
    if (e.status === 429) throw e;
    console.error('rateLimit error:', e.message);
    if (!failOpen) throw httpError(503, 'Service abhi busy hai, thodi der baad try karein.');
  }
}

export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // optional: enabled only when the key is configured
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: String(token), remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    return j.success === true;
  } catch (e) {
    console.error('turnstile failed:', e.message);
    return false;
  }
}

export function requireCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw httpError(503, 'CRON_SECRET set nahi hai'); // R8 fail closed
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!given || !safeEq(given, secret)) throw httpError(401, 'Unauthorized');
}

// ---------- validation (pure) ----------
export const normPhone = (v) => {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
};
export const isIndianMobile = (d) => /^[6-9]\d{9}$/.test(d);
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const toInt = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);

export function validateStay(b) {
  const roomId = String(b.room_id || '').slice(0, 80);
  if (!roomId) throw httpError(400, 'Room chunein');
  if (!isYmd(b.check_in) || !isYmd(b.check_out)) throw httpError(400, 'Check-in / check-out ki tareekh sahi daalein');
  if (b.check_out <= b.check_in) throw httpError(400, 'Check-out, check-in ke baad hona chahiye');
  const rooms = toInt(b.rooms_count ?? 1);
  const guests = toInt(b.guests);
  if (!(rooms >= 1 && rooms <= 30)) throw httpError(400, 'Rooms / beds 1 se 30 ke beech chunein');
  if (!(guests >= 1 && guests <= 50)) throw httpError(400, 'Guests ki sankhya sahi daalein');
  const payMode = b.pay_mode === 'full' ? 'full' : 'advance';
  return { roomId, checkIn: b.check_in, checkOut: b.check_out, rooms, guests, payMode };
}

export function validateGuest(b) {
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 100) throw httpError(400, 'Apna poora naam daalein');
  const phone = normPhone(b.phone);
  if (!isIndianMobile(phone)) throw httpError(400, '10 digit ka sahi mobile number daalein');
  const email = String(b.email || '').trim().toLowerCase();
  if (!isEmail(email)) throw httpError(400, 'Sahi email daalein (confirmation aur invoice isi par aayega)');
  const marketing = b.marketing_consent === true;
  const consentText = marketing ? String(b.consent_text || '').trim().slice(0, 300) : null;
  if (marketing && !consentText) throw httpError(400, 'Consent text missing');
  return { name, phone, email, marketing, consentText };
}

const SQL_ERR = {
  SOLD_OUT: [409, 'Is date ke liye room available nahi hai. Dusri date ya room chunein.'],
  ROOM_NOT_FOUND: [404, 'Ye room abhi online booking ke liye available nahi hai. Hotel ko call karein.'],
  BAD_DATES: [400, 'Tareekh sahi nahi hai'],
  PAST_DATE: [400, 'Check-in aaj ya uske baad ki date ka hona chahiye'],
  TOO_LONG: [400, 'Ek baar me adhiktam 30 raat tak booking ho sakti hai'],
  TOO_FAR: [400, 'Itni door ki date abhi bookable nahi hai'],
  BAD_ROOMS: [400, 'Rooms ki sankhya sahi nahi hai'],
  BAD_GUESTS: [400, 'Is room me itne guests nahi aa sakte. Rooms badhaiye.'],
  BAD_PAY_MODE: [400, 'Payment option sahi nahi hai'],
};
export function mapSqlError(e) {
  const m = String(e?.message || '');
  for (const k of Object.keys(SQL_ERR)) if (m.includes(k)) return httpError(SQL_ERR[k][0], SQL_ERR[k][1], { code: k });
  return e;
}

// Alert admin at most once per hour per key (cron failures must not spam the inbox)
export async function alertOnce(key, subject, detail) {
  try {
    const ok = await rpc('hit_rate_limit', { p_key: `alert:${key}`, p_max: 1, p_window_seconds: 3600 });
    if (ok !== true) return;
  } catch {
    /* if the limiter itself is down, alert anyway */
  }
  await notifyAdmin(subject, detail);
}

// ---------- lookups ----------
export async function getBooking(ref, token) {
  const rows = await sb(`guest_bookings?booking_ref=eq.${q(String(ref))}&select=*,booking_payments(*)`);
  const b = rows[0];
  if (!b || !safeEq(b.public_token, String(token || ''))) throw httpError(404, 'Booking nahi mili. Link check karein.');
  return b;
}

// ---------- payment start ----------
export async function startPayment(b, amountPaise) {
  if (!gw.gatewayConfigured()) throw httpError(503, 'Online payment abhi chalu nahi hai. Hotel ko call karein.');
  const attempt = (b.booking_payments?.length || 0) + 1;
  const orderId = `${b.booking_ref}-A${attempt}`;
  const inserted = await sb('booking_payments', {
    method: 'POST',
    prefer: 'return=representation',
    body: { booking_id: b.id, gateway: gw.gatewayName(), gateway_order_id: orderId, amount_paise: amountPaise, status: 'created', attempt },
  });
  const row = inserted[0];
  try {
    const order = await gw.createOrder({
      orderId,
      amountPaise,
      customer: { id: `c_${b.id.replace(/-/g, '').slice(0, 20)}`, name: b.guest_name, email: b.guest_email, phone: b.guest_phone },
      returnUrl: `${siteUrl()}/booking/${q(b.booking_ref)}?t=${q(b.public_token)}&order_id={order_id}`,
      notifyUrl: `${siteUrl()}/api/pay-webhook`,
      expiresAt: new Date(b.hold_expires_at).toISOString(),
      note: `Booking ${b.booking_ref}`,
    });
    return { orderId, paymentSessionId: order.paymentSessionId, paymentRowId: row.id };
  } catch (e) {
    await sb(`booking_payments?id=eq.${row.id}&status=eq.created`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'failed', raw_status: 'ORDER_CREATE_FAILED' } }).catch(() => {});
    throw e;
  }
}

// Retry on the same booking: only while the hold is still alive (so inventory is genuinely ours).
export async function extendHold(b, minutes = 20) {
  const rows = await sb(`guest_bookings?id=eq.${b.id}&status=eq.pending&hold_expires_at=gt.${q(new Date().toISOString())}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { hold_expires_at: new Date(Date.now() + minutes * 60000).toISOString(), updated_at: new Date().toISOString() },
  });
  if (!rows.length) throw httpError(410, 'Ye booking ka time khatam ho gaya. Kripya nayi booking karein.');
  return rows[0];
}

// ---------- gateway sync (R2: gateway is the only source of truth) ----------
const DEAD = ['FAILED', 'USER_DROPPED', 'CANCELLED', 'VOID', 'NOT_ATTEMPTED'];

export async function syncOrder(orderId) {
  const rows = await sb(`booking_payments?gateway_order_id=eq.${q(orderId)}&select=*`);
  const pay = rows[0];
  if (!pay) return { result: 'UNKNOWN_ORDER' };
  if (['success', 'refunded'].includes(pay.status)) return { result: 'ALREADY', status: pay.status };

  const payments = await gw.fetchPayments(orderId);
  const ok = payments.find((p) => p.status === 'SUCCESS');
  if (ok) return applySuccess(pay, ok);

  let order = null;
  try {
    order = await gw.fetchOrder(orderId);
  } catch (e) {
    console.error('fetchOrder failed:', e.message);
  }
  if (order?.status === 'success') {
    // gateway says PAID but payment list had no SUCCESS yet: do not guess, let the next run settle it
    return { result: 'PENDING', status: 'pending' };
  }
  let next = null;
  if (order?.status === 'failed') next = { status: 'failed', raw: order.rawStatus };
  else if (payments.some((p) => p.status === 'PENDING')) next = { status: 'pending', raw: 'PENDING' };
  else if (payments.length && payments.every((p) => DEAD.includes(p.status))) next = { status: 'failed', raw: payments[payments.length - 1].status };
  if (next && next.status !== pay.status) {
    await sb(`booking_payments?id=eq.${pay.id}&status=in.(created,pending,failed,cancelled)`, {
      method: 'PATCH', prefer: 'return=minimal', body: { status: next.status, raw_status: next.raw },
    });
  }
  return { result: next ? next.status.toUpperCase() : 'PENDING', status: next?.status || pay.status };
}

async function applySuccess(pay, gp) {
  const r = await rpc('finalize_booking_payment', {
    p_order_id: pay.gateway_order_id,
    p_payment_id: gp.id,
    p_amount_paise: gp.amountPaise,
    p_currency: gp.currency,
    p_method: gp.method,
  });
  await afterFinalize(r, pay).catch((e) => console.error('afterFinalize failed:', e.message)); // never fail the webhook after money is recorded
  return r;
}

async function afterFinalize(r, pay) {
  if (r.result === 'CONFIRMED' && r.won) {
    // best-effort immediate mail (cap 8s); the queued job + cron retry if this fails
    await Promise.race([runJobs({ keys: [`booking_confirmed:${r.booking_id}`] }).catch((e) => console.error('immediate mail failed:', e.message)), sleep(8000)]);
    const [b] = await sb(`guest_bookings?id=eq.${r.booking_id}&select=*`);
    const [p] = await sb(`booking_payments?gateway_order_id=eq.${q(pay.gateway_order_id)}&select=*`);
    if (b && p) {
      const alert = adminAlertEmail(bookingInvoiceShape(b, p));
      await sendMail({ to: process.env.BOOKING_NOTIFY_EMAIL || 'shrisitaram6151@gmail.com', ...alert });
    }
    return;
  }
  if (r.needs_refund) {
    await notifyAdmin(`Payment ${r.result} - auto refund`, r);
    const [p] = await sb(`booking_payments?id=eq.${r.payment_row_id}&select=*`);
    if (p) await startRefund(p, p.amount_paise, r.result === 'NO_INVENTORY' ? 'Room not available after payment' : 'Duplicate payment', { kind: r.result === 'NO_INVENTORY' ? 'apology' : 'refund_notice' });
    return;
  }
  if (r.result === 'AMOUNT_MISMATCH') await notifyAdmin('AMOUNT MISMATCH - booking NOT confirmed', r);
}

// ---------- refunds (one refund per payment; refund_id is deterministic so retries are harmless) ----------
async function ensureContact(b) {
  await sb('email_contacts?on_conflict=email_lower', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
    body: { email: b.guest_email, full_name: b.guest_name, phone: b.guest_phone, source: 'booking' },
  });
  return (await sb(`email_contacts?email_lower=eq.${q(b.guest_email.toLowerCase())}&select=id`))[0];
}

export async function startRefund(pay, amountPaise, reason, { kind = 'refund_notice' } = {}) {
  if (!(amountPaise > 0 && amountPaise <= pay.amount_paise)) throw httpError(400, 'Refund amount sahi nahi hai');
  if (pay.status !== 'success') throw httpError(409, 'Sirf successful payment ka refund ho sakta hai');
  const refundId = `RF${pay.id.replace(/-/g, '').slice(0, 24)}`;
  let cur = pay;
  if (!pay.refund_id) {
    const claimed = await sb(`booking_payments?id=eq.${pay.id}&refund_id=is.null&status=eq.success`, {
      method: 'PATCH', prefer: 'return=representation',
      body: { refund_id: refundId, refund_amount_paise: amountPaise, refund_reason: String(reason || '').slice(0, 200), refund_status: 'REQUESTED' },
    });
    if (!claimed.length) throw httpError(409, 'Is payment ka refund pehle hi shuru ho chuka hai');
    cur = claimed[0];
  }
  const res = await gw.refund({ orderId: cur.gateway_order_id, refundId: cur.refund_id, amountPaise: cur.refund_amount_paise, note: reason });
  const [b] = await sb(`guest_bookings?id=eq.${cur.booking_id}&select=*`);
  if (b) {
    const contact = await ensureContact(b).catch(() => null);
    if (contact) await enqueueJob({ contactId: contact.id, bookingId: b.id, kind, key: `${kind}:${cur.id}` }).catch((e) => console.error('enqueue failed:', e.message));
  }
  if (res.status === 'success') await completeRefund(cur.id);
  else await sb(`booking_payments?id=eq.${cur.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { refund_status: res.status === 'failed' ? 'FAILED' : 'PENDING' } });
  return { refundId: cur.refund_id, status: res.status };
}

export async function completeRefund(paymentId) {
  return rpc('finalize_refund', { p_payment_id: paymentId });
}

export async function syncRefund(pay) {
  if (!pay.refund_id) return null;
  const res = await gw.fetchRefund(pay.gateway_order_id, pay.refund_id);
  if (res.status === 'success') await completeRefund(pay.id);
  else if (res.status === 'failed') {
    await sb(`booking_payments?id=eq.${pay.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { refund_status: 'FAILED' } });
    await notifyAdmin('Refund FAILED at gateway', { payment: pay.id, order: pay.gateway_order_id, refund: pay.refund_id });
  }
  return res;
}

// ---------- public view ----------
export function publicBooking(b) {
  const pays = [...(b.booking_payments || [])].sort((a, c) => new Date(c.created_at) - new Date(a.created_at));
  const paid = pays.find((p) => p.status === 'success' && p.raw_status === 'SUCCESS');
  const latest = pays[0] || null;
  const paidPaise = paid ? paid.amount_paise : 0;
  return {
    ref: b.booking_ref,
    status: b.status,
    room: b.room_name,
    roomsCount: b.rooms_count,
    checkIn: b.check_in,
    checkOut: b.check_out,
    guests: b.guests,
    guestName: b.guest_name,
    subtotal: b.subtotal_paise,
    tax: b.tax_paise,
    total: b.total_paise,
    advance: b.advance_paise,
    paid: paidPaise,
    balance: paid ? Math.max(b.total_paise - paidPaise, 0) : null,
    payment: latest ? { status: latest.status, rawStatus: latest.raw_status, refundStatus: latest.refund_status } : null,
    holdExpiresAt: b.status === 'pending' ? b.hold_expires_at : null,
    invoiceUrl: paid && paid.invoice_no ? `${siteUrl()}/api/booking-invoice?ref=${q(b.booking_ref)}&t=${q(b.public_token)}` : null,
    invoiceNo: paid?.invoice_no || null,
  };
}
