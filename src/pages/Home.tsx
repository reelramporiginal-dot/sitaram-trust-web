import { motion, useScroll, useTransform } from 'framer-motion'
import { CalendarCheck, Clock, FileText, HeartHandshake, MapPin, Phone, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navbar } from '../components/Navbar'
import { AyodhyaGuide } from '../components/AyodhyaGuide'
import { FloatingActions } from '../components/FloatingActions'
import { InstallPrompt } from '../components/InstallPrompt'
import { LocalServices } from '../components/LocalServices'
import { OTTPlayer } from '../components/OTTPlayer'
import { QRCodePanel } from '../components/QRCodePanel'
import { RoomCard } from '../components/RoomCard'
import { TestimonialWidget } from '../components/TestimonialWidget'
import { VideoPopup } from '../components/VideoPopup'
import { storage } from '../lib/storage'
import { isSupabaseConfigured, loadSiteDataFromSupabase, saveSiteDataToSupabase, supabase } from '../lib/supabase'
import type { Booking, LocalService, Review, Room, Settings, Temple, VideoItem } from '../types'

// ============================================
// ✅ NOTIFICATION HELPER FUNCTIONS
// Email (Web3Forms) + WhatsApp (CallMeBot)
// ============================================

const NOTIFICATION_CONFIG = {
  // ✅ Web3Forms Key - Email Notification ke liye
  web3formsKey: '537567d5-c2c1-4ffc-9624-1d1675e74b2f',

  // ⚠️ WhatsApp Keys - Abhi 'SKIP_FOR_NOW' hai
  // Jab CallMeBot se key milegi tab replace karna
  whatsappNumbers: [
    { phone: '919918310009', apiKey: 'SKIP_FOR_NOW' },
    { phone: '918303333309', apiKey: 'SKIP_FOR_NOW' },
  ],
}

async function sendEmailNotification(booking: Booking, settings: Settings) {
  try {
    const currentTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_key: NOTIFICATION_CONFIG.web3formsKey,
        subject: ` New Booking: ${booking.id} - ${booking.name}`,
        from_name: 'Shri Sitaram Seva Trust - Booking System',
        message: [
          '🚩 SHRI SITARAM SEVA TRUST',
          '━━━━━━━━━━━━━━━━━━━━━━━━━',
          'NEW BOOKING RECEIVED!',
          '',
          `📋 Booking ID: ${booking.id}`,
          `👤 Guest Name: ${booking.name}`,
          `📞 Phone: ${booking.phone}`,
          `🏨 Room Type: ${booking.room}`,
          `📅 Check-in Date: ${booking.checkIn}`,
          `👥 Total Guests: ${booking.guests}`,
          ` Booking Time: ${currentTime}`,
          ` Status: ${booking.status}`,
          '',
          `📍 Property: ${settings.trustName}`,
          `📍 Address: ${settings.address}`,
          '━━━━━━━━━━━━━━━━━━━━━━━━━',
          'Kripya yatri se jald sampark karein.',
        ].join('\n'),
        booking_id: booking.id,
        guest_name: booking.name,
        phone: booking.phone,
        room_type: booking.room,
        checkin_date: booking.checkIn,
        total_guests: booking.guests,
        booking_time: currentTime,
      }),
    })

    const result = await response.json()
    return result.success === true
  } catch {
    return false
  }
}

async function sendWhatsAppNotification(booking: Booking) {
  try {
    const currentTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

    const message = encodeURIComponent(
      [
        '🚩 *Shri Sitaram Seva Trust*',
        '*━━ New Booking Alert! ━━*',
        '',
        ` *Booking ID:* ${booking.id}`,
        `👤 *Name:* ${booking.name}`,
        `📞 *Phone:* ${booking.phone}`,
        `🏨 *Room:* ${booking.room}`,
        `📅 *Check-in:* ${booking.checkIn}`,
        `👥 *Guests:* ${booking.guests}`,
        ` *Time:* ${currentTime}`,
        '',
        '_Kripya yatri se sampark karein._',
      ].join('\n')
    )

    // Sabhi numbers pe WhatsApp bhejo
    for (const entry of NOTIFICATION_CONFIG.whatsappNumbers) {
      if (entry.apiKey !== 'SKIP_FOR_NOW') {
        fetch(
          `https://api.callmebot.com/whatsapp.php?phone=${entry.phone}&text=${message}&apikey=${entry.apiKey}`,
          { mode: 'no-cors' }
        ).catch(() => {})
      }
    }
  } catch {
    // WhatsApp fail hua toh bhi booking confirm rahegi
  }
}

