import { ArrowRight, CheckCircle2, Utensils, Car, Map } from 'lucide-react'
import type { LocalService, Settings } from '../types'

const icons = [Utensils, Car, Map]

export function LocalServices({ services, settings }: { services: LocalService[]; settings: Settings }) {
  const whatsapp = (settings.whatsapp.replace(/[^0-9]/g, '').startsWith('91') ? settings.whatsapp.replace(/[^0-9]/g, '') : `91${settings.whatsapp.replace(/[^0-9]/g, '') || '9918310009'}`)

  return (
    <section id="services" className="relative overflow-hidden bg-[#26040e] px-4 py-24 text-white sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(215,168,79,0.18),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(125,17,40,0.45),transparent_40%)]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mb-12 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f5d891]">Guest Convenience</p>
            <h2 className="mt-3 font-serif text-4xl font-bold md:text-5xl">Food, Transport & Guided Ayodhya Darshan</h2>
          </div>
          <p className="text-lg leading-8 text-white/70">A premium stay should be hands-free. Guests can request satvik food, bike/car transportation and a local guide for a complete Ayodhya Dham experience.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {services.map((service, index) => {
            const Icon = icons[index % icons.length]
            const message = encodeURIComponent(`Jai Shri Ram, I need ${service.title} at ${settings.trustName}.`)
            return (
              <article key={service.id} className="group overflow-hidden rounded-[2rem] border border-[#d7a84f]/25 bg-white text-[#4b0718] shadow-2xl shadow-black/20">
                <div className="relative h-72 overflow-hidden">
                  <img src={service.image} alt={service.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#2a0611]/85 via-transparent to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5">
                    <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#d7a84f] text-[#4b0718]"><Icon /></div>
                    <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#f5d891]">{service.subtitle}</p>
                    <h3 className="mt-2 font-serif text-3xl font-bold text-white">{service.title}</h3>
                  </div>
                </div>
                <div className="p-6">
                  <p className="text-sm leading-6 text-[#6b5560]">{service.description}</p>
                  <div className="mt-5 space-y-2">
                    {service.highlights.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-sm font-semibold text-[#4b0718]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b7812d]" /> {item}</div>
                    ))}
                  </div>
                  <a href={`https://wa.me/${whatsapp}?text=${message}`} target="_blank" rel="noreferrer" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#4b0718] px-5 py-3 font-bold text-white transition hover:bg-[#7d1128]">
                    {service.cta} <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
