// ROOT PATH: src/pages/BookingStatus.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CalendarPlus, CheckCircle2, Clock3, FileText, Loader2, MapPin, MessageCircle, Phone, RefreshCw, XCircle } from 'lucide-react'
import { ApiError, getStatus, openCheckout, retryPayment, type PublicBooking } from '../lib/bookingApi'
import { HOTEL_ADDRESS, HOTEL_HELPLINE, HOTEL_NAME_EN, HOTEL_PHONES, ID_REQUIREMENT, inr, refundLines } from '../lib/hotel'
import { storage } from '../lib/storage'
import { trackEvent } from '../lib/metaPixel'
import { useNoIndex } from '../lib/useNoIndex'

const nice = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
const POLL_MS = 3000
const POLL_WINDOW_MS = 120000

function icsUrl(b: PublicBooking) {
  const d = (s: string) => s.replace(/-/g, '')
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shri Sitaram Seva Trust//Booking//EN', 'BEGIN:VEVENT',
    `UID:${b.ref}@sitaram-trust`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d(b.checkIn)}`, `DTEND;VALUE=DATE:${d(b.checkOut)}`,
    `SUMMARY:Stay at ${HOTEL_NAME_EN} (${b.ref})`, `LOCATION:${HOTEL_ADDRESS.replace(/,/g, '\\,')}`,
    `DESCRIPTION:Booking ${b.ref} - ${b.room}. Call ${HOTEL_PHONES[0]}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  return URL.createObjectURL(new Blob([body], { type: 'text/calendar' }))
}

