import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Maximize, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import type { VideoItem } from '../types'

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function OTTPlayer({ videos }: { videos: VideoItem[] }) {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const current = videos[active] ?? videos[0]

  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    setError('')
    const video = videoRef.current
    if (video) video.load()
  }, [active])

  const togglePlay = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if (video.paused) {
        await video.play()
        setPlaying(true)
        setError('')
      } else {
        video.pause()
        setPlaying(false)
      }
    } catch {
      setError('Video play blocked by browser. Please tap play again.')
      setPlaying(false)
    }
  }

  const restart = async () => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    setProgress(0)
    try {
      await video.play()
      setPlaying(true)
    } catch {
      video.pause()
      setPlaying(false)
    }
  }

  const seek = (value: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = value
    setProgress(value)
  }

  const jump = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    seek(Math.min(Math.max(video.currentTime + seconds, 0), duration || 0))
  }

  const fullscreen = async () => {
    try {
      await videoRef.current?.requestFullscreen?.()
    } catch {
      setError('Fullscreen is not available on this device.')
    }
  }

  if (!current) return null

  return (
    <div className="overflow-hidden rounded-[2rem] border border-[#d7a84f]/25 bg-[#16030a] shadow-2xl shadow-black/35">
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src={current.src}
          poster={current.poster}
          muted={muted}
          playsInline
          preload="metadata"
          onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError('Video could not load. Please check the video URL in admin panel.')}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/25" />
        <button onClick={togglePlay} className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#d7a84f]/60 bg-[#4b0718]/70 text-[#f5d891] backdrop-blur transition hover:scale-105" aria-label="Play video">
          {playing ? <Pause className="h-9 w-9" /> : <Play className="ml-1 h-9 w-9" />}
        </button>
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          <div className="mb-4">
            <h3 className="font-serif text-2xl font-bold text-white">{current.title}</h3>
            <p className="mt-1 max-w-2xl text-sm text-white/70">{current.description}</p>
            {error && <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-xs text-red-100"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>}
          </div>
          <input
            aria-label="Video progress"
            className="gold-range w-full"
            min={0}
            max={duration || 0}
            value={progress}
            step={0.1}
            type="range"
            onChange={(event) => seek(Number(event.target.value))}
          />
          <div className="mt-3 flex items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-2">
              <button onClick={() => jump(-10)} className="player-btn" aria-label="Back 10 seconds"><SkipBack className="h-4 w-4" /></button>
              <button onClick={togglePlay} className="player-btn" aria-label="Toggle play">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
              <button onClick={() => jump(10)} className="player-btn" aria-label="Forward 10 seconds"><SkipForward className="h-4 w-4" /></button>
              <button onClick={restart} className="player-btn" aria-label="Restart video"><RotateCcw className="h-4 w-4" /></button>
              <button onClick={() => setMuted((value) => !value)} className="player-btn" aria-label="Toggle mute">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
              <span className="text-xs text-white/70">{formatTime(progress)} / {formatTime(duration)}</span>
            </div>
            <button onClick={fullscreen} className="player-btn" aria-label="Fullscreen"><Maximize className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
      {videos.length > 1 && (
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {videos.map((video, index) => (
            <button key={video.id} onClick={() => setActive(index)} className={`rounded-2xl border p-3 text-left transition ${index === active ? 'border-[#d7a84f] bg-[#d7a84f]/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
              <p className="font-semibold text-white">{video.title}</p>
              <p className="mt-1 text-xs text-white/55">{video.duration}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
