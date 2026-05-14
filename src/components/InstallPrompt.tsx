import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('Add this luxury booking app to your home screen for faster access.')

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
      setVisible(true)
      setMessage('Install this app for one-tap booking, calling and Ayodhya guide access.')
    }
    window.addEventListener('beforeinstallprompt', handler)
    const fallback = window.setTimeout(() => {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      if (isMobile && !isStandalone) {
        setVisible(true)
        if (!event) setMessage('Tap browser menu ⋮ and choose “Add to Home screen” if install prompt does not open automatically.')
      }
    }, 2500)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.clearTimeout(fallback)
    }
  }, [])

  const close = () => {
    setVisible(false)
  }

  const install = async () => {
    if (event) {
      await event.prompt()
      await event.userChoice
    } else {
      setMessage('If your browser did not open install, use browser menu ⋮ → Add to Home screen.')
      return
    }
    close()
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-3 bottom-24 z-[70] mx-auto max-w-md rounded-[1.5rem] border border-[#d7a84f]/40 bg-[#2a0611]/95 p-4 text-white shadow-2xl backdrop-blur-xl sm:bottom-7">
      <button onClick={close} aria-label="Close install prompt" className="absolute right-3 top-3 rounded-full bg-white/10 p-1 text-white/70"><X className="h-4 w-4" /></button>
      <div className="flex gap-4 pr-7">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#d7a84f] text-[#4b0718]"><Download /></div>
        <div>
          <p className="font-serif text-xl font-bold">Install Shri Sitaram Seva Trust</p>
          <p className="mt-1 text-sm text-white/70">{message}</p>
          <button onClick={install} className="mt-3 rounded-full bg-[#d7a84f] px-5 py-2 text-sm font-black text-[#4b0718]">Add to Home Screen</button>
        </div>
      </div>
    </div>
  )
}
