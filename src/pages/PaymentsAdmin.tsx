import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowLeft, Copy, FileText, Loader2, MessageCircle, RefreshCw } from 'lucide-react'
import { storage } from '../lib/storage'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useNoIndex } from '../lib/useNoIndex'

type Item = {
  id: string
  booking_id: string | null
  guest_name: string
  guest_phone: string | null
  guest_email: string | null
  room: string | null
  amount_paise: number
  total_amount_paise: number | null
  status: 'created' | 'paid' | 'cancelled'
  payment_method: string | null
  invoice_no: string | null
  invoice_emailed_at: string | null
  expires_at: string
  expired: boolean
  created_at: string
  payUrl: string
  invoiceUrl: string | null
}

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100)

async function call<T>(body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Login session nahi mila. Logout karke dobara login karein.')
  const res = await fetch('/api/pay-admin', {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
  return json
}

const whatsappLink = (item: Pick<Item, 'guest_name' | 'guest_phone' | 'booking_id' | 'amount_paise' | 'payUrl'>) => {
  const digits = (item.guest_phone || '').replace(/\D/g, '')
  const phone = digits.length === 10 ? `91${digits}` : digits
  const text =
    `जय श्री राम 🙏\nश्री सीताराम सेवा ट्रस्ट, अयोध्या\n\n` +
    `${item.guest_name} जी, आपकी booking${item.booking_id ? ` (${item.booking_id})` : ''} के लिए ${inr(item.amount_paise)} का payment यहाँ करें:\n${item.payUrl}\n\n` +
    `लिंक खोलकर अपना email डालें। Payment के बाद invoice आपके email पर आ जाएगा।\n📞 9918310009, 8303333309`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

const empty = { guestName: '', guestPhone: '', guestEmail: '', bookingId: '', room: '', checkIn: '', guests: '', description: '', amount: '', total: '', expiresDays: '7', offline: false, offlineMethod: 'UPI QR', offlineRef: '' }

export function PaymentsAdmin() {
  useNoIndex()
  const isAuthed = localStorage.getItem(storage.keys.authed) === 'true'
  const [items, setItems] = useState<Item[]>([])
  const [gatewayReady, setGatewayReady] = useState(true)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Item | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await call<{ items: Item[]; gatewayReady: boolean }>()
      setItems(data.items)
      setGatewayReady(data.gatewayReady)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (!isAuthed || !isSupabaseConfigured) return
    let cancelled = false
    call<{ items: Item[]; gatewayReady: boolean }>()
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setGatewayReady(data.gatewayReady)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthed])

  if (!isAuthed) return <Navigate to="/login" replace />

  const set = (key: keyof typeof empty, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    setCreated(null)
    try {
      const res = await call<{ item: Item; emailed?: boolean; mailError?: string }>({
        action: 'create',
        ...form,
        offline: form.offline ? { method: form.offlineMethod, reference: form.offlineRef } : undefined,
      })
      if (form.offline) {
        setMessage(res.emailed ? 'Payment darj ho gaya aur invoice guest ko email kar diya gaya.' : `Payment darj ho gaya. Invoice email nahi gaya${res.mailError ? ` (${res.mailError})` : ''}.`)
      } else {
        setCreated(res.item)
      }
      setForm(empty)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const act = async (body: Record<string, unknown>, okText: string) => {
    setError('')
    setMessage('')
    try {
      const res = await call<{ emailed?: boolean; mailError?: string }>(body)
      setMessage(res.mailError ? `${okText} Par email nahi gaya: ${res.mailError}` : okText)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setMessage('Link copy ho gaya.')
  }

  const statusChip = (item: Item) => {
    const expired = item.expired
    const map = { paid: 'bg-[#e7f8df] text-[#255018]', created: 'bg-[#fff3d8] text-[#7a4b00]', cancelled: 'bg-[#eee] text-[#555]' }
    const label = item.status === 'paid' ? 'Paid' : item.status === 'cancelled' ? 'Cancelled' : expired ? 'Expired' : 'Pending'
    return <span className={`rounded-full px-3 py-1 text-xs font-bold ${map[item.status]}`}>{label}</span>
  }

  const field = 'admin-input'
  const btn = 'inline-flex items-center gap-1 rounded-full border border-[#d7a84f]/60 px-3 py-1.5 text-xs font-bold text-[#4b0718]'

  return (
    <main className="min-h-screen bg-[#fffaf1] pb-16">
      <header className="sticky top-0 z-40 border-b border-[#d7a84f]/20 bg-[#2a0611]/95 px-4 py-4 text-white backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#f5d891]">Admin Panel</p>
            <h1 className="font-serif text-2xl font-bold">Payments & Invoices</h1>
          </div>
          <a href="/admin" className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Dashboard</a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {!isSupabaseConfigured && <div className="rounded-2xl bg-[#fff3d8] p-4 text-sm font-semibold text-[#4b0718]">Payments ke liye Supabase login zaroori hai (VITE_SUPABASE_URL aur VITE_SUPABASE_ANON_KEY).</div>}
        {!gatewayReady && <div className="rounded-2xl bg-[#fff3d8] p-4 text-sm font-semibold text-[#4b0718]">Razorpay abhi set nahi hai. Link ban jayega, par guest online pay tab tak nahi kar paayega. Tab tak "Payment pehle hi mil chuki hai" option se QR/cash payments ka invoice bhej sakte hain.</div>}
        {message && <div className="rounded-2xl bg-[#e7f8df] p-4 font-semibold text-[#255018]">{message}</div>}
        {error && <div className="rounded-2xl bg-[#ffe3e3] p-4 font-semibold text-[#7a1020]">{error}</div>}

        <form onSubmit={submit} className="rounded-2xl border border-[#d7a84f]/25 bg-white p-5">
          <h2 className="font-serif text-xl font-bold text-[#4b0718]">Naya Payment Link</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={field} placeholder="Guest ka naam *" value={form.guestName} onChange={(e) => set('guestName', e.target.value)} required />
            <input className={field} placeholder="Guest ka WhatsApp / mobile" value={form.guestPhone} onChange={(e) => set('guestPhone', e.target.value)} />
            <input className={field} placeholder="Booking ID (jaise BKG-1088)" value={form.bookingId} onChange={(e) => set('bookingId', e.target.value)} />
            <input className={field} placeholder="Room (jaise 2 Bed AC Room)" value={form.room} onChange={(e) => set('room', e.target.value)} />
            <input className={field} placeholder="Check-in date" value={form.checkIn} onChange={(e) => set('checkIn', e.target.value)} />
            <input className={field} placeholder="Guests" value={form.guests} onChange={(e) => set('guests', e.target.value)} />
            <input className={field} type="number" min="1" step="0.01" placeholder="Abhi kitna lena hai (₹) *" value={form.amount} onChange={(e) => set('amount', e.target.value)} required />
            <input className={field} type="number" min="1" step="0.01" placeholder="Poori booking ka amount (₹), advance ho to" value={form.total} onChange={(e) => set('total', e.target.value)} />
            <input className={`${field} sm:col-span-2`} placeholder="Note (jaise Advance for 2 nights)" value={form.description} onChange={(e) => set('description', e.target.value)} />
            <input className={field} type="number" min="1" max="60" placeholder="Link kitne din chalega (7)" value={form.expiresDays} onChange={(e) => set('expiresDays', e.target.value)} />
            <input className={field} type="email" placeholder="Guest ka email (optional, guest khud bhi dalega)" value={form.guestEmail} onChange={(e) => set('guestEmail', e.target.value)} />
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm text-[#4b0718]">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#b7812d]" checked={form.offline} onChange={(e) => set('offline', e.target.checked)} />
            <span>Payment pehle hi mil chuki hai (QR / cash / bank). Link nahi, seedha paid entry banao aur invoice bhejo.</span>
          </label>
          {form.offline && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input className={field} placeholder="Tareeka (UPI QR / Cash / Bank transfer)" value={form.offlineMethod} onChange={(e) => set('offlineMethod', e.target.value)} />
              <input className={field} placeholder="UTR / reference (optional)" value={form.offlineRef} onChange={(e) => set('offlineRef', e.target.value)} />
              <p className="text-xs text-[#6b5560] sm:col-span-2">Invoice email ke liye upar guest ka email zaroor bharein.</p>
            </div>
          )}
          <button disabled={busy} className="mt-5 flex items-center gap-2 rounded-full bg-[#4b0718] px-6 py-3 font-bold text-white disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {form.offline ? 'Paid entry banao + invoice bhejo' : 'Payment link banao'}
          </button>
        </form>

        {created && (
          <div className="rounded-2xl border border-[#9be28a] bg-[#f3fff0] p-5">
            <p className="font-bold text-[#255018]">Link taiyar hai ({inr(created.amount_paise)})</p>
            <p className="mt-2 break-all rounded-xl bg-white p-3 text-sm">{created.payUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={btn} onClick={() => copy(created.payUrl)}><Copy className="h-3.5 w-3.5" /> Copy link</button>
              <a className={btn} href={whatsappLink(created)} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp par bhejo</a>
            </div>
          </div>
        )}

        <section className="rounded-2xl border border-[#d7a84f]/25 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-[#4b0718]">Payments</h2>
            <button className={btn} onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          </div>
          <div className="mt-4 space-y-3">
            {items.length === 0 && <p className="text-sm text-[#6b5560]">Abhi koi payment request nahi hai.</p>}
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[#eadfce] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-[#4b0718]">{item.guest_name} · {inr(item.amount_paise)}</p>
                    <p className="text-xs text-[#6b5560]">
                      {[item.booking_id, item.room, item.guest_phone, item.guest_email].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-xs text-[#6b5560]">
                      {new Date(item.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      {item.invoice_no ? ` · ${item.invoice_no}` : ''}
                      {item.status === 'paid' && !item.invoice_emailed_at ? ' · invoice email nahi gaya' : ''}
                    </p>
                  </div>
                  {statusChip(item)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.status === 'created' && (
                    <>
                      <button className={btn} onClick={() => copy(item.payUrl)}><Copy className="h-3.5 w-3.5" /> Copy link</button>
                      <a className={btn} href={whatsappLink(item)} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
                      <button
                        className={btn}
                        onClick={() => {
                          const method = window.prompt('Payment kaise mila? (UPI QR / Cash / Bank transfer)', 'UPI QR')
                          if (!method) return
                          const email = window.prompt('Guest ka email (invoice yahin jayega)', item.guest_email || '') || ''
                          void act({ action: 'mark_offline', id: item.id, method, email }, 'Payment paid mark ho gaya.')
                        }}
                      >
                        Payment mil gaya (offline)
                      </button>
                      <button className={btn} onClick={() => window.confirm('Ye link band kar dein?') && void act({ action: 'cancel', id: item.id }, 'Link cancel ho gaya.')}>Cancel</button>
                    </>
                  )}
                  {item.status === 'paid' && (
                    <>
                      {item.invoiceUrl && <a className={btn} href={item.invoiceUrl} target="_blank" rel="noreferrer"><FileText className="h-3.5 w-3.5" /> Invoice</a>}
                      <button
                        className={btn}
                        onClick={() => {
                          const email = window.prompt('Invoice kis email par bhejna hai?', item.guest_email || '')
                          if (email) void act({ action: 'resend', id: item.id, email }, 'Invoice email bhej diya gaya.')
                        }}
                      >
                        Invoice dobara email karo
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
