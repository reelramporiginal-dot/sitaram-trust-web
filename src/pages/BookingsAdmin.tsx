// ROOT PATH: src/pages/BookingsAdmin.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowLeft, Ban, Loader2, Mail, RefreshCw, RotateCcw, Hotel } from 'lucide-react'
import { storage } from '../lib/storage'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useNoIndex } from '../lib/useNoIndex'
import { inr } from '../lib/hotel'

type Pay = { id: string; status: string; raw_status: string | null; amount_paise: number; method: string | null; invoice_no: string | null; gateway_order_id: string; refund_status: string | null; refund_amount_paise: number | null; paid_at: string | null; created_at: string }
type Booking = {
  id: string; booking_ref: string; room_name: string; rooms_count: number; check_in: string; check_out: string; guests: number
  guest_name: string; guest_phone: string; guest_email: string; total_paise: number; advance_paise: number
  status: string; created_at: string; hold_expires_at: string | null; booking_payments: Pay[]
}
type Job = { id: string; kind: string; status: string; is_marketing: boolean; send_at: string; sent_at: string | null; attempts: number; last_error: string | null; email_contacts: { email: string; full_name: string | null } | null }
type Gateway = { name: string; configured: boolean; env: string }

async function call<T>(opts: { query?: string; body?: unknown }): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Login session nahi mila. Logout karke dobara login karein.')
  const res = await fetch(`/api/pay-admin${opts.query || ''}`, {
    method: opts.body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
  return json
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: 'bg-[#e7f8df] text-[#255018]', completed: 'bg-[#e7f8df] text-[#255018]', pending: 'bg-[#fff3d8] text-[#7a4b00]',
  expired: 'bg-[#eee] text-[#555]', cancelled: 'bg-[#fde8e8] text-[#9b1c1c]', refunded: 'bg-[#e8eefc] text-[#1d3a8a]',
  sent: 'bg-[#e7f8df] text-[#255018]', queued: 'bg-[#fff3d8] text-[#7a4b00]', sending: 'bg-[#fff3d8] text-[#7a4b00]', failed: 'bg-[#fde8e8] text-[#9b1c1c]', skipped: 'bg-[#eee] text-[#555]',
}
const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS_STYLE[s] || 'bg-[#eee] text-[#555]'}`}>{s}</span>
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '-')

export function BookingsAdmin() {
  useNoIndex()
  const isAuthed = localStorage.getItem(storage.keys.authed) === 'true'
  const [tab, setTab] = useState<'bookings' | 'emails'>('bookings')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [gateway, setGateway] = useState<Gateway | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      if (tab === 'bookings') {
        const r = await call<{ items: Booking[]; gateway: Gateway }>({ query: '?view=bookings' })
        setBookings(r.items)
        setGateway(r.gateway)
      } else {
        const r = await call<{ items: Job[] }>({ query: '?view=emails' })
        setJobs(r.items)
      }
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    document.title = 'Bookings | Admin'
    if (isAuthed && isSupabaseConfigured) void load()
  }, [load, isAuthed])

  const act = async (key: string, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(key)
    setMsg('')
    setErr('')
    try {
      await call({ body })
      setMsg('Ho gaya.')
      setLoading(true)
      await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return bookings.filter((b) => (filter === 'all' || b.status === filter) && (!s || [b.booking_ref, b.guest_name, b.guest_phone, b.guest_email].some((v) => v.toLowerCase().includes(s))))
  }, [bookings, filter, search])

  const totals = useMemo(() => {
    const paid = bookings.flatMap((b) => b.booking_payments).filter((p) => p.status === 'success' && p.raw_status === 'SUCCESS')
    return { count: bookings.filter((b) => ['confirmed', 'completed'].includes(b.status)).length, amount: paid.reduce((a, p) => a + p.amount_paise, 0) }
  }, [bookings])

  if (!isAuthed) return <Navigate to="/login" replace />

  return (
    <main className="min-h-screen bg-[#fffaf1] pb-16">
      <header className="sticky top-0 z-40 border-b border-[#d7a84f]/20 bg-[#2a0611]/95 px-4 py-4 text-white backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#f5d891]">Admin Panel</p>
            <h1 className="font-serif text-2xl font-bold">Online Bookings</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/admin/payments" className="rounded-full border border-[#d7a84f]/60 px-4 py-2 text-sm font-bold text-[#f5d891]">Payment Links</a>
            <button type="button" onClick={() => { setLoading(true); void load() }} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-bold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
            <a href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Dashboard</a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {gateway && (
          <div className={`rounded-2xl p-4 text-sm font-semibold ${gateway.configured ? 'bg-[#e7f8df] text-[#255018]' : 'bg-[#fde8e8] text-[#9b1c1c]'}`}>
            {gateway.configured ? `Payment gateway: ${gateway.name} (${gateway.env.toUpperCase()}) chalu hai.` : 'Payment gateway set nahi hai: Vercel me CASHFREE_APP_ID aur CASHFREE_SECRET_KEY daalein. Tab tak guests ko Book & Pay par error dikhega.'}
            {gateway.env === 'sandbox' && gateway.configured && ' SANDBOX mode: asli paisa nahi katega.'}
          </div>
        )}
        {msg && <div className="rounded-2xl bg-[#e7f8df] p-3 text-sm font-semibold text-[#255018]">{msg}</div>}
        {err && <div role="alert" className="rounded-2xl bg-[#fde8e8] p-3 text-sm font-semibold text-[#9b1c1c]">{err}</div>}

        <div className="flex flex-wrap items-center gap-2">
          {(['bookings', 'emails'] as const).map((t) => (
            <button key={t} type="button" onClick={() => { setLoading(true); setTab(t) }} className={`rounded-full px-5 py-2 text-sm font-bold ${tab === t ? 'bg-[#4b0718] text-white' : 'border border-[#d7a84f]/50 text-[#4b0718]'}`}>{t === 'bookings' ? 'Bookings' : 'Email queue'}</button>
          ))}
          <button type="button" disabled={busy === 'sync'} onClick={() => act('sync', { action: 'sync_inventory' })} className="ml-auto inline-flex items-center gap-2 rounded-full border border-[#d7a84f]/50 px-4 py-2 text-sm font-bold text-[#4b0718]"><Hotel className="h-4 w-4" /> {busy === 'sync' ? 'Sync…' : 'Rooms sync karo (price, units)'}</button>
        </div>

        {tab === 'bookings' && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 shadow"><p className="text-xs font-bold uppercase text-[#7a6a70]">Confirmed</p><p className="text-2xl font-black text-[#4b0718]">{totals.count}</p></div>
              <div className="rounded-2xl bg-white p-4 shadow"><p className="text-xs font-bold uppercase text-[#7a6a70]">Online received</p><p className="text-2xl font-black text-[#1f7a3d]">{inr(totals.amount)}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Naam / phone / email / ID" className="min-w-[220px] flex-1 rounded-full border border-[#d7a84f]/40 bg-white px-4 py-2 text-sm" />
              {['all', 'confirmed', 'pending', 'completed', 'expired', 'cancelled', 'refunded'].map((s) => (
                <button key={s} type="button" onClick={() => setFilter(s)} className={`rounded-full px-3 py-2 text-xs font-bold uppercase ${filter === s ? 'bg-[#d7a84f] text-[#4b0718]' : 'bg-white text-[#4b0718]'}`}>{s}</button>
              ))}
            </div>
            {loading && !bookings.length ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#b7812d]" /> : (
              <div className="space-y-3">
                {rows.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-[#6b5560]">Koi booking nahi mili.</p>}
                {rows.map((b) => {
                  const paid = b.booking_payments.find((p) => p.status === 'success' && p.raw_status === 'SUCCESS')
                  const problem = b.booking_payments.find((p) => p.status === 'success' && ['NO_INVENTORY', 'DUPLICATE_PAYMENT'].includes(p.raw_status || ''))
                  return (
                    <article key={b.id} className="rounded-2xl border border-[#d7a84f]/25 bg-white p-4 shadow">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-black tracking-wide text-[#4b0718]">{b.booking_ref} <Badge s={b.status} /></p>
                          <p className="text-sm font-semibold text-[#3b2a30]">{b.guest_name} · {b.guest_phone} · {b.guest_email}</p>
                          <p className="text-sm text-[#6b5560]">{b.room_name} × {b.rooms_count} · {b.check_in} → {b.check_out} · {b.guests} guests</p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-black text-[#4b0718]">{inr(b.total_paise)}</p>
                          <p className="text-[#6b5560]">Paid {paid ? inr(paid.amount_paise) : '₹0'}{paid?.invoice_no ? ` · ${paid.invoice_no}` : ''}</p>
                          <p className="text-xs text-[#7a6a70]">{when(b.created_at)}</p>
                        </div>
                      </div>
                      {problem && <p className="mt-2 rounded-xl bg-[#fde8e8] px-3 py-2 text-xs font-bold text-[#9b1c1c]">Payment mila par booking confirm nahi hui ({problem.raw_status}). Auto refund: {problem.refund_status || 'pending'}.</p>}
                      {b.booking_payments.some((p) => p.refund_status) && <p className="mt-2 text-xs font-semibold text-[#1d3a8a]">Refund: {b.booking_payments.map((p) => p.refund_status && `${p.refund_status} ${p.refund_amount_paise ? inr(p.refund_amount_paise) : ''}`).filter(Boolean).join(', ')}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {paid && ['confirmed', 'completed'].includes(b.status) && (
                          <button type="button" disabled={busy === `m${b.id}`} onClick={() => { const e = window.prompt('Email par bhejna hai? (khali = wahi email)', b.guest_email); if (e !== null) void act(`m${b.id}`, { action: 'resend_confirmation', bookingId: b.id, email: e && e !== b.guest_email ? e : undefined }) }} className="inline-flex items-center gap-1.5 rounded-full border border-[#d7a84f]/50 px-3 py-1.5 text-xs font-bold text-[#4b0718]"><Mail className="h-3.5 w-3.5" /> Confirmation dobara bhejein</button>
                        )}
                        {paid && !paid.refund_status && (
                          <button type="button" disabled={busy === `r${b.id}`} onClick={() => { const a = window.prompt(`Kitna refund (₹)? Poora = ${paid.amount_paise / 100}`, String(paid.amount_paise / 100)); if (a) void act(`r${b.id}`, { action: 'refund', bookingId: b.id, amount: Number(a), reason: 'Admin refund' }, `₹${a} ka refund ${b.guest_name} ko bhejna hai? Ye wapas nahi hoga.`) }} className="inline-flex items-center gap-1.5 rounded-full border border-[#d7a84f]/50 px-3 py-1.5 text-xs font-bold text-[#4b0718]"><RotateCcw className="h-3.5 w-3.5" /> Refund</button>
                        )}
                        {['pending', 'confirmed', 'expired'].includes(b.status) && (
                          <button type="button" disabled={busy === `c${b.id}`} onClick={() => act(`c${b.id}`, { action: 'cancel_booking', bookingId: b.id, refund: Boolean(paid && !paid.refund_status), reason: 'Admin cancelled' }, paid ? 'Booking cancel hogi aur poora refund jayega. Pakka?' : 'Booking cancel karein?')} className="inline-flex items-center gap-1.5 rounded-full border border-[#9b1c1c]/40 px-3 py-1.5 text-xs font-bold text-[#9b1c1c]"><Ban className="h-3.5 w-3.5" /> Cancel{paid ? ' + refund' : ''}</button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}

        {tab === 'emails' && (
          <div className="overflow-x-auto rounded-2xl border border-[#d7a84f]/25 bg-white shadow">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#fff3d8] text-xs uppercase tracking-wider text-[#4b0718]"><tr><th className="p-3">Kind</th><th className="p-3">To</th><th className="p-3">Status</th><th className="p-3">Send at</th><th className="p-3">Tries</th><th className="p-3">Error</th><th className="p-3" /></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t border-[#eadfce]">
                    <td className="p-3 font-semibold">{j.kind}{j.is_marketing && <span className="ml-1 text-[10px] text-[#b7812d]">(marketing)</span>}</td>
                    <td className="p-3">{j.email_contacts?.email || '-'}</td>
                    <td className="p-3"><Badge s={j.status} /></td>
                    <td className="p-3 whitespace-nowrap">{when(j.sent_at || j.send_at)}</td>
                    <td className="p-3">{j.attempts}</td>
                    <td className="max-w-[220px] truncate p-3 text-xs text-[#9b1c1c]" title={j.last_error || ''}>{j.last_error || ''}</td>
                    <td className="p-3">{['failed', 'skipped'].includes(j.status) && <button type="button" disabled={busy === j.id} onClick={() => act(j.id, { action: 'retry_job', jobId: j.id })} className="rounded-full border border-[#d7a84f]/50 px-3 py-1 text-xs font-bold text-[#4b0718]">Resend</button>}</td>
                  </tr>
                ))}
                {!jobs.length && <tr><td colSpan={7} className="p-6 text-center text-[#6b5560]">Abhi koi email job nahi hai.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