export function BookingStatus() {
  useNoIndex()
  const { ref = '' } = useParams()
  const [sp] = useSearchParams()
  const token = sp.get('t') || ''
  const [b, setB] = useState<PublicBooking | null>(null)
  const [error, setError] = useState('')
  const [slow, setSlow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const started = useRef(0)
  const tracked = useRef(false)
  const settings = storage.getSettings()

  const load = useCallback(async () => {
    try {
      const data = await getStatus(ref, token)
      setB(data)
      setError('')
      return data
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? 'Booking nahi mili. Link check karein ya hotel ko call karein.' : (e as Error).message)
      return null
    }
  }, [ref, token])

  useEffect(() => {
    document.title = 'Booking Status | Shri Sitaram Seva Trust'
    started.current = Date.now()
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      const data = await load()
      if (stop) return
      const waiting = !data || (data.status === 'pending' && data.payment && ['created', 'pending'].includes(data.payment.status))
      const elapsed = Date.now() - started.current
      if (waiting && elapsed < POLL_WINDOW_MS) timer = setTimeout(tick, POLL_MS)
      else if (waiting) setSlow(true)
    }
    tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [load])

  useEffect(() => {
    if (b && ['confirmed', 'completed'].includes(b.status) && !tracked.current) {
      tracked.current = true
      const key = `sst-purchase-${b.ref}`
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        trackEvent('Purchase', { value: b.paid / 100, currency: 'INR', content_name: b.room, transaction_id: b.ref })
      }
    }
  }, [b])

  const retry = async () => {
    setBusy(true)
    setNote('')
    try {
      const r = await retryPayment(ref, token)
      if ('alreadyPaid' in r) {
        await load()
        return
      }
      await openCheckout(r.payment_session_id, r.env)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const recheck = async () => {
    setBusy(true)
    started.current = Date.now()
    setSlow(false)
    await load()
    setBusy(false)
  }

  const wa = `https://wa.me/91${settings.whatsapp.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Namaste, meri booking ${ref} ke baare me jaankari chahiye.`)}`
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.mapQuery)}`
  const pending = b?.status === 'pending'
  const confirmed = b && ['confirmed', 'completed'].includes(b.status)
  const failed = pending && b?.payment?.status === 'failed'
  const verifying = (!b && !error) || (pending && !failed)

  return (
    <main className="min-h-screen bg-[#fffaf1] px-4 py-8">
      <div className="mx-auto max-w-lg">
        <p className="text-center font-serif text-lg font-bold text-[#4b0718]">{HOTEL_NAME_EN}</p>

        {error && !b && (
          <section className="mt-6 rounded-[1.75rem] border border-[#d7a84f]/30 bg-white p-6 text-center shadow-xl" role="alert">
            <XCircle className="mx-auto h-12 w-12 text-[#9b1c1c]" />
            <p className="mt-3 font-semibold text-[#3b2a30]">{error}</p>
            <Link to="/" className="mt-5 inline-block rounded-full bg-[#4b0718] px-6 py-3 font-bold text-white">Home par jayein</Link>
          </section>
        )}

        {verifying && !error && (
          <section className="mt-6 rounded-[1.75rem] border border-[#d7a84f]/30 bg-white p-6 text-center shadow-xl" aria-live="polite">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-[#b7812d]" />
            <h1 className="mt-4 font-serif text-2xl font-bold text-[#4b0718]">Payment confirm ho raha hai…</h1>
            <p className="mt-2 text-sm text-[#6b5560]">Kripya ye page band na karein. Aamtaur par 10-20 second lagte hain.</p>
            {b && <p className="mt-3 text-sm font-bold text-[#4b0718]">Booking ID: {b.ref}</p>}
            {slow && (
              <div className="mt-5 rounded-2xl bg-[#fff3d8] p-4 text-left text-sm text-[#5d4450]">
                <p className="font-bold text-[#4b0718]">Paise kat gaye par confirm nahi hua?</p>
                <p className="mt-1">Chinta na karein. Bank se aane me kabhi kabhi der lagti hai. Hamara system apne aap check karke booking confirm kar dega, ya paisa wapas ho jayega. Aapko email aayega.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={recheck} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-[#4b0718] px-4 py-2 font-bold text-white"><RefreshCw className="h-4 w-4" /> Dobara check karein</button>
                  <a href={`tel:${HOTEL_PHONES[0]}`} className="inline-flex items-center gap-2 rounded-full border border-[#4b0718] px-4 py-2 font-bold text-[#4b0718]"><Phone className="h-4 w-4" /> {HOTEL_PHONES[0]}</a>
                </div>
              </div>
            )}
          </section>
        )}

        {failed && b && (
          <section className="mt-6 rounded-[1.75rem] border border-[#d7a84f]/30 bg-white p-6 text-center shadow-xl" role="alert">
            <XCircle className="mx-auto h-12 w-12 text-[#9b1c1c]" />
            <h1 className="mt-3 font-serif text-2xl font-bold text-[#4b0718]">Payment poora nahi hua</h1>
            <p className="mt-2 text-sm text-[#6b5560]">Aapka room abhi kuch der ke liye roka hua hai. Dobara payment try kar sakte hain. Agar paise kat gaye hain to wo apne aap wapas ya confirm ho jayenge.</p>
            <button type="button" onClick={retry} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#4b0718] px-6 py-3 font-bold text-white disabled:opacity-60">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />} Payment dobara karein</button>
            {note && <p className="mt-3 text-sm font-semibold text-[#9b1c1c]">{note}</p>}
            <p className="mt-4 text-xs text-[#6b5560]">Madad: {HOTEL_PHONES.join(' / ')}</p>
          </section>
        )}

        {confirmed && b && (
          <section className="mt-6 overflow-hidden rounded-[1.75rem] border border-[#d7a84f]/30 bg-white shadow-xl">
            <div className="bg-[#1f7a3d] px-6 py-5 text-center text-white">
              <CheckCircle2 className="mx-auto h-12 w-12" />
              <h1 className="mt-2 font-serif text-2xl font-bold">Booking confirmed 🙏</h1>
              <p className="text-sm text-white/85">Jai Shri Ram, {b.guestName}! Confirmation email bhej diya gaya hai.</p>
            </div>
            <div className="space-y-3 p-6 text-sm text-[#3b2a30]">
              <div className="flex justify-between"><span className="text-[#7a6a70]">Booking ID</span><b className="tracking-wide">{b.ref}</b></div>
              <div className="flex justify-between"><span className="text-[#7a6a70]">Room</span><b>{b.room}{b.roomsCount > 1 ? ` × ${b.roomsCount}` : ''}</b></div>
              <div className="flex justify-between"><span className="text-[#7a6a70]">Check-in</span><b>{nice(b.checkIn)}, {settings.checkIn}</b></div>
              <div className="flex justify-between"><span className="text-[#7a6a70]">Check-out</span><b>{nice(b.checkOut)}, {settings.checkOut}</b></div>
              <div className="flex justify-between"><span className="text-[#7a6a70]">Guests</span><b>{b.guests}</b></div>
              <div className="flex justify-between border-t border-dashed border-[#d7a84f]/50 pt-3"><span className="text-[#7a6a70]">Total</span><b>{inr(b.total)}</b></div>
              <div className="flex justify-between"><span className="text-[#7a6a70]">Paid now</span><b className="text-[#1f7a3d]">{inr(b.paid)}</b></div>
              {b.balance !== null && b.balance > 0 && <div className="flex justify-between"><span className="text-[#7a6a70]">Balance at hotel</span><b>{inr(b.balance)}</b></div>}
              <p className="rounded-2xl bg-[#fff8eb] p-3 text-xs text-[#5d4450]">{ID_REQUIREMENT}</p>
              <div className="grid grid-cols-2 gap-2 pt-2">
                {b.invoiceUrl && <a href={b.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#4b0718] px-4 py-3 font-bold text-white"><FileText className="h-4 w-4" /> Invoice</a>}
                <a href={icsUrl(b)} download={`${b.ref}.ics`} className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d7a84f] px-4 py-3 font-bold text-[#4b0718]"><CalendarPlus className="h-4 w-4" /> Calendar</a>
                <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d7a84f] px-4 py-3 font-bold text-[#4b0718]"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                <a href={maps} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d7a84f] px-4 py-3 font-bold text-[#4b0718]"><MapPin className="h-4 w-4" /> Google Maps</a>
              </div>
              <details className="pt-2 text-xs text-[#6b5560]"><summary className="cursor-pointer font-bold text-[#4b0718]">Cancellation / Refund</summary><ul className="mt-2 list-disc pl-5">{refundLines().map((l) => <li key={l}>{l}</li>)}</ul></details>
            </div>
          </section>
        )}

        {b && ['expired', 'cancelled', 'refunded'].includes(b.status) && (
          <section className="mt-6 rounded-[1.75rem] border border-[#d7a84f]/30 bg-white p-6 text-center shadow-xl">
            <Clock3 className="mx-auto h-12 w-12 text-[#b7812d]" />
            <h1 className="mt-3 font-serif text-2xl font-bold text-[#4b0718]">
              {b.status === 'expired' ? 'Booking ka time khatam ho gaya' : b.status === 'refunded' ? 'Refund ho gaya / process me hai' : 'Booking cancel ho chuki hai'}
            </h1>
            <p className="mt-2 text-sm text-[#6b5560]">
              {b.payment?.status === 'success'
                ? 'Aapka payment mil chuka hai par booking confirm nahi ho saki. Poora paisa wapas kiya ja raha hai (5-7 working days). Email bhi aayega.'
                : b.status === 'expired'
                  ? 'Payment poora nahi hua, isliye room chhod diya gaya. Agar paise kat gaye hain to wo apne aap wapas aa jayenge.'
                  : 'Zyada jaankari ke liye hotel ko call karein.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link to="/#rooms" className="rounded-full bg-[#4b0718] px-6 py-3 font-bold text-white">Dobara book karein</Link>
              <a href={`tel:${HOTEL_PHONES[0]}`} className="rounded-full border border-[#4b0718] px-6 py-3 font-bold text-[#4b0718]">Call {HOTEL_PHONES[0]}</a>
            </div>
          </section>
        )}

        <p className="mt-6 text-center text-xs text-[#6b5560]">{HOTEL_ADDRESS}<br />Helpline: {HOTEL_HELPLINE}</p>
      </div>
    </main>
  )
}
