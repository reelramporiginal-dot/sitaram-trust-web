import { Star } from 'lucide-react'
import { useState } from 'react'
import type { Review } from '../types'

export function TestimonialWidget({ reviews, onAdd }: { reviews: Review[]; onAdd: (review: Review) => void }) {
  const [rating, setRating] = useState(5)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 5

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !message.trim()) return
    onAdd({ id: crypto.randomUUID(), name, message, rating, date: new Date().toISOString().slice(0, 10) })
    setName('')
    setMessage('')
    setRating(5)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-[2rem] bg-[#4b0718] p-8 text-white shadow-2xl shadow-[#4b0718]/25">
        <p className="text-sm uppercase tracking-[0.35em] text-[#f5d891]">Guest Rating</p>
        <div className="mt-4 flex items-end gap-2">
          <span className="font-serif text-7xl font-bold">{average.toFixed(1)}</span>
          <span className="mb-3 text-white/60">/ 5</span>
        </div>
        <div className="mt-4 flex gap-1 text-[#f5d891]">
          {Array.from({ length: 5 }).map((_, index) => <Star key={index} className="h-6 w-6 fill-current" />)}
        </div>
        <p className="mt-5 text-sm leading-6 text-white/70">Real-time local review system. Guests can leave feedback and the site updates instantly.</p>
        <form onSubmit={submit} className="mt-7 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name" className="admin-input bg-white/10 text-white placeholder:text-white/45" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <button key={index} type="button" onClick={() => setRating(index + 1)} className={`rounded-full p-2 ${index < rating ? 'text-[#f5d891]' : 'text-white/30'}`} aria-label={`Rate ${index + 1}`}>
                <Star className="h-5 w-5 fill-current" />
              </button>
            ))}
          </div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Share your experience" className="admin-input min-h-24 bg-white/10 text-white placeholder:text-white/45" />
          <button className="rounded-full bg-[#d7a84f] px-6 py-3 font-bold text-[#4b0718]">Submit Review</button>
        </form>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-[1.5rem] border border-[#d7a84f]/20 bg-white p-6 shadow-lg shadow-[#4b0718]/10">
            <div className="flex gap-1 text-[#d7a84f]">
              {Array.from({ length: review.rating }).map((_, index) => <Star key={index} className="h-4 w-4 fill-current" />)}
            </div>
            <p className="mt-4 text-sm leading-6 text-[#5d4450]">“{review.message}”</p>
            <div className="mt-5 border-t border-[#f0dfbd] pt-4">
              <p className="font-bold text-[#4b0718]">{review.name}</p>
              <p className="text-xs text-[#92717d]">{review.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
