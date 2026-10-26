// ROOT PATH: api/booking.js
// One function (Vercel Hobby = max 12 functions). vercel.json rewrites map the clean URLs:
//   POST /api/booking-quote   -> ?op=quote     price + availability, no DB write
//   POST /api/booking-create  -> ?op=create    reserve_room() -> gateway order -> payment_session_id
//   POST /api/booking-retry   -> ?op=retry     new payment attempt on a still-held booking
//   GET  /api/booking-status  -> ?op=status    ?ref=&t=  (polled by /booking/:ref)
//   GET  /api/booking-invoice -> ?op=invoice   ?ref=&t=  printable invoice
import { sb, httpError, esc } from './_pay-lib.js';
import * as gw from './_gateway.js';
import { bookingInvoicePage } from './_mail.js';
import {
  q, rpc, readBody, clientIp, rateLimit, verifyTurnstile, validateStay, validateGuest, mapSqlError,
  getBooking, startPayment, extendHold, syncOrder, publicBooking,
} from './_booking-lib.js';

const send = (res, status, body) => res.status(status).json(body);

async function quote(req, res) {
  const ip = clientIp(req);
  await rateLimit(`quote:${ip}`, 60, 60, { failOpen: true });
  const s = validateStay(readBody(req));
  try {
    const out = await rpc('quote_room', { p_room_id: s.roomId, p_check_in: s.checkIn, p_check_out: s.checkOut, p_rooms: s.rooms, p_guests: s.guests, p_pay_mode: s.payMode });
    return send(res, 200, { success: true, quote: out });
  } catch (e) {
    throw mapSqlError(e);
  }
}

async function create(req, res) {
  const ip = clientIp(req);
  const body = readBody(req);
  await rateLimit(`create:ip:${ip}`, 10, 600);
  const stay = validateStay(body);
  const guest = validateGuest(body);
  await rateLimit(`create:phone:${guest.phone}`, 5, 3600);
  await rateLimit(`create:email:${guest.email}`, 5, 3600);
  if (!(await verifyTurnstile(body.turnstile_token, ip))) throw httpError(400, 'Security check pass nahi hui. Page refresh karke dobara try karein.');
  if (!gw.gatewayConfigured()) throw httpError(503, 'Online payment abhi chalu nahi hai. Hotel ko call karein.');

  let held;
  try {
    held = await rpc('reserve_room', {
      p_room_id: stay.roomId, p_check_in: stay.checkIn, p_check_out: stay.checkOut, p_rooms: stay.rooms, p_guests: stay.guests,
      p_name: guest.name, p_phone: guest.phone, p_email: guest.email, p_pay_mode: stay.payMode, p_hold_minutes: 20,
    });
  } catch (e) {
    throw mapSqlError(e);
  }
  const booking = (await sb(`guest_bookings?id=eq.${held.id}&select=*,booking_payments(*)`))[0];
  try {
    await sb(`guest_bookings?id=eq.${held.id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: { marketing_consent: guest.marketing, consent_text: guest.consentText },
    });
    const pay = await startPayment(booking, held.pay_now_paise);
    return send(res, 200, {
      success: true,
      booking_ref: held.booking_ref,
      token: held.public_token,
      payment_session_id: pay.paymentSessionId,
      order_id: pay.orderId,
      amount_paise: held.pay_now_paise,
      env: gw.cfEnv(),
    });
  } catch (e) {
    // could not start payment: release the hold immediately (R5)
    await sb(`guest_bookings?id=eq.${held.id}&status=eq.pending`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'cancelled', cancel_reason: 'PAYMENT_START_FAILED' } }).catch(() => {});
    throw e;
  }
}

async function retry(req, res) {
  const body = readBody(req);
  await rateLimit(`retry:${clientIp(req)}`, 20, 600);
  const b = await getBooking(body.ref, body.token);
  await rateLimit(`retry:ref:${b.booking_ref}`, 6, 600);
  const pays = [...(b.booking_payments || [])].sort((a, c) => new Date(c.created_at) - new Date(a.created_at));
  // make sure an earlier attempt was not actually paid before opening a new order
  for (const p of pays.slice(0, 2)) if (['created', 'pending', 'failed'].includes(p.status)) await syncOrder(p.gateway_order_id).catch((e) => console.error('retry sync failed:', e.message));
  const fresh = await getBooking(body.ref, body.token);
  if (fresh.status === 'confirmed' || fresh.status === 'completed') return send(res, 200, { success: true, alreadyPaid: true });
  if (fresh.status !== 'pending') throw httpError(410, 'Ye booking ab active nahi hai. Kripya nayi booking karein.');
  const extended = await extendHold(fresh);
  const amount = pays[0]?.amount_paise || fresh.advance_paise;
  const pay = await startPayment({ ...fresh, hold_expires_at: extended.hold_expires_at }, amount);
  return send(res, 200, {
    success: true, booking_ref: fresh.booking_ref, token: fresh.public_token,
    payment_session_id: pay.paymentSessionId, order_id: pay.orderId, amount_paise: amount, env: gw.cfEnv(),
  });
}

async function status(req, res) {
  const ip = clientIp(req);
  await rateLimit(`status:${ip}`, 120, 60, { failOpen: true });
  let b = await getBooking(req.query?.ref, req.query?.t);
  const latest = [...(b.booking_payments || [])].sort((a, c) => new Date(c.created_at) - new Date(a.created_at))[0];
  if (b.status === 'pending' && latest && ['created', 'pending', 'failed'].includes(latest.status)) {
    // server-side status fetch from the gateway (R2), at most once per 4 seconds per booking
    let allowed = false;
    try {
      allowed = (await rpc('hit_rate_limit', { p_key: `sync:${b.booking_ref}`, p_max: 1, p_window_seconds: 4 })) === true;
    } catch {
      allowed = false;
    }
    if (allowed) {
      await syncOrder(latest.gateway_order_id).catch((e) => console.error('status sync failed:', e.message));
      b = await getBooking(req.query?.ref, req.query?.t);
    }
  }
  return send(res, 200, { success: true, booking: publicBooking(b) });
}

async function invoice(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    const b = await getBooking(req.query?.ref, req.query?.t);
    const pay = (b.booking_payments || []).find((p) => p.status === 'success' && p.raw_status === 'SUCCESS' && p.invoice_no);
    if (!pay) throw httpError(404, 'Invoice nahi mila');
    return res.status(200).send(bookingInvoicePage(b, pay));
  } catch (e) {
    return res.status(e.status || 500).send(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px;"><h2>${esc(e.status && e.status < 500 ? e.message : 'Server error')}</h2></body>`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const op = String(req.query?.op || '');
  try {
    if (op === 'invoice' && req.method === 'GET') return await invoice(req, res);
    if (op === 'status' && req.method === 'GET') return await status(req, res);
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed');
    if (op === 'quote') return await quote(req, res);
    if (op === 'create') return await create(req, res);
    if (op === 'retry') return await retry(req, res);
    throw httpError(404, 'Not found');
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(`booking:${op} failed:`, e.message, e.details ? JSON.stringify(e.details) : '');
    // never leak internals: 5xx -> generic message
    return res.status(e.status || 500).json({ success: false, error: e.status && e.status < 500 ? e.message : 'Kuch gadbad ho gayi, thodi der baad dobara koshish karein.', code: e.details?.code });
  }
}
