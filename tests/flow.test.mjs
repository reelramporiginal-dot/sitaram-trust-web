// ROOT PATH: tests/flow.test.mjs
// Integration-style test with a fake Supabase + fake Cashfree (no network). Covers: server-side pricing,
// signature checks, gateway re-verification, idempotent webhook replays, 5xx on DB failure.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'

process.env.SUPABASE_URL = 'http://supa.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
process.env.CASHFREE_APP_ID = 'app'
process.env.CASHFREE_SECRET_KEY = 'cf_secret'
process.env.SITE_URL = 'https://site.test'
delete process.env.RESEND_API_KEY
delete process.env.TURNSTILE_SECRET_KEY

const calls = []
const db = { payments: [], failPayments: false, finalizeCount: 0 }
const booking = {
  id: 'b1', booking_ref: 'SST-261026-ABCD', public_token: 'a'.repeat(32), room_id: 'r1', room_name: 'AC Room', rooms_count: 1,
  check_in: '2030-01-10', check_out: '2030-01-12', guests: 2, guest_name: 'Ram', guest_phone: '9876543210', guest_email: 'ram@example.com',
  subtotal_paise: 200000, tax_paise: 10000, total_paise: 210000, advance_paise: 105000, status: 'pending',
  hold_expires_at: new Date(Date.now() + 15 * 60000).toISOString(), booking_payments: [],
}
const json = (data, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(data), json: async () => data })

globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  const method = init.method || 'GET'
  calls.push({ url: u, method, body: init.body })
  if (u.includes('/rpc/hit_rate_limit')) return json(true)
  if (u.includes('/rpc/reserve_room')) return json({ id: 'b1', booking_ref: booking.booking_ref, public_token: booking.public_token, pay_now_paise: 105000, total_paise: 210000, advance_paise: 105000 })
  if (u.includes('/rpc/finalize_booking_payment')) {
    db.finalizeCount++
    return json(db.finalizeCount === 1
      ? { result: 'CONFIRMED', won: true, booking_id: 'b1', booking_ref: booking.booking_ref, invoice_no: 'SST/2026-27/1001' }
      : { result: 'ALREADY', won: false, booking_id: 'b1' })
  }
  if (u.includes('/rest/v1/guest_bookings') && method === 'GET') return json([{ ...booking, booking_payments: db.payments }])
  if (u.includes('/rest/v1/guest_bookings') && method === 'PATCH') return json([])
  if (u.includes('/rest/v1/booking_payments') && method === 'POST') {
    const row = { id: 'p1', status: 'created', currency: 'INR', created_at: new Date().toISOString(), ...JSON.parse(init.body) }
    db.payments = [row]
    return json([row], 201)
  }
  if (u.includes('/rest/v1/booking_payments') && method === 'GET') {
    if (db.failPayments) return json({ message: 'db down' }, 500)
    if (u.includes('gateway_order_id=eq.SST-261026-ABCD-A1')) return json(db.payments)
    return json([])
  }
  if (u.includes('/rest/v1/email_jobs')) return json([])
  if (u.includes('sandbox.cashfree.com/pg/orders') && method === 'POST') return json({ order_id: JSON.parse(init.body).order_id, payment_session_id: 'session_abc', order_status: 'ACTIVE' })
  if (u.includes('sandbox.cashfree.com/pg/orders/') && u.endsWith('/payments')) {
    return json([{ cf_payment_id: 777, payment_status: 'SUCCESS', payment_amount: 1050, payment_currency: 'INR', payment_group: 'upi' }])
  }
  throw new Error(`unmocked fetch ${method} ${u}`)
}

const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, send(b) { this.body = b; return this } })
const { default: booking_handler } = await import('../api/booking.js')
const { default: webhook } = await import('../api/pay-webhook.js')

