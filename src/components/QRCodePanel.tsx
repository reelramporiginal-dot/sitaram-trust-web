import { CreditCard, Download, Info, QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Settings } from '../types'

function FakeQR({ seed, className = '' }: { seed: string; className?: string }) {
  const cells = Array.from({ length: 121 }, (_, index) => {
    const code = seed.charCodeAt(index % seed.length) + index * 17
    return code % 3 !== 0
  })
  return (
    <div className={`grid grid-cols-11 gap-1 rounded-2xl bg-white p-3 shadow-inner ${className}`}>
      {cells.map((active, index) => (
        <span key={index} className={`h-2 w-2 rounded-[2px] ${active ? 'bg-[#2a0611]' : 'bg-transparent'}`} />
      ))}
    </div>
  )
}

export function QRCodePanel({ settings }: { settings: Settings }) {
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const paymentQr = settings.paymentQr || '/images/WhatsApp Image 2026-05-12 at 8.14.37 AM (1).jpeg'
  const installQr = settings.appInstallQr || (origin ? `https://api.qrserver.com/v1/create-qr-code/?size=700x700&margin=24&data=${encodeURIComponent(origin)}` : '')
  const pendingCards = [
    { icon: Info, title: 'Instant Check‑in QR', text: 'Pending slot: admin can upload a check-in/info QR here later.', image: settings.checkinQr, field: 'checkinQr' },
    { icon: QrCode, title: 'Room Service QR', text: 'Pending slot: admin can upload a room service QR here later.', image: settings.roomServiceQr, field: 'roomServiceQr' },
  ]

  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-6 overflow-hidden lg:grid-cols-2">
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center justify-center rounded-[2rem] border border-[#d7a84f]/30 bg-white p-4 text-center shadow-xl shadow-[#4b0718]/10 sm:p-8 lg:max-w-none">
        <div className="mx-auto flex w-full max-w-[320px] items-center justify-center rounded-[1.75rem] border-4 border-[#d7a84f]/35 bg-[#fffaf1] p-3 shadow-inner sm:max-w-[380px]">
          <img src={paymentQr} alt="Payment QR code for Shri Sitaram Seva Trust" className="mx-auto h-auto w-full max-w-[260px] rounded-[1.25rem] object-contain sm:max-w-[340px]" onError={(event) => { event.currentTarget.src = '/images/WhatsApp Image 2026-05-12 at 8.14.37 AM (1).jpeg' }} />
        </div>
        <h3 className="mt-6 font-serif text-3xl font-bold text-[#4b0718]">Official Payment QR</h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-[#6b5560]">Scan this QR code for room booking advance, seva contribution, and secure payment confirmation.</p>
      </div>
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center justify-center rounded-[2rem] border border-[#d7a84f]/30 bg-white p-4 text-center shadow-xl shadow-[#4b0718]/10 sm:p-8 lg:max-w-none">
        <div className="mx-auto flex w-full max-w-[320px] items-center justify-center rounded-[1.75rem] border-4 border-[#d7a84f]/35 bg-[#fffaf1] p-3 shadow-inner sm:max-w-[380px]">
          {installQr ? <img src={installQr} alt="Install app QR code" className="mx-auto h-auto w-full max-w-[260px] rounded-[1.25rem] object-contain sm:max-w-[340px]" /> : <FakeQR seed="install-app" />}
        </div>
        <h3 className="mt-6 font-serif text-3xl font-bold text-[#4b0718]">Install App QR</h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-[#6b5560]">Scan this QR to open the website and install the app on mobile. Admin can also upload a custom install QR.</p>
        {origin && <a href={origin} className="mt-4 rounded-full border border-[#d7a84f]/35 px-4 py-2 text-sm font-bold text-[#4b0718]">Open App Link</a>}
      </div>
      <div className="grid min-w-0 gap-5 lg:col-span-2 lg:grid-cols-2">
      {pendingCards.map((card) => {
        const Icon = card.icon
        return (
          <div key={card.title} className={`min-w-0 rounded-[2rem] border bg-white p-5 shadow-xl shadow-[#4b0718]/10 sm:p-6 ${card.image ? 'border-[#d7a84f]/25' : 'border-dashed border-[#d7a84f]/45'}`}>
            <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
              <div className="rounded-2xl bg-[#4b0718] p-3 text-[#f5d891]"><Icon /></div>
              {card.image ? <img src={card.image} alt={card.title} className="h-28 w-28 rounded-2xl object-contain" /> : <div className="grid h-28 w-28 place-items-center rounded-2xl border-2 border-dashed border-[#d7a84f]/40 bg-[#fffaf1] text-center text-[10px] font-bold uppercase tracking-wider text-[#b7812d]">Empty<br />Admin QR Slot</div>}
            </div>
            <h3 className="mt-6 font-serif text-2xl font-bold text-[#4b0718]">{card.title}</h3>
            <p className="mt-3 text-sm leading-6 text-[#6b5560]">{card.text}</p>
            <p className="mt-3 rounded-full bg-[#fff8eb] px-3 py-2 text-xs font-bold text-[#4b0718]">Admin field: {card.field}</p>
          </div>
        )
      })}
      </div>
    </div>
  )
}
