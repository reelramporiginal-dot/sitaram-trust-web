// ROOT PATH: tests/gateway.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { cfSignature, verifyCashfreeSignature, mapOrderStatus, mapRefundStatus, paiseToRupees, rupeesToPaise } from '../api/_gateway.js'

const secret = 'test_secret_key'
const raw = '{"data":{"order":{"order_id":"SST-261025-ABCD-A1"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}'
const ts = '1761400000000'

test('webhook signature: valid raw body verifies', () => {
  const sig = crypto.createHmac('sha256', secret).update(ts + raw).digest('base64')
  assert.equal(cfSignature(ts, raw, secret), sig)
  assert.equal(verifyCashfreeSignature(raw, sig, ts, secret), true)
})

test('webhook signature: tampered body / wrong secret / missing parts are rejected', () => {
  const sig = cfSignature(ts, raw, secret)
  assert.equal(verifyCashfreeSignature(raw.replace('A1', 'A2'), sig, ts, secret), false)
  assert.equal(verifyCashfreeSignature(raw, sig, ts, 'other'), false)
  assert.equal(verifyCashfreeSignature(raw, sig, String(Number(ts) + 1), secret), false)
  assert.equal(verifyCashfreeSignature(raw, '', ts, secret), false)
  assert.equal(verifyCashfreeSignature(raw, sig, '', secret), false)
  assert.equal(verifyCashfreeSignature(raw, sig, ts, ''), false)
  assert.equal(verifyCashfreeSignature(raw, 'short', ts, secret), false)
})

test('status mapping', () => {
  assert.equal(mapOrderStatus('PAID'), 'success')
  assert.equal(mapOrderStatus('ACTIVE'), 'pending')
  assert.equal(mapOrderStatus('EXPIRED'), 'failed')
  assert.equal(mapOrderStatus('TERMINATED'), 'failed')
  assert.equal(mapRefundStatus('SUCCESS'), 'success')
  assert.equal(mapRefundStatus('PENDING'), 'pending')
  assert.equal(mapRefundStatus('CANCELLED'), 'failed')
})

test('paise <-> rupees has no float drift', () => {
  assert.equal(paiseToRupees(129900), 1299)
  assert.equal(paiseToRupees(6495), 64.95)
  assert.equal(rupeesToPaise(64.95), 6495)
  assert.equal(rupeesToPaise('1299.10'), 129910)
})
