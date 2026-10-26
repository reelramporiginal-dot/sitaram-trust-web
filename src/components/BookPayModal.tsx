// ROOT PATH: src/components/BookPayModal.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, Loader2, Lock, Minus, Phone, Plus, ShieldCheck, X } from 'lucide-react'
import type { Room } from '../types'
import { ApiError, createBooking, getQuote, openCheckout, type Quote } from '../lib/bookingApi'
import { CONSENT_TEXT, HOTEL_PHONES, ID_REQUIREMENT, inr } from '../lib/hotel'
import { trackEvent } from '../lib/metaPixel'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00`)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const nice = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string
      remove: (id: string) => void
    }
  }
}
const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!TURNSTILE_KEY) return
    let widget = ''
    let cancelled = false
    const mount = () => {
      if (cancelled || !box.current || !window.turnstile) return
      widget = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_KEY,
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    }
    if (window.turnstile) mount()
    else {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = mount
      document.head.appendChild(s)
    }
    return () => {
      cancelled = true
      if (widget && window.turnstile) window.turnstile.remove(widget)
    }
  }, [onToken])
  return TURNSTILE_KEY ? <div ref={box} className="mt-3 flex justify-center" /> : null
}

function Stepper({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[#d7a84f]/30 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-[#7a6a70]">{label}</p>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" aria-label={`${label} kam karein`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="grid h-10 w-10 place-items-center rounded-full border border-[#d7a84f]/50 text-[#4b0718] disabled:opacity-30"><Minus className="h-4 w-4" /></button>
        <span className="text-xl font-black text-[#4b0718]" aria-live="polite">{value}</span>
        <button type="button" aria-label={`${label} badhayein`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="grid h-10 w-10 place-items-center rounded-full border border-[#d7a84f]/50 text-[#4b0718] disabled:opacity-30"><Plus className="h-4 w-4" /></button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-[#7a6a70]">{hint}</p>}
    </div>
  )
}

const inputCls = 'mt-1 w-full rounded-2xl border border-[#d7a84f]/40 bg-white px-4 py-3 text-base text-[#3b2a30] outline-none focus:border-[#4b0718] focus:ring-2 focus:ring-[#d7a84f]/40'

export function BookPayModal({ room, onClose }: { room: Room; onClose: () => void }) {
  const isDorm = /dorm/i.test(room.name)
  const unit = isDorm ? 'Bed' : 'Room'
  const perUnit = isDorm ? 1 : Math.max(1, parseInt(String(room.capacity), 10) || 2)
  const today = ymd(new Date())

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [checkIn, setCheckIn] = useState(addDays(today, 1))
  const [checkOut, setCheckOut] = useState(addDays(today, 2))
  const [rooms, setRooms] = useState(1)
  const [guests, setGuests] = useState(Math.min(2, perUnit))
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [marketing, setMarketing] = useState(false)
  const [agree, setAgree] = useState(false)
  const [payMode, setPayMode] = useState<'advance' | 'full'>('advance')
  const [turnstile, setTurnstile] = useState('')

  const [quoteRaw, setQuote] = useState<Quote | null>(null)
  const [quoteErrRaw, setQuoteErr] = useState('')
  const [quoting, setQuoting] = useState(true)
  const [formErr, setFormErr] = useState('')
  const [paying, setPaying] = useState(false)
  const payLock = useRef(false)
  const firstField = useRef<HTMLInputElement>(null)

  const maxRooms = Math.max(1, Math.min(30, room.available || 1))
  const maxGuests = rooms * perUnit

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !payLock.current && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    if (step === 2) firstField.current?.focus()
  }, [step])

  // keep guests within capacity when rooms change
  const changeRooms = (n: number) => {
    setRooms(n)
    setGuests((g) => Math.min(Math.max(g, 1), n * perUnit))
  }

  // live, server-computed price (debounced)
  const stayKey = `${checkIn}|${checkOut}|${rooms}|${guests}`
  const datesOk = checkOut > checkIn
  useEffect(() => {
    if (!datesOk) return
    const ac = new AbortController()
    const t = setTimeout(() => {
      setQuoting(true)
      setQuoteErr('')
      getQuote({ room_id: room.id, check_in: checkIn, check_out: checkOut, rooms_count: rooms, guests }, ac.signal)
        .then((q) => {
          setQuote(q)
          setQuoting(false)
        })
        .catch((e: Error) => {
          if (e.name === 'AbortError') return
          setQuote(null)
          setQuoteErr(e.message)
          setQuoting(false)
        })
    }, 350)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stayKey, room.id])

  const quote = datesOk ? quoteRaw : null
  const quoteErr = datesOk ? quoteErrRaw : 'Check-out, check-in ke baad ki date ka hona chahiye.'
  const advanceDiffers = quote ? quote.advance_paise < quote.total_paise : false
  const mode = advanceDiffers ? payMode : 'full'
  const payNow = useMemo(() => (quote ? (mode === 'full' ? quote.total_paise : quote.advance_paise) : 0), [quote, mode])

  const validateDetails = () => {
    if (name.trim().replace(/\s+/g, ' ').length < 2) return 'Apna poora naam daalein.'
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))) return '10 digit ka sahi mobile number daalein.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Sahi email daalein. Confirmation aur invoice isi par aayega.'
    return ''
  }

  const next = () => {
    setFormErr('')
    if (step === 1) {
      if (!quote) return setFormErr(quoteErr || 'Pehle dates aur guests sahi chunein.')
      setStep(2)
    } else if (step === 2) {
      const err = validateDetails()
      if (err) return setFormErr(err)
      setStep(3)
    }
  }

  const pay = async () => {
    if (payLock.current || !quote) return // double-click guard
    setFormErr('')
    if (!agree) return setFormErr('Aage badhne ke liye Terms aur Refund Policy par tick karein.')
    const err = validateDetails()
    if (err) {
      setStep(2)
      return setFormErr(err)
    }
    if (TURNSTILE_KEY && !turnstile) return setFormErr('Neeche diya security check poora karein.')
    payLock.current = true
    setPaying(true)
    try {
      const res = await createBooking({
        room_id: room.id,
        check_in: checkIn,
        check_out: checkOut,
        rooms_count: rooms,
        guests,
        pay_mode: mode,
        name: name.trim(),
        phone: phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''),
        email: email.trim().toLowerCase(),
        marketing_consent: marketing,
        consent_text: marketing ? CONSENT_TEXT : null,
        turnstile_token: turnstile || undefined,
      })
      trackEvent('Lead', { value: res.amount_paise / 100, currency: 'INR', content_name: room.name })
      try {
        await openCheckout(res.payment_session_id, res.env)
      } catch {
        // booking is held for 20 minutes: status page lets the guest retry the payment
        window.location.href = `/booking/${encodeURIComponent(res.booking_ref)}?t=${encodeURIComponent(res.token)}`
      }
    } catch (e) {
      const ae = e as ApiError
      setFormErr(ae.message)
      if (ae.code === 'SOLD_OUT' || ae.status === 409) setStep(1)
      payLock.current = false
      setPaying(false)
    }
  }

  const stepTitle = ['Dates aur guests', 'Aapki details', 'Payment'][step - 1]

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="bp-title" onMouseDown={(e) => e.target === e.currentTarget && !paying && onClose()}>
      <div className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] bg-[#fffaf1] shadow-2xl sm:rounded-[1.75rem]">
        <header className="flex items-center gap-3 border-b border-[#d7a84f]/25 bg-[#2a0611] px-4 py-3 text-white">
          {step > 1 ? (
            <button type="button" aria-label="Peeche jayein" onClick={() => { setFormErr(''); setStep((s) => (s - 1) as 1 | 2) }} disabled={paying} className="grid h-9 w-9 place-items-center rounded-full border border-white/25"><ChevronLeft className="h-5 w-5" /></button>
          ) : (
            <img src={room.image} alt="" className="h-9 w-9 rounded-full object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p id="bp-title" className="truncate font-serif text-lg font-bold">{room.name}</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#f5d891]">Step {step}/3 · {stepTitle}</p>
          </div>
          <button type="button" aria-label="Band karein" onClick={onClose} disabled={paying} className="grid h-9 w-9 place-items-center rounded-full border border-white/25"><X className="h-5 w-5" /></button>
        </header>
        <div className="h-1 bg-[#d7a84f]/20"><div className="h-1 bg-[#d7a84f] transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#7a6a70]" htmlFor="bp-in">Check-in
                  <input id="bp-in" type="date" min={today} value={checkIn} onChange={(e) => { setCheckIn(e.target.value); if (e.target.value >= checkOut) setCheckOut(addDays(e.target.value, 1)) }} className={inputCls} />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#7a6a70]" htmlFor="bp-out">Check-out
                  <input id="bp-out" type="date" min={addDays(checkIn, 1)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inputCls} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stepper label={isDorm ? 'Beds' : 'Rooms'} value={rooms} min={1} max={maxRooms} onChange={changeRooms} />
                <Stepper label="Guests" value={guests} min={1} max={maxGuests} onChange={setGuests} hint={`Max ${maxGuests}`} />
              </div>

              <div className="rounded-2xl border border-[#d7a84f]/35 bg-white p-4" aria-live="polite">
                {quoting && !quote ? (
                  <div className="space-y-2" aria-busy="true"><div className="h-4 w-2/3 animate-pulse rounded bg-[#eadfce]" /><div className="h-4 w-1/2 animate-pulse rounded bg-[#eadfce]" /><div className="h-6 w-1/3 animate-pulse rounded bg-[#eadfce]" /></div>
                ) : quote ? (
                  <div className={quoting ? 'opacity-60' : ''}>
                    <div className="flex items-center gap-2 text-sm text-[#5d4450]"><CalendarDays className="h-4 w-4 text-[#b7812d]" />{nice(checkIn)} → {nice(checkOut)} · {quote.nights} {quote.nights > 1 ? 'nights' : 'night'}</div>
                    <dl className="mt-3 space-y-1.5 text-sm text-[#3b2a30]">
                      <div className="flex justify-between"><dt>{inr(quote.unit_price_paise)} × {quote.nights} × {quote.rooms} {unit.toLowerCase()}{quote.rooms > 1 ? 's' : ''}</dt><dd>{inr(quote.subtotal_paise)}</dd></div>
                      {quote.tax_paise > 0 && <div className="flex justify-between"><dt>Tax</dt><dd>{inr(quote.tax_paise)}</dd></div>}
                      <div className="flex justify-between border-t border-dashed border-[#d7a84f]/50 pt-2 text-lg font-black text-[#4b0718]"><dt>Total</dt><dd>{inr(quote.total_paise)}</dd></div>
                    </dl>
                    {quote.units_left <= 3 && <p className="mt-2 rounded-xl bg-[#fff3d8] px-3 py-2 text-xs font-bold text-[#7a4b00]">Sirf {quote.units_left} {unit.toLowerCase()}{quote.units_left > 1 ? 's' : ''} bache hain is date par.</p>}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[#9b1c1c]">{quoteErr || 'Dates chunein.'}</p>
                )}
              </div>
              {!quote && quoteErr && (
                <a href={`tel:${HOTEL_PHONES[0]}`} className="inline-flex items-center gap-2 text-sm font-bold text-[#4b0718] underline"><Phone className="h-4 w-4" /> Help chahiye? Call {HOTEL_PHONES[0]}</a>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <label className="block text-sm font-bold text-[#4b0718]" htmlFor="bp-name">Poora naam
                <input id="bp-name" ref={firstField} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Jaise: Ramesh Kumar" maxLength={100} />
              </label>
              <label className="block text-sm font-bold text-[#4b0718]" htmlFor="bp-phone">Mobile number
                <div className="mt-1 flex items-center rounded-2xl border border-[#d7a84f]/40 bg-white focus-within:border-[#4b0718] focus-within:ring-2 focus-within:ring-[#d7a84f]/40">
                  <span className="border-r border-[#d7a84f]/40 px-3 text-base font-semibold text-[#7a6a70]">+91</span>
                  <input id="bp-phone" inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, '').slice(0, 12))} className="w-full rounded-2xl bg-transparent px-3 py-3 text-base outline-none" placeholder="98XXXXXXXX" />
                </div>
              </label>
              <label className="block text-sm font-bold text-[#4b0718]" htmlFor="bp-email">Email <span className="text-[#9b1c1c]">*</span>
                <input id="bp-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="aap@example.com" maxLength={254} />
                <span className="mt-1 block text-xs font-normal text-[#6b5560]">Booking confirmation aur invoice isi email par aayega.</span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-[#d7a84f]/30 bg-white p-3 text-sm text-[#3b2a30]" htmlFor="bp-mk">
                <input id="bp-mk" type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-5 w-5 accent-[#4b0718]" />
                <span>{CONSENT_TEXT}</span>
              </label>
              <p className="text-xs text-[#6b5560]">Aapki details sirf booking aur sampark ke liye use hoti hain. <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold underline">Privacy Policy</a></p>
            </div>
          )}

          {step === 3 && quote && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#d7a84f]/35 bg-white p-4 text-sm text-[#3b2a30]">
                <p className="font-bold text-[#4b0718]">{room.name} × {quote.rooms}</p>
                <p className="mt-1">{nice(checkIn)} → {nice(checkOut)} · {quote.nights} {quote.nights > 1 ? 'nights' : 'night'} · {guests} guest{guests > 1 ? 's' : ''}</p>
                <p className="mt-1 text-[#6b5560]">{name.trim()} · +91 {phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')} · {email.trim()}</p>
                <p className="mt-2 flex justify-between border-t border-dashed border-[#d7a84f]/50 pt-2 font-black text-[#4b0718]"><span>Total</span><span>{inr(quote.total_paise)}</span></p>
              </div>

              {advanceDiffers && (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-bold text-[#4b0718]">Kitna abhi dena chahte hain?</legend>
                  {([['advance', `Advance ${inr(quote.advance_paise)}`, `Baaki ${inr(quote.total_paise - quote.advance_paise)} hotel par`], ['full', `Poora ${inr(quote.total_paise)}`, 'Hotel par kuch dena nahi']] as const).map(([val, title, sub]) => (
                    <label key={val} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${payMode === val ? 'border-[#4b0718] bg-[#fff3d8]' : 'border-[#d7a84f]/35 bg-white'}`}>
                      <input type="radio" name="paymode" checked={payMode === val} onChange={() => setPayMode(val)} className="h-5 w-5 accent-[#4b0718]" />
                      <span><span className="block font-bold text-[#4b0718]">{title}</span><span className="text-xs text-[#6b5560]">{sub}</span></span>
                    </label>
                  ))}
                </fieldset>
              )}

              <label className="flex items-start gap-3 text-sm text-[#3b2a30]" htmlFor="bp-agree">
                <input id="bp-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-5 w-5 accent-[#4b0718]" />
                <span>Maine <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold underline">Terms</a> aur <a href="/refund-policy" target="_blank" rel="noreferrer" className="font-semibold underline">Refund Policy</a> padh li hai. {ID_REQUIREMENT}</span>
              </label>
              <Turnstile onToken={setTurnstile} />
            </div>
          )}

          {formErr && <p role="alert" className="mt-4 rounded-2xl bg-[#fde8e8] px-4 py-3 text-sm font-semibold text-[#9b1c1c]">{formErr}</p>}
        </div>

        <footer className="border-t border-[#d7a84f]/25 bg-white px-4 py-3">
          {step < 3 ? (
            <button type="button" onClick={next} disabled={step === 1 && (!quote || quoting)} className="w-full rounded-full bg-[#4b0718] px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-[#4b0718]/20 disabled:opacity-50">
              {step === 1 ? (quoting ? 'Price check ho raha hai…' : 'Aage badhein') : 'Payment par jayein'}
            </button>
          ) : (
            <button type="button" onClick={pay} disabled={paying || !quote} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#4b0718] px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-[#4b0718]/20 disabled:opacity-60">
              {paying ? <><Loader2 className="h-5 w-5 animate-spin" /> Payment khul rahi hai…</> : <><Lock className="h-4 w-4 text-[#f5d891]" /> Pay {inr(payNow)} securely</>}
            </button>
          )}
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-[#6b5560]"><ShieldCheck className="h-3.5 w-3.5 text-[#1f7a3d]" /> UPI, Card, Net Banking · Secured by Cashfree <Check className="hidden h-3 w-3" /></p>
          {step === 3 && <p className="mt-1 text-center text-[11px] text-[#6b5560]">Call: {HOTEL_PHONES.join(' / ')}</p>}
        </footer>
      </div>
    </div>
  )
}