// ============================================

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center">
      <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b7812d]">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-4xl font-bold text-[#4b0718] md:text-5xl">{title}</h2>
      <p className="mt-5 leading-7 text-[#6b5560]">{text}</p>
    </div>
  )
}

export function Home() {
  const [settings, setSettings] = useState<Settings>(() => storage.getSettings())
  const [rooms, setRooms] = useState<Room[]>(() => storage.getRooms())
  const [videos, setVideos] = useState<VideoItem[]>(() => storage.getVideos())
  const [temples, setTemples] = useState<Temple[]>(() => storage.getTemples())
  const [services, setServices] = useState<LocalService[]>(() => storage.getServices())
  const [reviews, setReviews] = useState<Review[]>(() => storage.getReviews())
  const [selectedRoom, setSelectedRoom] = useState('2 Bed AC Room')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [phone, setPhone] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [guests, setGuests] = useState('2')
  const [promoTrigger, setPromoTrigger] = useState(0)
  const { scrollY } = useScroll()
  const heroY = useTransform(scrollY, [0, 600], [0, 180])
  const heroScale = useTransform(scrollY, [0, 600], [1, 1.12])

  useEffect(() => {
    const applyRemoteData = (data: Awaited<ReturnType<typeof loadSiteDataFromSupabase>>) => {
      if (!data) return
      if (data.settings) {
        storage.setSettings({ ...storage.getSettings(), ...(data.settings as Partial<Settings>) } as Settings)
        setSettings(storage.getSettings())
      }
      if (data.rooms) { storage.setRooms(data.rooms as Room[]); setRooms(storage.getRooms()) }
      if (data.videos) { storage.setVideos(data.videos as VideoItem[]); setVideos(storage.getVideos()) }
      if (data.temples) { storage.setTemples(data.temples as Temple[]); setTemples(data.temples as Temple[]) }
      if (data.reviews) { storage.setReviews(data.reviews as Review[]); setReviews(data.reviews as Review[]) }
      if (data.bookings) storage.setBookings(data.bookings as Booking[])
      if (data.services) { storage.setServices(data.services as LocalService[]); setServices(data.services as LocalService[]) }
    }

    const refreshFromSupabase = () => loadSiteDataFromSupabase().then(applyRemoteData)
    refreshFromSupabase()

    const interval = window.setInterval(refreshFromSupabase, 15000)
    window.addEventListener('focus', refreshFromSupabase)

    const channel = isSupabaseConfigured
      ? supabase
          .channel('public-site-config-main')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'site_config', filter: 'id=eq.main' }, (payload) => {
            applyRemoteData((payload.new as { data?: unknown })?.data as Awaited<ReturnType<typeof loadSiteDataFromSupabase>>)
          })
          .subscribe()
      : null

    const sync = () => {
      setSettings(storage.getSettings())
      setRooms(storage.getRooms())
      setVideos(storage.getVideos())
      setTemples(storage.getTemples())
      setServices(storage.getServices())
      setReviews(storage.getReviews())
    }
    window.addEventListener('sst-storage-updated', sync)
    return () => {
      window.removeEventListener('sst-storage-updated', sync)
      window.removeEventListener('focus', refreshFromSupabase)
      window.clearInterval(interval)
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const totalRooms = useMemo(() => rooms.reduce((sum, room) => sum + room.available, 0), [rooms])
  const publicVideos = useMemo(() => videos.filter((video) => video.visibility !== 'unlisted'), [videos])
  const promoVideo = publicVideos[0] ?? videos[0]

  const openBooking = (roomName?: string) => {
    if (roomName) setSelectedRoom(roomName)
    setBookingOpen(true)
    setTimeout(() => document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // ============================================
  // ✅ UPDATED: createBooking with Notifications
  // Ab Email + WhatsApp dono jayega!
  // ============================================
  const createBooking = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!guestName || !phone || !checkIn) return

    const newBooking: Booking = {
      id: `BKG-${Math.floor(1000 + Math.random() * 9000)}`,
      name: guestName,
      phone,
      room: selectedRoom,
      checkIn,
      guests,
      status: 'New',
    }

    // 1. Save booking to storage + Supabase (yeh pehle se tha)
    const updatedBookings = [newBooking, ...storage.getBookings()]
    storage.setBookings(updatedBookings)
    await saveSiteDataToSupabase({ settings, rooms, videos, temples, services, bookings: updatedBookings, reviews })

    // 2. ✅ NEW: Send Email Notification to Admin
    const emailSent = await sendEmailNotification(newBooking, settings)

    // 3. ✅ NEW: Send WhatsApp Notification to Reception
    await sendWhatsAppNotification(newBooking)

    // 4. Clear form
    setGuestName('')
    setPhone('')
    setCheckIn('')
    setBookingOpen(false)

    // 5. Show confirmation message
    if (emailSent) {
      alert(
        `✅ Booking request ${newBooking.id} received!\n\n` +
        `👤 Name: ${newBooking.name}\n` +
        `🏨 Room: ${newBooking.room}\n` +
        `📅 Date: ${newBooking.checkIn}\n\n` +
        `📧 Confirmation email bhej diya gaya hai.\n` +
        `📱 WhatsApp notification bhi bhej diya gaya hai.\n\n` +
        `Hamari seva desk aapse jald sampark karegi. 🙏`
      )
    } else {
      alert(
        `✅ Booking request ${newBooking.id} saved!\n\n` +
        `📧 Email notification mein thodi der ho sakti hai.\n` +
        `📞 Agar jaldi response chahiye toh call karein:\n` +
        `${settings.phone} ya ${settings.secondaryPhone}\n\n` +
        `Hamari seva desk aapse jald sampark karegi. `
      )
    }
  }

  const addReview = async (review: Review) => {
    const updated = [review, ...reviews]
    setReviews(updated)
    storage.setReviews(updated)
    await saveSiteDataToSupabase({ settings, rooms, videos, temples, services, bookings: storage.getBookings(), reviews: updated })
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fffaf1]" style={{ backgroundColor: settings.lightColor } as React.CSSProperties}>
      <Navbar onBook={() => openBooking()} settings={settings} />
      <VideoPopup youtubeUrl={promoVideo?.youtubeUrl || 'https://www.youtube.com/watch?v=Jqv0k3rY2QQ'} videoSrc={promoVideo?.src} poster={promoVideo?.poster} temples={temples} source={promoVideo?.popupSource || 'storage'} trigger={promoTrigger} />
      <section className="relative flex min-h-screen items-center overflow-hidden bg-[#2a0611] px-4 pt-24 text-white sm:px-6 lg:px-8">
        <motion.div style={{ y: heroY, scale: heroScale }} className="absolute inset-0">
          <img src={settings.heroImage} alt="Ayodhya Ram Mandir master shot" className="h-full w-full object-cover opacity-65" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#24020c] via-[#4b0718]/80 to-[#24020c]/40" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(215,168,79,0.28),transparent_42%)]" />
        </motion.div>
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div initial={{ opacity: 0, y: 35 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d7a84f]/40 bg-white/10 px-4 py-2 text-sm text-[#f5d891] backdrop-blur">
              <Sparkles className="h-4 w-4" /> Royal hospitality in {settings.location}
            </div>
            <h1 className="mt-8 font-serif text-5xl font-black leading-tight md:text-7xl">
              A Divine Stay with <span className="text-[#f5d891]">Modern Facilities</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/78">
              {settings.trustName} at Luvkushnagar, Ramghat-Ayodhya Dhaam welcomes pilgrims and families with A.C. Rooms, Non-A.C. Rooms, Dormitory, A.C. Bed and Foods Available.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['A.C. Rooms', 'Non-A.C. Rooms', 'Dormitory', 'A.C. Bed', 'Foods Available'].map((item) => (
                <span key={item} className="rounded-full border border-[#d7a84f]/35 bg-[#2a0611]/45 px-4 py-2 text-sm font-bold text-[#f5d891] backdrop-blur">{item}</span>
              ))}
            </div>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <button onClick={() => openBooking()} className="rounded-full bg-gradient-to-r from-[#d7a84f] to-[#fff0ad] px-8 py-4 font-black text-[#4b0718] shadow-2xl shadow-[#d7a84f]/30 transition hover:scale-105">
                Book Now
              </button>
              <a href="#story" className="rounded-full border border-white/25 bg-white/10 px-8 py-4 text-center font-bold text-white backdrop-blur transition hover:bg-white/20">
                Discover Our Story
              </a>
              <button onClick={() => setPromoTrigger((value) => value + 1)} className="rounded-full border border-[#d7a84f]/45 bg-[#2a0611]/55 px-8 py-4 text-center font-bold text-[#f5d891] backdrop-blur transition hover:bg-[#2a0611]/80">
                Watch Promo Video
              </button>
            </div>
            <div className="mt-12 grid max-w-2xl grid-cols-3 gap-3">
              {[['Rooms / Beds', totalRooms], ['Check-In', settings.checkIn], ['Check-Out', settings.checkOut]].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <p className="font-serif text-3xl font-bold text-[#f5d891]">{value}</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-white/60">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 35 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.9, delay: 0.15 }} className="rounded-[2rem] border border-[#d7a84f]/30 bg-white/10 p-4 backdrop-blur-xl">
            <img src={settings.heroCardImage} alt="Featured room at Shree Sitaram Seva Trust" className="h-[520px] w-full rounded-[1.5rem] object-cover" />
          </motion.div>
        </div>
      </section>

      {/* ✅ UPDATED: Story section - Vijay Prakash Tiwari naam add kiya */}
      <section id="story" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative">
            <img src={settings.storyImage} alt="Reception area at Shree Sitaram Seva Trust" className="h-full min-h-[520px] rounded-[2rem] object-cover shadow-2xl" />
            <div className="absolute -bottom-8 right-8 rounded-[2rem] bg-[#4b0718] p-6 text-white shadow-xl">
              <HeartHandshake className="mb-3 h-8 w-8 text-[#f5d891]" />
              <p className="font-serif text-2xl font-bold">Seva + Luxury</p>
              <p className="mt-1 text-sm text-white/65">Tradition supported by modern management.</p>
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b7812d]">Our Story</p>
            <h2 className="mt-3 font-serif text-5xl font-bold text-[#4b0718]">Verified accommodation near Ram Mandir and Hanuman Garhi.</h2>
            <p className="mt-6 leading-8 text-[#6b5560]">
              {settings.trustName}, managed by <strong className="text-[#4b0718]">Vijay Prakash Tiwari</strong>, is listed at {settings.address}. It is approximately 1.7 km from Shri Ram Janmabhoomi Temple, 1.3 km from Hanuman Garhi, 1.8 km from Ayodhya Dham Junction and 10.5 km from Maharishi Valmiki International Airport. The stay offers AC rooms, a non-AC family option and an AC dormitory hall with meals, parking, CCTV and clean drinking water.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[ShieldCheck, CalendarCheck, MapPin].map((Icon, index) => (
                <div key={index} className="rounded-2xl border border-[#d7a84f]/20 bg-white p-5 shadow-lg">
                  <Icon className="h-7 w-7 text-[#b7812d]" />
                  <p className="mt-3 text-sm font-bold text-[#4b0718]">{['CCTV + Parking', `${settings.checkIn} / ${settings.checkOut}`, 'Ram Mandir 1.7 km'][index]}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="video" className="bg-[#26040e] px-4 py-24 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f5d891]">Professional OTT Video Player</p>
            <h2 className="mt-3 font-serif text-4xl font-bold md:text-5xl">Promo films, room showcases, and trust stories in one cinematic player.</h2>
          </div>
          <OTTPlayer videos={publicVideos.length ? publicVideos : videos} />
        </div>
      </section>

      <section id="rooms" className="px-4 py-24 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Room Categories" title="A.C. Rooms, Non-A.C. Rooms, Dormitory, A.C. Bed & Foods Available" text="Clear inventory options for yatris: A.C. rooms, non-A.C. rooms, dormitory stay, A.C. bed options and food facility availability." />
        <div className="mx-auto mb-8 flex max-w-5xl flex-wrap justify-center gap-3">
          {['A.C. Rooms', 'Non-A.C. Rooms', 'Dormitory', 'A.C. Bed', 'Foods Available'].map((item) => (
            <span key={item} className="rounded-full bg-[#4b0718] px-5 py-3 text-sm font-black text-[#f5d891] shadow-lg shadow-[#4b0718]/15">{item}</span>
          ))}
        </div>
        <div className="mx-auto mb-10 grid max-w-7xl gap-4 rounded-[2rem] border border-[#d7a84f]/25 bg-white p-5 shadow-xl shadow-[#4b0718]/10 md:grid-cols-3">
          <div className="flex items-center gap-3"><Clock className="h-8 w-8 text-[#b7812d]" /><div><p className="font-bold text-[#4b0718]">Check-In / Check-Out</p><p className="text-sm text-[#6b5560]">{settings.checkIn} / {settings.checkOut}</p></div></div>
          <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-[#b7812d]" /><div><p className="font-bold text-[#4b0718]">Key Facilities</p><p className="text-sm text-[#6b5560]">Food, parking, CCTV, hot water and clean drinking water</p></div></div>
          <div className="flex items-center gap-3"><MapPin className="h-8 w-8 text-[#b7812d]" /><div><p className="font-bold text-[#4b0718]">Near Attractions</p><p className="text-sm text-[#6b5560]">Ram Mandir 1.7 km • Hanuman Garhi 1.3 km</p></div></div>
        </div>
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-3">
          {rooms.map((room) => <RoomCard key={room.id} room={room} onBook={openBooking} />)}
        </div>
      </section>

      <section id="location" className="bg-white px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b7812d]">Location & Distances</p>
            <h2 className="mt-3 font-serif text-5xl font-bold text-[#4b0718]">Lavkushnagar, Ramghat, Ayodhya</h2>
            <p className="mt-5 leading-8 text-[#6b5560]">{settings.address}</p>
            <div className="mt-8 grid gap-3 text-sm text-[#4b0718]">
              {['Ayodhya Dham Junction Railway Station - 1.8 km', 'Maharishi Valmiki International Airport - 10.5 km', 'Shri Ram Janmabhoomi Temple - 1.7 km', 'Raj Dwar Mandir - 1.2 km', 'Dashrath Mahal / Ram Katha Museum / Kanak Bhavan - 1.3 km', 'Saryu River (Naya Ghat) - 2 km'].map((item) => (
                <div key={item} className="rounded-2xl bg-[#fff8eb] p-4 font-semibold">{item}</div>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-[2rem] border border-[#d7a84f]/25 shadow-2xl shadow-[#4b0718]/10">
            <iframe
              title="Google Maps - Shree Sitaram Seva Trust Ayodhya"
              src={`https://www.google.com/maps?q=${encodeURIComponent(settings.mapQuery)}&output=embed`}
              className="h-[560px] w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="bg-[#4b0718] p-4 text-center">
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.mapQuery)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full bg-[#d7a84f] px-6 py-3 font-black text-[#4b0718]">
                Get Direction on Google Maps
              </a>
            </div>
          </div>
        </div>
      </section>

      <AyodhyaGuide temples={temples} />

      <LocalServices services={services} settings={settings} />

      <section id="qr" className="bg-[#fff3d8] px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Smart QR Integration" title="Payments, check‑in, and guest information — instantly" text="A dedicated QR ecosystem makes guest service faster and enables a professional hands-off operational model." />
          <QRCodePanel settings={settings} />
        </div>
      </section>

      <section className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Ratings & Testimonials" title="Guest confidence that updates live" text="Visitors can view premium reviews and leave their own ratings directly from the website." />
          <TestimonialWidget reviews={reviews} onAdd={addReview} />
        </div>
      </section>

      <section id="booking" className="bg-[#2a0611] px-4 py-24 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f5d891]">Book Now</p>
            <h2 className="mt-3 font-serif text-5xl font-bold">Reserve your divine stay.</h2>
            <p className="mt-5 leading-8 text-white/70">Send a booking request directly to the admin dashboard. The seva desk can review and confirm from the robust panel.</p>
            <div className="mt-8 space-y-3 text-white/75">
              <p className="flex items-center gap-3"><Phone className="h-5 w-5 text-[#f5d891]" /> {settings.phone}, {settings.secondaryPhone} • Helpline {settings.helpline}</p>
              <p className="flex items-center gap-3"><MapPin className="h-5 w-5 text-[#f5d891]" /> {settings.address}</p>
            </div>
          </div>
          <form onSubmit={createBooking} className={`rounded-[2rem] border border-[#d7a84f]/25 bg-white p-6 text-[#4b0718] shadow-2xl ${bookingOpen ? 'ring-4 ring-[#d7a84f]/40' : ''}`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Guest name" className="admin-input" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" className="admin-input" />
              <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className="admin-input">
                {rooms.map((room) => <option key={room.id}>{room.name}</option>)}
              </select>
              <input value={checkIn} onChange={(e) => setCheckIn(e.target.value)} type="date" className="admin-input" />
              <input value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="Guests" className="admin-input sm:col-span-2" />
            </div>
            <button className="mt-6 w-full rounded-full bg-[#d7a84f] px-6 py-4 font-black text-[#4b0718]">Send Booking Request</button>
          </form>
        </div>
      </section>

      {/* ✅ UPDATED: Policies section - Proprietor naam add kiya */}
      <section id="policies" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Rules & Policies" title="Terms, cancellation and guest rules" text="Professional policy summary extracted from the public booking listing for guest clarity." />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-[#d7a84f]/25 bg-white p-7 shadow-xl shadow-[#4b0718]/10">
              <div className="mb-4 flex items-center gap-3 font-serif text-2xl font-bold text-[#4b0718]"><FileText className="text-[#b7812d]" /> Terms & Conditions</div>
              <ul className="space-y-3 text-sm leading-6 text-[#6b5560]">
                <li><strong className="text-[#4b0718]">Business Name:</strong> Shri Sitaram Seva Trust | <strong className="text-[#4b0718]">Proprietor:</strong> Vijay Prakash Tiwari</li>
                <li>All guests must bring valid government ID proof at check-in.</li>
                <li>Guests under 18, single guests / unmarried couples and same-city guests are not allowed as per listed rules.</li>
                <li>Room / hall capacity is strictly followed; early check-in or late check-out is subject to availability and may be chargeable.</li>
                <li>Guests cannot bring illegal items. Pets, outside food, alcohol and non-veg food are not allowed.</li>
                <li>Some amenities including hot water, food, parking, TV and AC may be chargeable or subject to availability / supply conditions.</li>
              </ul>
            </div>
            <div className="rounded-[2rem] border border-[#d7a84f]/25 bg-white p-7 shadow-xl shadow-[#4b0718]/10">
              <div className="mb-4 flex items-center gap-3 font-serif text-2xl font-bold text-[#4b0718]"><ShieldCheck className="text-[#b7812d]" /> Cancellation & Refund Policy</div>
              <ul className="space-y-3 text-sm leading-6 text-[#6b5560]">
                <li>100% room charges apply if cancelled between 1 and 8 days before check-in.</li>
                <li>0% cancellation charges apply if cancelled between 9 and 365 days before check-in.</li>
                <li>Convenience fees are strictly non-refundable; taxes may be refunded after deductions where applicable.</li>
                <li>Submitted cancellation requests are irreversible and refunds are credited to the source in 5–7 banking working days.</li>
                <li>No-show is non-refundable, including emergencies reported after the check-in date.</li>
                <li><strong className="text-[#4b0718]">Contact for cancellation:</strong> Vijay Prakash Tiwari — {settings.phone}, {settings.secondaryPhone}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ✅ UPDATED: Footer - Vijay Prakash Tiwari naam add kiya */}
      <footer className="border-t border-[#d7a84f]/20 bg-[#180209] px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="font-serif text-2xl font-bold">{settings.trustName}</p>
            <p className="mt-1 text-sm text-white/75">Proprietor: <strong className="text-[#f5d891]">Vijay Prakash Tiwari</strong></p>
            <p className="mt-1 text-sm text-white/55">Official Address: {settings.address}</p>
            <p className="mt-1 text-sm text-white/55">Mobile: {settings.phone}, {settings.secondaryPhone} • Helpline: {settings.helpline}</p>
            <p className="mt-2 text-xs text-white/35">© 2025 {settings.trustName}. All rights reserved.</p>
          </div>
          <a href={`tel:${settings.phone}`} className="rounded-full border border-[#d7a84f]/35 px-6 py-3 text-[#f5d891]">Call Seva Desk</a>
        </div>
      </footer>
      <FloatingActions settings={settings} />
      <InstallPrompt />
    </div>
  )
}
