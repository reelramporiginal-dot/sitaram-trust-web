import { Link, NavLink } from 'react-router-dom'
import { Menu, Phone, X } from 'lucide-react'
import { useState } from 'react'
import { LogoMark } from './LogoMark'
import type { Settings } from '../types'

const links = [
  { href: '/', label: 'Home' },
  { href: '/#rooms', label: 'Rooms' },
  { href: '/#video', label: 'OTT Player' },
  { href: '/#qr', label: 'QR Services' },
]

export function Navbar({ onBook, settings }: { onBook: () => void; settings: Settings }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#2a0611]/80 backdrop-blur-xl" style={{ backgroundColor: `${settings.primaryColor}dd` }}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center">
          <LogoMark settings={settings} />
        </Link>
        <div className="hidden items-center gap-7 lg:flex">
          {links.map((link) =>
            link.href.startsWith('/#') ? (
              <a key={link.label} href={link.href} className="text-sm font-medium text-white/80 transition hover:text-[#f5d891]">
                {link.label}
              </a>
            ) : (
              <NavLink key={link.label} to={link.href} className="text-sm font-medium text-white/80 transition hover:text-[#f5d891]">
                {link.label}
              </NavLink>
            ),
          )}
          <div className="hidden rounded-full border border-[#d7a84f]/25 bg-white/10 px-4 py-2 text-xs font-semibold text-[#f5d891] xl:block">
            <span className="inline-flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {settings.phone} / {settings.secondaryPhone} • Helpline {settings.helpline}</span>
          </div>
          <button onClick={onBook} style={{ background: settings.accentColor, color: settings.primaryColor }} className="rounded-full px-5 py-2 text-sm font-bold shadow-lg shadow-[#d7a84f]/25 transition hover:scale-105">
            Book Now
          </button>
        </div>
        <button className="rounded-full border border-white/15 p-2 text-white lg:hidden" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu">
          {open ? <X /> : <Menu />}
        </button>
      </nav>
      {open && (
        <div className="border-t border-white/10 px-5 py-4 lg:hidden" style={{ backgroundColor: settings.primaryColor }}>
          <div className="flex flex-col gap-4">
            {links.map((link) => (
              <a key={link.label} href={link.href} onClick={() => setOpen(false)} className="text-sm font-semibold text-white/85">
                {link.label}
              </a>
            ))}
            <a href={`tel:${settings.phone}`} className="rounded-2xl border border-[#d7a84f]/25 bg-white/10 p-3 text-sm font-semibold text-[#f5d891]">
              Mobile: {settings.phone}, {settings.secondaryPhone}<br />Helpline: {settings.helpline}
            </a>
            <button onClick={() => { setOpen(false); onBook() }} style={{ background: settings.accentColor, color: settings.primaryColor }} className="rounded-full px-5 py-3 font-bold">
              Book Now
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