test('create: price comes from the server, never from the client', async () => {
  const req = {
    method: 'POST', query: { op: 'create' }, headers: { 'content-length': '300', 'x-forwarded-for': '1.2.3.4' },
    body: { room_id: 'r1', check_in: '2030-01-10', check_out: '2030-01-12', rooms_count: 1, guests: 2, pay_mode: 'advance',
      name: 'Ram Kumar', phone: '9876543210', email: 'ram@example.com', marketing_consent: false,
      amount_paise: 100, total_paise: 100, order_amount: 1 },
  }
  const res = mkRes()
  await booking_handler(req, res)
  assert.equal(res.code, 200, JSON.stringify(res.body))
  assert.equal(res.body.payment_session_id, 'session_abc')
  assert.equal(res.body.amount_paise, 105000)
  const order = calls.find((c) => c.url.endsWith('/pg/orders') && c.method === 'POST')
  const sent = JSON.parse(order.body)
  assert.equal(sent.order_amount, 1050) // rupees from OUR booking (advance), not the client's tampered 100
  assert.equal(sent.order_id, 'SST-261026-ABCD-A1')
  assert.match(sent.order_meta.return_url, /^https:\/\/site\.test\/booking\/SST-261026-ABCD\?t=/)
  assert.equal(sent.order_meta.notify_url, 'https://site.test/api/pay-webhook')
})

function signedReq(payload, secret = 'cf_secret') {
  const raw = JSON.stringify(payload)
  const ts = String(Date.now())
  const sig = crypto.createHmac('sha256', secret).update(ts + raw).digest('base64')
  const req = Readable.from([Buffer.from(raw)])
  req.method = 'POST'
  req.headers = { 'x-webhook-signature': sig, 'x-webhook-timestamp': ts }
  return req
}
const evt = (orderId) => ({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: orderId }, payment: { payment_status: 'SUCCESS' } } })

test('webhook: bad signature -> 400 and nothing is finalized', async () => {
  const before = db.finalizeCount
  const res = mkRes()
  await webhook(signedReq(evt('SST-261026-ABCD-A1'), 'wrong_secret'), res)
  assert.equal(res.code, 400)
  assert.equal(db.finalizeCount, before)
})

test('webhook: good signature re-verifies with the gateway, confirms once; replays are harmless', async () => {
  const r1 = mkRes()
  await webhook(signedReq(evt('SST-261026-ABCD-A1')), r1)
  assert.equal(r1.code, 200)
  assert.equal(r1.body.result, 'CONFIRMED')
  const fin = calls.filter((c) => c.url.includes('finalize_booking_payment')).at(-1)
  const sent = JSON.parse(fin.body)
  assert.equal(sent.p_amount_paise, 105000) // amount taken from the gateway response
  assert.equal(sent.p_payment_id, '777')
  for (let i = 0; i < 3; i++) {
    const r = mkRes()
    await webhook(signedReq(evt('SST-261026-ABCD-A1')), r)
    assert.equal(r.code, 200)
    assert.equal(r.body.result, 'ALREADY')
  }
})

test('webhook: unknown order -> 200 ignored', async () => {
  const res = mkRes()
  await webhook(signedReq(evt('SOMEONE-ELSES-ORDER')), res)
  assert.equal(res.code, 200)
  assert.match(res.body.ignored, /hamari nahi/)
})

test('webhook: our DB failure -> 500 so the gateway retries', async () => {
  db.failPayments = true
  const res = mkRes()
  await webhook(signedReq(evt('SST-261026-ABCD-A1')), res)
  db.failPayments = false
  assert.equal(res.code, 500)
})

test('webhook: unknown source -> 400; secret missing -> 503', async () => {
  const bare = Readable.from([Buffer.from('{}')])
  bare.method = 'POST'
  bare.headers = {}
  const r0 = mkRes()
  await webhook(bare, r0)
  assert.equal(r0.code, 400)
  const keep = process.env.CASHFREE_SECRET_KEY
  delete process.env.CASHFREE_SECRET_KEY
  const r1 = mkRes()
  await webhook(signedReq(evt('x')), r1)
  process.env.CASHFREE_SECRET_KEY = keep
  assert.equal(r1.code, 503)
})
