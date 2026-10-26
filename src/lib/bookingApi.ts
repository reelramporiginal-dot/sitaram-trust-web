// ROOT PATH: src/lib/bookingApi.ts
// Thin client for /api/booking-* . The browser never sends an amount: server prices everything.
export type Quote = {
  room_id: string
  room_name: string
  nights: number
  rooms: number
  unit_price_paise: number
  subtotal_paise: number
  tax_paise: number
  total_paise: number
  advance_paise: number
  advance_percent: number
  units_left: number
  max_guests: number
}

export type CreateResponse = {
  success: true
  booking_ref: string
  token: string
  payment_session_id: string
  order_id: string
  amount_paise: number
  env: 'sandbox' | 'production'
}

export type PublicBooking = {
  ref: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'completed' | 'refunded'
  room: string
  roomsCount: number
  checkIn: string
  checkOut: string
  guests: number
  guestName: string
  subtotal: number
  tax: number
  total: number
  advance: number
  paid: number
  balance: number | null
  payment: { status: string; rawStatus: string | null; refundStatus: string | null } | null
  holdExpiresAt: string | null
  invoiceUrl: string | null
  invoiceNo: string | null
}

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(url: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('Internet check karke dobara koshish karein.', 0)
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string }
  if (!res.ok) throw new ApiError(json.error || 'Kuch gadbad ho gayi, dobara koshish karein.', res.status, json.code)
  return json
}

const post = <T,>(url: string, body: unknown, signal?: AbortSignal) =>
  request<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, signal)

export type StayInput = { room_id: string; check_in: string; check_out: string; rooms_count: number; guests: number }

export const getQuote = (stay: StayInput, signal?: AbortSignal) =>
  post<{ success: true; quote: Quote }>('/api/booking-quote', { ...stay, pay_mode: 'advance' }, signal).then((r) => r.quote)

export const createBooking = (
  body: StayInput & {
    pay_mode: 'full' | 'advance'
    name: string
    phone: string
    email: string
    marketing_consent: boolean
    consent_text: string | null
    turnstile_token?: string
  },
) => post<CreateResponse>('/api/booking-create', body)

export const retryPayment = (ref: string, token: string) =>
  post<CreateResponse | { success: true; alreadyPaid: true }>('/api/booking-retry', { ref, token })

export const getStatus = (ref: string, token: string, signal?: AbortSignal) =>
  request<{ success: true; booking: PublicBooking }>(
    `/api/booking-status?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(token)}`,
    undefined,
    signal,
  ).then((r) => r.booking)

// ---------- Cashfree JS SDK v3 ----------
type CashfreeCtor = (o: { mode: 'sandbox' | 'production' }) => {
  checkout: (o: { paymentSessionId: string; redirectTarget?: '_self' | '_blank' | '_modal' }) => Promise<unknown>
}
declare global {
  interface Window {
    Cashfree?: CashfreeCtor
  }
}

let sdk: Promise<boolean> | null = null
function loadCashfree(): Promise<boolean> {
  if (window.Cashfree) return Promise.resolve(true)
  if (!sdk) {
    sdk = new Promise<boolean>((resolve) => {
      const s = document.createElement('script')
      s.src = 'https://sdk.cashfree.com/js/v3/cashfree.js'
      s.async = true
      s.onload = () => resolve(Boolean(window.Cashfree))
      s.onerror = () => {
        sdk = null
        resolve(false)
      }
      document.head.appendChild(s)
    })
  }
  return sdk
}

// Redirects the whole page to the hosted checkout; the guest comes back to /booking/:ref (return_url).
export async function openCheckout(paymentSessionId: string, env: 'sandbox' | 'production'): Promise<void> {
  const wanted = import.meta.env.VITE_CASHFREE_ENV as string | undefined
  if (wanted && wanted !== env) console.error(`CASHFREE env mismatch: server=${env} client=${wanted}`)
  const ok = await loadCashfree()
  if (!ok || !window.Cashfree) throw new ApiError('Payment window load nahi hui. Internet check karke dobara koshish karein.', 0)
  await window.Cashfree({ mode: env }).checkout({ paymentSessionId, redirectTarget: '_self' })
}
