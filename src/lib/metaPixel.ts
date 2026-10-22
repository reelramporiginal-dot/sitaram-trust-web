// Meta (Facebook) Pixel helper for a Vite + React SPA.
// Pixel ID comes from the env var VITE_META_PIXEL_ID (set it in .env.local and in Vercel).
// If the variable is missing, every function here silently does nothing.

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
  }
}

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined
let initialized = false

export function initMetaPixel() {
  if (initialized || !PIXEL_ID || typeof window === 'undefined') return
  initialized = true

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

export function trackPageView() {
  if (!PIXEL_ID) return
  window.fbq?.('track', 'PageView')
}

// Standard events used on this site:
//   Lead    -> booking form submitted
//   Contact -> WhatsApp / phone call button clicked
export function trackEvent(name: 'Lead' | 'Contact', params?: Record<string, unknown>) {
  if (!PIXEL_ID) return
  window.fbq?.('track', name, params)
}
