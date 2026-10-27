import { Bath, BedDouble, Check, IndianRupee, Layers, Lock, MessageCircle, Users } from 'lucide-react'
import type { Room } from '../types'
import { isTestModeOnly, onlinePaymentsEnabled } from '../lib/hotel'

export function RoomCard({ room, onPay, onBook, whatsapp, phone }: { room: Room; onPay: (room: Room) => void; onBook: (roomName: string) => void; whatsapp: string; phone: string }) {
  const soldOut = room.available <= 0
  const payOn = onlinePaymentsEnabled()
  const wa = `https://wa.me/91${whatsapp.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Namaste, mujhe ${room.name} ke baare me jaankari chahiye.`)}`
  return (
    <article className="group overflow-hidden rounded-[2rem] border border-[#d7a84f]/20 bg-white shadow-xl shadow-[#4b0718]/10">
      <div className="relative h-72 overflow-hidden">
        <img src={room.image} alt={`${room.name} at Shri Sitaram Seva Trust, Ayodhya`} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#25030d]/85 to-transparent" />
        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#f5d891]">{room.tagline}</p>
            <h3 className="mt-2 font-serif text-3xl font-bold text-white">{room.name}</h3>
          </div>
          <div className="rounded-2xl bg-white/95 px-4 py-3 text-[#4b0718]">
            <div className="flex items-center text-sm font-black"><IndianRupee className="h-4 w-4" />{room.price.toLocaleString('en-IN')}</div>
            <p className="text-[11px] uppercase tracking-wider">+ ₹{room.tax} tax</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <p className="text-sm leading-6 text-[#5d4450]">{room.description}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-4">
          <div className="rounded-2xl bg-[#fff8eb] p-3 text-[#4b0718]"><Users className="mx-auto mb-1 h-5 w-5 text-[#b7812d]" />{room.capacity}</div>
          <div className="rounded-2xl bg-[#fff8eb] p-3 text-[#4b0718]"><BedDouble className="mx-auto mb-1 h-5 w-5 text-[#b7812d]" />{room.size}</div>
          <div className="rounded-2xl bg-[#fff8eb] p-3 text-[#4b0718]"><Layers className="mx-auto mb-1 h-5 w-5 text-[#b7812d]" />{room.floor}</div>
          <div className="rounded-2xl bg-[#fff8eb] p-3 text-[#4b0718]"><Bath className="mx-auto mb-1 h-5 w-5 text-[#b7812d]" />{room.bathType}</div>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#4b0718]/5 px-3 py-2 text-xs font-bold text-[#4b0718]"><Check className="h-4 w-4 text-[#b7812d]" /> {soldOut ? 'Currently sold out' : room.available <= 3 ? `Only ${room.available} left` : 'Available for booking'}</div>
        <div className="mt-5 flex flex-wrap gap-2">
          {room.amenities.map((item) => (
            <span key={item} className="rounded-full border border-[#d7a84f]/25 px-3 py-1 text-xs font-semibold text-[#4b0718]">{item}</span>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {room.gallery.map((image) => (
            <img key={image} src={image} alt={`${room.name} interior view, Shri Sitaram Seva Trust Ayodhya`} loading="lazy" decoding="async" className="h-20 rounded-2xl object-cover" />
          ))}
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-[1.6fr_1fr]">
          <button
            type="button"
            onClick={() => (payOn ? onPay(room) : onBook(room.name))}
            disabled={soldOut}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#4b0718] px-5 py-3.5 font-bold text-white shadow-lg shadow-[#4b0718]/20 transition hover:bg-[#7d1128] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Lock className="h-4 w-4 text-[#f5d891]" /> {soldOut ? 'Sold out' : 'Book & Pay'}
          </button>
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d7a84f]/60 px-5 py-3.5 text-sm font-bold text-[#4b0718] transition hover:bg-[#fff3d8]"
          >
            <MessageCircle className="h-4 w-4 text-[#b7812d]" /> WhatsApp
          </a>
        </div>
        <p className="mt-3 text-center text-xs text-[#6b5560]">
          {payOn ? `${isTestModeOnly() ? 'TEST MODE (sirf aapke browser me) · ' : ''}UPI · Card · Net Banking · Secured by Cashfree · ` : 'Form bharein, hum aapse jald sampark karenge · '}
          <a href={`tel:${phone}`} className="font-semibold underline">Call {phone}</a>
        </p>
      </div>
    </article>
  )
}
