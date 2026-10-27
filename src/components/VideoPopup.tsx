import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Temple } from '../types'

function youtubeId(input: string) {
  const raw = (input || '').trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = url.hostname.replace(/^www\.|^m\./, '')
    let id = ''
    if (host === 'youtu.be') id = url.pathname.split('/')[1] || ''
    else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts[0] === 'watch') id = url.searchParams.get('v') || ''
      else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) id = parts[1] || ''
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : ''
  } catch {
    return ''
  }
}

function youtubeEmbed(id: string) {
  const origin = typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : ''
  return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1${origin}`
}

export function VideoPopup({ youtubeUrl, videoSrc, poster, temples, source = 'storage', trigger = 0 }: { youtubeUrl: string; videoSrc?: string; poster?: string; temples: Temple[]; source?: 'storage' | 'youtube'; trigger?: number }) {
  const [open, setOpen] = useState(false)
  const popupKey = `sst-video-popup-seen-${source}-${youtubeUrl || videoSrc || 'default'}`

  useEffect(() => {
    // Ad se aaye visitor ko popup nahi dikhana (fbclid / utm_source link mein hota hai)
    const params = new URLSearchParams(window.location.search)
    const fromAd = params.has('fbclid') || params.has('utm_source')
    let seen = false
    try { seen = localStorage.getItem(popupKey) === '1' } catch { /* ignore */ }
    if (seen || fromAd) return
    // Sirf ek baar, 8 second baad
    const timer = window.setTimeout(() => {
      setOpen(true)
      try { localStorage.setItem(popupKey, '1') } catch { /* ignore */ }
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [popupKey])

  useEffect(() => {
    if (trigger > 0) setOpen(true)
  }, [trigger])

  const close = () => {
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const ytId = youtubeId(youtubeUrl)
  const watchUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : youtubeUrl

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#16030a]/85 px-4 backdrop-blur-md" onMouseDown={close}>
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-[#d7a84f]/35 bg-[#2a0611] p-3 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <button onClick={close} className="absolute right-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-full border border-[#d7a84f]/50 bg-white text-[#4b0718] shadow-lg transition hover:scale-105 sm:right-4 sm:top-4" aria-label="Close video popup"><X className="h-6 w-6" /></button>
        <div className="p-4 pr-14 text-white">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f5d891]">Ayodhya Darshan</p>
          <h2 className="mt-2 font-serif text-3xl font-bold">Promo video: Ram Mandir, Hanuman Garhi & Kanak Bhawan</h2>
        </div>
        <div className="aspect-video overflow-hidden rounded-[1.5rem] bg-black">
          {source === 'storage' && videoSrc ? (
            <video src={videoSrc} poster={poster} className="h-full w-full object-cover" controls autoPlay muted playsInline onEnded={close} />
          ) : ytId ? (
            <iframe
              title="Ayodhya Darshan promo video"
              src={youtubeEmbed(ytId)}
              className="h-full w-full"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="grid h-full w-full place-items-center p-6 text-center text-white">
              <p>Video link sahi nahi hai. Admin panel me YouTube link check karein.</p>
            </div>
          )}
        </div>
        {source !== 'storage' && ytId && (
          <p className="px-4 pt-3 text-sm text-[#f5d891]">
            Video na chale to <a href={watchUrl} target="_blank" rel="noreferrer" className="font-bold underline">YouTube par dekhein</a>
          </p>
        )}
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {temples.slice(0, 3).map((temple) => (
            <div key={temple.id} className="overflow-hidden rounded-2xl border border-[#d7a84f]/25 bg-white/10">
              <img src={temple.image} alt={temple.name} className="h-24 w-full object-cover" />
              <div className="p-3 text-white">
                <p className="font-serif text-lg font-bold">{temple.name}</p>
                <p className="text-xs text-[#f5d891]">{temple.distance}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
