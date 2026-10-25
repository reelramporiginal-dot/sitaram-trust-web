import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Loader2, Lock, Phone, ShieldCheck } from 'lucide-react'
import { LogoMark } from '../components/LogoMark'
import { useNoIndex } from '../lib/useNoIndex'
import { trackEvent } from '../lib/metaPixel'

type Info = {
  status: 'created' | 'paid' | 'cancelled'
  expired: boolean
  guestName: string
  bookingId: string | null
  room: string | null
  checkIn: string | null
  guests: string | null
  description: string | null
  amount: number
  total: number | null
  email: string
  phone: string
  invoiceUrl: string | null
  gatewayReady: boolean
  hotel: { name: string; phones: string[] }
}

type StartResponse = {
  success: boolean
  error?: string
  keyId: string
  orderId: string
  amount: number
  currency: string
  name: string
  description: string
  prefill: { name: string; email: string; contact: string }
}

type CheckoutResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
type RazorpayInstance = { open: () => void; on: (event: string, cb: (response: { error?: { description?: string } }) => void) => void }
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100)

function loadCheckout(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

async function api<T>(init?: { body: unknown }, query = ''): Promise<T> {
  const res = await fetch(`/api/pay${query}`, {
    method: init ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: init ? JSON.stringify(init.body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(json.error || 'Kuch gadbad ho gayi, dobara koshish karein.')
  return json
}

export function Pay() {
  useNoIndex()
  const { token = '' } = useParams()
  const [info, setInfo] = useState<Info | null>(null)
  const [loadError, setLoadError] = useState('')
  const [email, setEmail] = useState('')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ invoiceUrl: string; email: string; emailed: boolean } | null>(null)

  useEffect(() => {
    document.title = 'Secure Payment | Shri Sitaram Seva Trust'
    api<Info>(undefined, `?t=${encodeURIComponent(token)}`)
      .then((data) => {
        setInfo(data)
        setEmail(data.email || '')
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [token])

  const pay = async () => {
    setError('')
    const clean = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      setError('Sahi email daalein. Payment ka invoice isi email par aayega.')
      return
    }
    setPaying(true)
    try {
      const start = await api<StartResponse>({ body: { action: 'start', token, email: clean } })
      const ready = await loadCheckout()
      if (!ready || !window.Razorpay) throw new Error('Payment window load nahi hui. Internet check karke dobara koshish karein.')

      const checkout = new window.Razorpay({
        key: start.keyId,
        order_id: start.orderId,
        amount: start.amount,
        currency: start.currency,
        name: start.name,
        description: start.description,
        prefill: start.prefill,
        theme: { color: '#4b0718' },
        modal: { ondismiss: () => setPaying(false) },
        handler: async (result: CheckoutResult) => {
          try {
            const verified = await api<{ invoiceUrl: string; emailed: boolean; email: string }>({
              body: { action: 'verify', token, ...result },
            })
            setDone({ invoiceUrl: verified.invoiceUrl, email: verified.email || clean, emailed: verified.emailed })
            // Real money received: tell Meta / Google the exact value (rupees) so ROAS is correct
            trackEvent('Purchase', {
              value: start.amount / 100,
              currency: 'INR',
              content_name: info?.room || 'Room Booking',
              transaction_id: token,
            })
          } catch (e) {
            setError(
              `${(e as Error).message} Agar aapke paise kat gaye hain to chinta na karein, hum verify karke invoice bhej denge. Call: ${info?.hotel.phones.join(', ')}`
            )
          } finally {
            setPaying(false)
          }
        },
      })
      checkout.on('payment.failed', (response) => {
        setError(response.error?.description || 'Payment fail ho gaya. Dobara koshish karein.')
        setPaying(false)
      })
      checkout.open()
    } catch (e) {
      setError((e as Error).message)
      setPaying(false)
    }
  }

  const detail = (label: string, value?: string | null) =>
    value ? (
      <div className="flex justify-between gap-4 border-b border-white/10 py-2 text-sm">
        <span className="text-white/60">{label}</span>
        <span className="text-right font-semibold">{value}</span>
      </div>
    ) : null

  return (
    <main className="min-h-screen bg-[#2a0611] bg-[radial-gradient(circle_at_top,#7d1128,transparent_45%)] px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <LogoMark />
        <div className="mt-6 rounded-[2rem] border border-[#d7a84f]/25 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
          {!info && !loadError && (
            <p className="flex items-center justify-center gap-2 py-10 text-white/80">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading...
            </p>
          )}

          {loadError && (
            <div className="py-8 text-center">
              <p className="text-lg font-bold">Payment link sahi nahi hai</p>
              <p className="mt-2 text-sm text-white/70">Kripya hotel se naya link maangein.</p>
            </div>
          )}

          {info && done && (
            <div className="py-4 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-[#9be28a]" />
              <h1 className="mt-3 font-serif text-2xl font-bold">Payment Successful</h1>
              <p className="mt-2 text-sm text-white/80">
                {inr(info.amount)} ka payment mil gaya. {done.emailed ? <>Invoice <b>{done.email}</b> par bhej diya gaya hai.</> : 'Invoice neeche se dekh sakte hain.'}
              </p>
              <a href={done.invoiceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-block rounded-full bg-[#d7a84f] px-7 py-3 font-black text-[#4b0718]">
                View / Print Invoice
              </a>
              <p className="mt-5 text-xs text-white/60">जय श्री राम 🙏 आपका स्वागत है।</p>
            </div>
          )}

          {info && !done && info.status === 'paid' && (
            <div className="py-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[#9be28a]" />
              <h1 className="mt-3 font-serif text-xl font-bold">Ye payment ho chuka hai</h1>
              {info.invoiceUrl && (
                <a href={info.invoiceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-full bg-[#d7a84f] px-6 py-3 font-black text-[#4b0718]">
                  View Invoice
                </a>
              )}
            </div>
          )}

          {info && !done && info.status === 'cancelled' && (
            <p className="py-8 text-center font-semibold">Ye payment link band kar diya gaya hai. Kripya hotel se sampark karein.</p>
          )}

          {info && !done && info.status === 'created' && info.expired && (
            <p className="py-8 text-center font-semibold">Ye payment link expire ho gaya hai. Hotel se naya link maangein.</p>
          )}

          {info && !done && info.status === 'created' && !info.expired && (
            <>
              <p className="text-xs uppercase tracking-[0.3em] text-[#f5d891]">Secure Payment</p>
              <h1 className="mt-1 font-serif text-2xl font-bold">नमस्ते {info.guestName} जी</h1>
              <div className="mt-4 rounded-2xl bg-black/20 p-4">
                {detail('Booking ID', info.bookingId)}
                {detail('Room', info.room)}
                {detail('Check-in', info.checkIn)}
                {detail('Guests', info.guests)}
                {detail('Details', info.description)}
                {info.total && info.total > info.amount ? detail('Total booking', inr(info.total)) : null}
                <div className="flex items-end justify-between pt-3">
                  <span className="text-white/70">Pay now</span>
                  <span className="font-serif text-3xl font-black text-[#f5d891]">{inr(info.amount)}</span>
                </div>
              </div>

              <label className="mt-5 block text-sm font-semibold" htmlFor="pay-email">
                Aapka Email <span className="text-[#ffb4b4]">*</span>
              </label>
              <input
                id="pay-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aap@example.com"
                className="admin-input mt-2 bg-white text-[#4b0718]"
              />
              <p className="mt-1 text-xs text-white/60">Payment hone ke baad invoice isi email par aayega.</p>

              {error && <p className="mt-3 rounded-xl bg-[#5a0f1d] p-3 text-sm text-[#ffd0d0]">{error}</p>}
              {!info.gatewayReady && <p className="mt-3 rounded-xl bg-[#5a4a0f] p-3 text-sm text-[#fff0ad]">Online payment abhi shuru nahi hua hai. Kripya hotel se sampark karein.</p>}

              <button
                onClick={pay}
                disabled={paying || !info.gatewayReady}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#d7a84f] px-6 py-4 font-black text-[#4b0718] disabled:opacity-60"
              >
                {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                {paying ? 'Please wait...' : `Pay ${inr(info.amount)} securely`}
              </button>
              <p className="mt-3 flex items-center justify-center gap-2 text-xs text-white/60">
                <ShieldCheck className="h-4 w-4" /> UPI, Card, Net Banking · Secured by Razorpay
              </p>
            </>
          )}
        </div>

        {info && (
          <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-white/60">
            <Phone className="h-3.5 w-3.5" /> Madad ke liye call karein: {info.hotel.phones.join(', ')}
          </p>
        )}
      </div>
    </main>
  )
}
