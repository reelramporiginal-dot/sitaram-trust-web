import { Phone, MessageCircle } from 'lucide-react'
import type { Settings } from '../types'

export function FloatingActions({ settings }: { settings: Settings }) {
  const phone = settings.phone.replace(/\s+/g, '') || '9918310009'
  const rawWhatsapp = settings.whatsapp.replace(/[^0-9]/g, '') || '9918310009'
  const whatsapp = rawWhatsapp.startsWith('91') ? rawWhatsapp : `91${rawWhatsapp}`
  const message = encodeURIComponent(`Jai Shri Ram, I want to book a room at ${settings.trustName}, ${settings.location}.`)

  return (
    <>
      <a
        href={`tel:${phone}`}
        aria-label="Call Shri Sitaram Seva Trust"
        className="fixed bottom-5 left-4 z-[60] grid h-14 w-14 place-items-center rounded-full border border-[#d7a84f]/40 bg-[#4b0718] text-[#f5d891] shadow-2xl shadow-black/25 transition hover:scale-105 sm:left-6"
      >
        <Phone className="h-6 w-6" />
      </a>
      <a
        href={`https://wa.me/${whatsapp}?text=${message}`}
        target="_blank"
        rel="noreferrer"
        aria-label="WhatsApp Shri Sitaram Seva Trust"
        className="fixed bottom-5 right-4 z-[60] grid h-14 w-14 place-items-center rounded-full border border-white/30 bg-[#25D366] text-white shadow-2xl shadow-black/25 transition hover:scale-105 sm:right-6"
      >
        <MessageCircle className="h-7 w-7" />
      </a>
    </>
  )
}
