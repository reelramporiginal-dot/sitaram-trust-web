// Google tag helper (Google Ads conversions + optional GA4) for a Vite + React SPA.
// Everything is driven by Vercel / .env variables. If they are missing, every function here silently does nothing.
//
//   VITE_GOOGLE_ADS_ID               e.g. AW-123456789          (Google Ads -> Goals -> Conversions -> tag setup)
//   VITE_GOOGLE_ADS_LEAD_LABEL       conversion label for "Booking form submitted"
//   VITE_GOOGLE_ADS_CALL_LABEL       conversion label for "Call button clicked"
//   VITE_GOOGLE_ADS_WHATSAPP_LABEL   conversion label for "WhatsApp button clicked"
//   VITE_GOOGLE_ADS_PURCHASE_LABEL   conversion label for "Online payment completed" (sends real value)
//   VITE_GA4_ID                      e.g. G-XXXXXXXXXX          (optional, Google Analytics 4)

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const ADS_ID = (import.meta.env.VITE_GOOGLE_ADS_ID as string | undefined)?.trim()
const GA4_ID = (import.meta.env.VITE_GA4_ID as string | undefined)?.trim()
const LABELS = {
  lead: (import.meta.env.VITE_GOOGLE_ADS_LEAD_LABEL as string | undefined)?.trim(),
  call: (import.meta.env.VITE_GOOGLE_ADS_CALL_LABEL as string | undefined)?.trim(),
  whatsapp: (import.meta.env.VITE_GOOGLE_ADS_WHATSAPP_LABEL as string | undefined)?.trim(),
  purchase: (import.meta.env.VITE_GOOGLE_ADS_PURCHASE_LABEL as string | undefined)?.trim(),
}

let initialized = false

export function initGoogleAds() {
  const firstId = ADS_ID || GA4_ID
  if (initialized || !firstId || typeof window === 'undefined') return
  initialized = true

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // gtag.js needs the real `arguments` object, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(firstId)}`
  document.head.appendChild(script)

  window.gtag('js', new Date())
  if (ADS_ID) window.gtag('config', ADS_ID)
  if (GA4_ID) window.gtag('config', GA4_ID)
}

// Called from trackEvent() in metaPixel.ts, so every existing Lead / Contact / Purchase event also reaches Google.
export function trackGoogleConversion(name: 'Lead' | 'Contact' | 'Purchase', params?: Record<string, unknown>) {
  if (!window.gtag) return
  const method = String(params?.method ?? '')
  const label =
    name === 'Lead' ? LABELS.lead : name === 'Purchase' ? LABELS.purchase : method === 'whatsapp' ? LABELS.whatsapp : LABELS.call

  const value = typeof params?.value === 'number' && params.value > 0 ? params.value : undefined
  const currency = value ? String(params?.currency ?? 'INR') : undefined
  const transactionId = params?.transaction_id ? String(params.transaction_id) : undefined

  if (ADS_ID && label) {
    window.gtag('event', 'conversion', {
      send_to: `${ADS_ID}/${label}`,
      ...(value ? { value, currency } : {}),
      ...(transactionId ? { transaction_id: transactionId } : {}),
    })
  }
  if (GA4_ID) {
    const ga4Name = name === 'Purchase' ? 'purchase' : name === 'Lead' ? 'generate_lead' : 'contact'
    window.gtag('event', ga4Name, {
      method: method || undefined,
      ...(value ? { value, currency } : {}),
      ...(transactionId ? { transaction_id: transactionId } : {}),
    })
  }
}
