import { Crown } from 'lucide-react'
import type { Settings } from '../types'

export function LogoMark({ compact = false, settings }: { compact?: boolean; settings?: Settings }) {
  if (settings?.showLogo === false) return null

  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-12 w-12 place-items-center rounded-full border border-[#d7a84f]/60 bg-gradient-to-br from-[#fff8df] via-[#d7a84f] to-[#7d1128] shadow-[0_0_35px_rgba(215,168,79,0.35)]">
        <div className="absolute inset-1 rounded-full border border-white/55" />
        {settings?.logoUrl ? <img src={settings.logoUrl} alt={settings.trustName} className="relative z-10 h-9 w-9 rounded-full object-cover" /> : <Crown className="relative z-10 h-6 w-6 text-[#4b0718]" />}
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="font-serif text-lg font-bold tracking-wide text-white">{settings?.trustName?.replace(' Seva Trust', '') || 'Shri Sitaram'}</p>
          <p className="text-[11px] uppercase tracking-[0.32em] text-[#f5d891]">Seva Trust</p>
        </div>
      )}
    </div>
  )
}
