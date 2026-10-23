// Tracking helper for a Vite + React SPA: Meta Pixel + Google Ads (gtag).
// Env vars (set in .env.local and in Vercel):
//   VITE_META_PIXEL_ID          -> Meta Pixel ID
//   VITE_GADS_ID                -> Google Ads ID, e.g. AW-1234567890
//   VITE_GADS_LABEL_CALL        -> conversion label for call clicks
//   VITE_GADS_LABEL_WHATSAPP    -> conversion label for WhatsApp clicks
//   VITE_GADS_LABEL_LEAD        -> conversion label for booking form
// Any missing variable makes that part silently do nothing.

type Fbq = {
  (...args: unknown[]): void
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: Fbq
  loaded: boolean
  version: string
}

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined
const GADS_ID = import.meta.env.VITE_GADS_ID as string | undefined
const GADS_LABELS: Record<string, string | undefined> = {
  call: import.meta.env.VITE_GADS_LABEL_CALL as string | undefined,
  whatsapp: import.meta.env.VITE_GADS_LABEL_WHATSAPP as string | undefined,
  lead: import.meta.env.VITE_GADS_LABEL_LEAD as string | undefined,
}

let initialized = false

function initGoogleAds() {
  if (!GADS_ID || typeof window === 'undefined' || window.gtag) return

  window.dataLayer = window.dataLayer || []
  window.gtag = function (...args: unknown[]) {
    window.dataLayer!.push(args)
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GADS_ID}`
  document.head.appendChild(script)

  window.gtag('js', new Date())
  window.gtag('config', GADS_ID)
}

function initFacebookPixel() {
  if (!PIXEL_ID) return

  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args)
      else fbq.queue.push(args)
    } as Fbq
    fbq.queue = []
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    window.fbq = fbq
    window._fbq = fbq

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(script)
  }

  window.fbq?.('init', PIXEL_ID)
}

// Kept under the same name so existing imports keep working.
export function initMetaPixel() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  initFacebookPixel()
  initGoogleAds()
}

export function trackPageView() {
  if (PIXEL_ID) window.fbq?.('track', 'PageView')
  if (GADS_ID) window.gtag?.('event', 'page_view')
}

// Events used on this site:
//   Lead    -> booking form submitted
//   Contact -> WhatsApp / phone call button clicked (params.method = 'call' | 'whatsapp')
export function trackEvent(name: 'Lead' | 'Contact', params?: Record<string, unknown>) {
  if (PIXEL_ID) window.fbq?.('track', name, params)

  if (GADS_ID && window.gtag) {
    const key = name === 'Lead' ? 'lead' : String(params?.method ?? '')
    const label = GADS_LABELS[key]
    if (label) {
      window.gtag('event', 'conversion', { send_to: `${GADS_ID}/${label}` })
    }
  }
}
