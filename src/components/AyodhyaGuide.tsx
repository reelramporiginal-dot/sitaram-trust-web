import { MapPin, Navigation } from 'lucide-react'
import type { Temple } from '../types'

export function AyodhyaGuide({ temples }: { temples: Temple[] }) {
  return (
    <section id="guide" className="bg-[#fffaf1] px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b7812d]">Ayodhya Local Guide</p>
          <h2 className="mt-3 font-serif text-4xl font-bold text-[#4b0718] md:text-5xl">Explore Ayodhya Dham</h2>
          <p className="mt-5 leading-7 text-[#6b5560]">Main temples and sacred places near Shri Sitaram Seva Trust, curated for yatris planning darshan routes.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {temples.map((temple) => (
            <article key={temple.id} className="group overflow-hidden rounded-[2rem] border border-[#d7a84f]/25 bg-white shadow-xl shadow-[#4b0718]/10">
              <div className="relative h-72 overflow-hidden">
                <img src={temple.image} alt={temple.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#2a0611]/85 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#d7a84f] px-3 py-1 text-sm font-black text-[#4b0718]"><Navigation className="h-4 w-4" /> {temple.distance}</div>
                  <h3 className="mt-3 font-serif text-3xl font-bold">{temple.name}</h3>
                </div>
              </div>
              <div className="p-6">
                <p className="text-sm leading-6 text-[#6b5560]">{temple.description}</p>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${temple.name} Ayodhya`)}`} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#d7a84f]/35 px-4 py-2 text-sm font-bold text-[#4b0718]">
                  <MapPin className="h-4 w-4 text-[#b7812d]" /> Open directions
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
