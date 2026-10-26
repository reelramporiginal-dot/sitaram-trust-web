// ROOT PATH: tests/booking-validation.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'http://localhost'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'
const { validateStay, validateGuest, normPhone, isIndianMobile, isYmd, mapSqlError, requireCron } = await import('../api/_booking-lib.js')

const stay = { room_id: 'r1', check_in: '2030-01-10', check_out: '2030-01-12', rooms_count: 1, guests: 2 }
const guest = { name: ' Ramesh  Kumar ', phone: '+91 98765 43210', email: 'Ram@Example.com', marketing_consent: false }

test('stay: good input passes, defaults to advance', () => {
  const s = validateStay(stay)
  assert.deepEqual([s.roomId, s.rooms, s.guests, s.payMode], ['r1', 1, 2, 'advance'])
  assert.equal(validateStay({ ...stay, pay_mode: 'full' }).payMode, 'full')
})

test('stay: bad dates / counts rejected (client amount is never read)', () => {
  assert.throws(() => validateStay({ ...stay, check_out: '2030-01-10' }), /Check-out/)
  assert.throws(() => validateStay({ ...stay, check_in: '2030-02-30' }), /tareekh/)
  assert.throws(() => validateStay({ ...stay, rooms_count: 0 }), /Rooms/)
  assert.throws(() => validateStay({ ...stay, rooms_count: 31 }), /Rooms/)
  assert.throws(() => validateStay({ ...stay, guests: 'abc' }), /Guests/)
  assert.throws(() => validateStay({ ...stay, room_id: '' }), /Room/)
  const s = validateStay({ ...stay, amount: 1, total_paise: 1 })
  assert.equal('amount' in s, false)
})

test('guest: phone / email normalisation and rules', () => {
  const g = validateGuest(guest)
  assert.equal(g.name, 'Ramesh Kumar')
  assert.equal(g.phone, '9876543210')
  assert.equal(g.email, 'ram@example.com')
  assert.equal(g.marketing, false)
  assert.equal(g.consentText, null)
  assert.throws(() => validateGuest({ ...guest, phone: '1234567890' }), /mobile/)
  assert.throws(() => validateGuest({ ...guest, email: 'nope' }), /email/i)
  assert.throws(() => validateGuest({ ...guest, name: 'A' }), /naam/)
  assert.throws(() => validateGuest({ ...guest, marketing_consent: true }), /Consent/)
  assert.equal(validateGuest({ ...guest, marketing_consent: true, consent_text: 'ok' }).consentText, 'ok')
})

test('helpers', () => {
  assert.equal(normPhone('09876543210'), '9876543210')
  assert.equal(isIndianMobile('5876543210'), false)
  assert.equal(isYmd('2030-02-29'), false)
  assert.equal(isYmd('2032-02-29'), true)
})

test('SQL exception codes map to friendly 4xx errors', () => {
  const e = mapSqlError(Object.assign(new Error('SOLD_OUT'), { status: 500 }))
  assert.equal(e.status, 409)
  assert.equal(mapSqlError(new Error('something else')).message, 'something else')
})

test('cron auth fails closed and is Bearer-only', () => {
  delete process.env.CRON_SECRET
  assert.throws(() => requireCron({ headers: { authorization: 'Bearer x' } }), (e) => e.status === 503)
  process.env.CRON_SECRET = 'a'.repeat(40)
  assert.throws(() => requireCron({ headers: {} }), (e) => e.status === 401)
  assert.throws(() => requireCron({ headers: { authorization: 'Bearer wrong' }, query: { key: 'a'.repeat(40) } }), (e) => e.status === 401)
  assert.doesNotThrow(() => requireCron({ headers: { authorization: `Bearer ${'a'.repeat(40)}` } }))
})
