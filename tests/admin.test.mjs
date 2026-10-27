// ROOT PATH: tests/admin.test.mjs
// Regression: every GET view of /api/pay-admin must work (the default view lists the old payment links).
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'http://supa.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
process.env.SUPABASE_ANON_KEY = 'anon'
process.env.ADMIN_EMAILS = 'boss@example.com'
process.env.SITE_URL = 'https://site.test'

let email = 'boss@example.com'
const json = (d, s = 200) => ({ ok: s < 400, status: s, text: async () => JSON.stringify(d), json: async () => d })
globalThis.fetch = async (u) => {
  u = String(u)
  if (u.includes('/auth/v1/user')) return json({ email })
  if (u.includes('payment_requests')) return json([{ id: 'p1', token: 't1', guest_name: 'Ram', amount_paise: 10000, status: 'created', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() }])
  return json([])
}
const { default: handler } = await import('../api/pay-admin.js')
const mk = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } })
const call = async (query = {}) => {
  const res = mk()
  await handler({ method: 'GET', query, headers: { authorization: 'Bearer jwt' } }, res)
  return res
}

test('default view lists payment links', async () => {
  const r = await call()
  assert.equal(r.code, 200, JSON.stringify(r.body))
  assert.equal(r.body.items.length, 1)
})
test('bookings and emails views work', async () => {
  assert.equal((await call({ view: 'bookings' })).code, 200)
  assert.equal((await call({ view: 'emails' })).code, 200)
})
test('account not in ADMIN_EMAILS gets 403 and a helpful message', async () => {
  email = 'stranger@example.com'
  const r = await call()
  email = 'boss@example.com'
  assert.equal(r.code, 403)
  assert.match(r.body.error, /stranger@example\.com/)
})
