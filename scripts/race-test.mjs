// ROOT PATH: scripts/race-test.mjs
// Acceptance test (Bible 5.2 / section 14 #6): 10 parallel reservations for the LAST unit -> exactly 1 wins.
// Run:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/race-test.mjs
// Uses a throw-away room id ("race-test") and removes it afterwards. Safe on production data.
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const rest = (p, o = {}) => fetch(`${url}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
const ymd = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

await rest('room_inventory?on_conflict=room_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ room_id: 'race-test', room_name: 'Race Test', total_units: 1, unit_price_paise: 100000, tax_paise_per_night: 5000, max_guests_per_unit: 2 }]) })
const calls = Array.from({ length: 10 }, (_, i) =>
  rest('rpc/reserve_room', { method: 'POST', body: JSON.stringify({ p_room_id: 'race-test', p_check_in: ymd(30), p_check_out: ymd(31), p_rooms: 1, p_guests: 2, p_name: `Racer ${i}`, p_phone: '9999999999', p_email: `r${i}@example.com` }) }).then(async (r) => ({ ok: r.ok, body: await r.text() })),
)
const results = await Promise.all(calls)
const wins = results.filter((r) => r.ok).length
const soldOut = results.filter((r) => !r.ok && r.body.includes('SOLD_OUT')).length
console.log({ wins, soldOut, other: 10 - wins - soldOut })

await rest('guest_bookings?room_id=eq.race-test', { method: 'DELETE' })
await rest('room_inventory?room_id=eq.race-test', { method: 'DELETE' })
if (wins === 1 && soldOut === 9) { console.log('PASS: exactly one booking won the last unit'); process.exit(0) }
console.error('FAIL: expected 1 win and 9 SOLD_OUT'); process.exit(1)
