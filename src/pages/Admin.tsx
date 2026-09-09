import { Navigate, useNavigate } from 'react-router-dom'
import { BarChart3, Eye, EyeOff, Film, Hotel, ImagePlus, Landmark, LogOut, Palette, Save, Settings as SettingsIcon, Trash2, Upload, Users, Utensils } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { storage } from '../lib/storage'
import { isSupabaseConfigured, loadSiteDataFromSupabase, saveSiteDataToSupabase, supabase, uploadPublicAsset } from '../lib/supabase'
import { useNoIndex } from '../lib/useNoIndex'
import type { Booking, LocalService, Review, Room, Settings, Temple, VideoItem } from '../types'

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="rounded-[1.5rem] border border-[#d7a84f]/20 bg-white p-5 shadow-lg shadow-[#4b0718]/10">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#6b5560]">{label}</p>
        <Icon className="h-5 w-5 text-[#b7812d]" />
      </div>
      <p className="mt-3 font-serif text-4xl font-bold text-[#4b0718]">{value}</p>
    </div>
  )
}

type AdminTab = 'overview' | 'settings' | 'media' | 'rooms' | 'guide' | 'services' | 'bookings' | 'reviews'

export function Admin() {
  useNoIndex()
  const navigate = useNavigate()
  const isAuthed = localStorage.getItem(storage.keys.authed) === 'true'
  const [settings, setSettings] = useState<Settings>(() => storage.getSettings())
  const [rooms, setRooms] = useState<Room[]>(() => storage.getRooms())
  const [videos, setVideos] = useState<VideoItem[]>(() => storage.getVideos())
  const [temples, setTemples] = useState<Temple[]>(() => storage.getTemples())
  const [services, setServices] = useState<LocalService[]>(() => storage.getServices())
  const [bookings, setBookings] = useState<Booking[]>(() => storage.getBookings())
  const [reviews, setReviews] = useState<Review[]>(() => storage.getReviews())
  const [saved, setSaved] = useState('')
  const [uploading, setUploading] = useState('')
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [backendStatus, setBackendStatus] = useState(isSupabaseConfigured ? 'Checking Supabase connection...' : 'Supabase is not configured. Changes will only stay in this browser.')

  const revenue = useMemo(() => bookings.reduce((sum, booking) => {
    const room = rooms.find((item) => item.name === booking.room)
    return sum + (room?.price ?? 0)
  }, 0), [bookings, rooms])

  useEffect(() => {
    loadSiteDataFromSupabase().then((data) => {
      if (!data) {
        setBackendStatus(isSupabaseConfigured ? 'Supabase connected, but no site_config/main row found yet. Click Save once to create it.' : 'Supabase is not configured. Add Vercel environment variables first.')
        return
      }
      if (data.settings) {
        storage.setSettings({ ...storage.getSettings(), ...(data.settings as Partial<Settings>) } as Settings)
        setSettings(storage.getSettings())
      }
      if (data.rooms) { storage.setRooms(data.rooms as Room[]); setRooms(storage.getRooms()) }
      if (data.videos) { storage.setVideos(data.videos as VideoItem[]); setVideos(storage.getVideos()) }
      if (data.temples) setTemples(data.temples as Temple[])
      if (data.services) setServices(data.services as LocalService[])
      if (data.bookings) setBookings(data.bookings as Booking[])
      if (data.reviews) setReviews(data.reviews as Review[])
      setBackendStatus('Supabase data loaded. Changes saved here will be visible to all users.')
    })
  }, [])

  const persistAll = async () => {
    storage.setSettings(settings)
    storage.setRooms(rooms)
    storage.setVideos(videos)
    storage.setTemples(temples)
    storage.setServices(services)
    storage.setBookings(bookings)
    storage.setReviews(reviews)
    const result = await saveSiteDataToSupabase({ settings, rooms, videos, temples, services, bookings, reviews })
    setSaved(result.ok ? 'Published successfully. Users will see changes automatically within a few seconds.' : `Not published for users: ${result.reason}`)
    setBackendStatus(result.ok ? 'Supabase publish successful.' : `Supabase publish failed: ${result.reason}`)
    setTimeout(() => setSaved(''), 8000)
  }

  const logout = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut()
    localStorage.removeItem(storage.keys.authed)
    navigate('/login')
  }

  const updateRoom = (id: string, patch: Partial<Room>) => setRooms((items) => items.map((room) => room.id === id ? { ...room, ...patch } : room))
  const updateVideo = (id: string, patch: Partial<VideoItem>) => setVideos((items) => items.map((video) => video.id === id ? { ...video, ...patch } : video))
  const updateTemple = (id: string, patch: Partial<Temple>) => setTemples((items) => items.map((temple) => temple.id === id ? { ...temple, ...patch } : temple))
  const updateService = (id: string, patch: Partial<LocalService>) => setServices((items) => items.map((service) => service.id === id ? { ...service, ...patch } : service))
  const updateBooking = (id: string, status: Booking['status']) => setBookings((items) => items.map((booking) => booking.id === id ? { ...booking, status } : booking))
  const updateReview = (id: string, patch: Partial<Review>) => setReviews((items) => items.map((review) => review.id === id ? { ...review, ...patch } : review))

  const uploadAndSet = async (file: File | undefined, setter: (url: string) => void, folder = 'site-assets') => {
    if (!file) return
    setUploading(`Uploading ${file.name}...`)
    const { publicUrl, error } = await uploadPublicAsset(file, folder)
    if (error) {
      setSaved(`Upload failed: ${error}. Add a public image URL manually.`)
      setUploading('')
      return
    }
    setter(publicUrl)
    setSaved(`${file.type.startsWith('video/') ? 'Video' : 'Image'} uploaded. Click Save to publish it for public users.`)
    setUploading('')
  }

  const uploadRoomGallery = async (room: Room, files: FileList | null) => {
    if (!files?.length) return
    setUploading(`Uploading ${files.length} gallery file(s)...`)
    const urls: string[] = []
    for (const file of Array.from(files)) {
      const { publicUrl, error } = await uploadPublicAsset(file, 'room-gallery')
      if (error) {
        setSaved(`Gallery upload failed: ${error}`)
        setUploading('')
        return
      }
      urls.push(publicUrl)
    }
    updateRoom(room.id, { gallery: [...room.gallery, ...urls], image: room.image || urls[0] })
    setSaved('Room gallery uploaded. Click Save to publish changes.')
    setUploading('')
  }

  const removeVideo = (id: string) => setVideos((items) => items.filter((video) => video.id !== id))

  const clearSettingImage = (key: 'logoUrl' | 'heroImage' | 'heroCardImage' | 'storyImage' | 'paymentQr' | 'appInstallQr' | 'checkinQr' | 'roomServiceQr') => {
    setSettings((value) => ({ ...value, [key]: '' }))
  }

  const tabs: { id: AdminTab; label: string; short: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Dashboard', short: 'Home', icon: BarChart3 },
    { id: 'settings', label: 'Settings & Theme', short: 'Theme', icon: SettingsIcon },
    { id: 'media', label: 'Media & Videos', short: 'Media', icon: Film },
    { id: 'rooms', label: 'Rooms', short: 'Rooms', icon: Hotel },
    { id: 'guide', label: 'Local Guide', short: 'Guide', icon: Landmark },
    { id: 'services', label: 'Food/Transport/Guide', short: 'Svc', icon: Utensils },
    { id: 'bookings', label: 'Bookings', short: 'Book', icon: Users },
    { id: 'reviews', label: 'Ratings', short: 'Rate', icon: BarChart3 },
  ]

  if (!isAuthed) return <Navigate to="/login" replace />

  return (
    <main className="min-h-screen bg-[#fffaf1] pb-24 lg:pb-8">
      <header className="sticky top-0 z-40 border-b border-[#d7a84f]/20 bg-[#2a0611]/95 px-4 py-4 text-white backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#f5d891]">Admin Panel</p>
            <h1 className="font-serif text-2xl font-bold">Hands‑Off Hospitality Dashboard</h1>
            <p className="mt-1 text-xs text-white/55 lg:hidden">Mobile app style dashboard • {tabs.find((tab) => tab.id === activeTab)?.label}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={persistAll} className="flex items-center gap-2 rounded-full bg-[#d7a84f] px-5 py-3 font-bold text-[#4b0718]"><Save className="h-4 w-4" /> Save</button>
            <button onClick={logout} className="rounded-full border border-white/20 p-3 text-white"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {saved && <div className="mb-6 rounded-2xl bg-[#e7f8df] p-4 font-semibold text-[#255018]">{saved}</div>}
        {uploading && <div className="mb-6 rounded-2xl bg-[#fff3d8] p-4 font-semibold text-[#4b0718]">{uploading}</div>}
        <div className="mb-6 rounded-2xl border border-[#d7a84f]/25 bg-white p-4 text-sm font-semibold text-[#4b0718]">
          Backend Status: {backendStatus}
          <div className="mt-2 text-xs font-normal text-[#6b5560]">Important: Agar Supabase env/table configure nahi hai to Save sirf aapke browser me hota hai; public users ko change nahi dikhega.</div>
          <div className="mt-3 rounded-xl bg-[#fff8eb] p-3 text-xs font-normal text-[#6b5560]">
            Supabase user create karne ke liye: Supabase Dashboard → Authentication → Users → Add user → email/password set karo. Same email/password se yahan login hoga.
          </div>
        </div>

        <div className="sticky top-[88px] z-30 mb-6 -mx-4 overflow-x-auto border-y border-[#d7a84f]/20 bg-[#fffaf1]/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-[89px] lg:rounded-[2rem] lg:border lg:bg-white lg:shadow-lg lg:shadow-[#4b0718]/5">
          <div className="flex min-w-max gap-2 lg:min-w-0 lg:grid lg:grid-cols-6">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-black transition ${active ? 'bg-[#4b0718] text-[#f5d891] shadow-lg shadow-[#4b0718]/20' : 'bg-white text-[#4b0718] hover:bg-[#fff3d8]'}`}
                >
                  <Icon className="h-4 w-4" /> <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {activeTab === 'overview' && (
          <section className="grid gap-4 md:grid-cols-4">
            <Stat label="Visitor Overview" value="12.4K" icon={BarChart3} />
            <Stat label="Booking Requests" value={bookings.length} icon={Users} />
            <Stat label="Available Rooms" value={rooms.reduce((sum, room) => sum + room.available, 0)} icon={Hotel} />
            <Stat label="Guest Reviews" value={reviews.length} icon={BarChart3} />
            <Stat label="Projected Revenue" value={`₹${revenue.toLocaleString('en-IN')}`} icon={BarChart3} />
          </section>
        )}

        {(activeTab === 'settings' || activeTab === 'media') && <section className="mt-8 grid gap-8 lg:grid-cols-1">
          {activeTab === 'settings' && (
          <div className="admin-card">
            <div className="admin-heading"><SettingsIcon /> General Settings</div>
            <div className="mt-5 space-y-4">
              {([
                ['trustName', 'Trust Name'], ['location', 'Location'], ['phone', 'Primary Mobile'], ['secondaryPhone', 'Secondary Mobile'], ['helpline', 'Helpline'], ['email', 'Email'], ['whatsapp', 'WhatsApp Number'], ['address', 'Address'], ['logoText', 'Logo Text'], ['upiId', 'UPI ID'], ['checkIn', 'Check-In Time'], ['checkOut', 'Check-Out Time'], ['mapQuery', 'Google Maps Query'], ['paymentQr', 'Payment QR Image Path'], ['appInstallQr', 'Install App QR Image Path'], ['checkinQr', 'Check-in QR Image Path'], ['roomServiceQr', 'Room Service QR Image Path'], ['logoUrl', 'Logo Image URL'], ['heroImage', 'Hero Background Image URL'], ['heroCardImage', 'Hero Room Card Image URL'], ['storyImage', 'Story Section Image URL'],
              ] as [keyof Settings, string][]).map(([key, label]) => (
                <label key={key} className="block text-sm font-semibold text-[#4b0718]">{label}
                  <input value={String(settings[key])} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} className="admin-input mt-2" />
                </label>
              ))}
              <label className="block text-sm font-semibold text-[#4b0718]">Show Logo
                <select value={settings.showLogo ? 'yes' : 'no'} onChange={(e) => setSettings({ ...settings, showLogo: e.target.value === 'yes' })} className="admin-input mt-2">
                  <option value="yes">Show logo</option>
                  <option value="no">Hide logo</option>
                </select>
              </label>
              <div className="rounded-2xl border border-[#d7a84f]/20 bg-[#fffaf1] p-4">
                <p className="font-bold text-[#4b0718]">Logo / Hero Image Upload</p>
                <p className="mt-1 text-xs text-[#6b5560]">Upload to Supabase Storage bucket named “media”, or paste image URL/path above.</p>
                {([
                  ['logoUrl', 'Logo', 'logos'],
                  ['heroImage', 'Hero Background', 'hero'],
                  ['heroCardImage', 'Hero Room Card', 'hero-card'],
                  ['storyImage', 'Story Section', 'story'],
                  ['paymentQr', 'Payment QR', 'payment-qr'],
                  ['appInstallQr', 'Install App QR', 'install-qr'],
                  ['checkinQr', 'Check-in / Info QR', 'checkin-qr'],
                  ['roomServiceQr', 'Room Service QR', 'room-service-qr'],
                ] as ['logoUrl' | 'heroImage' | 'heroCardImage' | 'storyImage' | 'paymentQr' | 'appInstallQr' | 'checkinQr' | 'roomServiceQr', string, string][]).map(([key, label, folder]) => (
                  <div key={key} className="mt-4 rounded-xl border border-[#d7a84f]/20 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-[#4b0718]">{label}</p>
                      <button type="button" onClick={() => clearSettingImage(key)} className="inline-flex items-center gap-1 rounded-full border border-[#7d1128]/25 px-3 py-1 text-xs font-bold text-[#7d1128]"><Trash2 className="h-3 w-3" /> Remove</button>
                    </div>
                    {settings[key] && <img src={settings[key]} alt={label} className="mt-2 h-28 w-full rounded-xl object-cover" />}
                    <label className="mt-2 block text-sm font-semibold text-[#4b0718]">Direct Upload {label}
                      <input type="file" accept="image/*" onChange={(e) => uploadAndSet(e.target.files?.[0], (url) => setSettings((value) => ({ ...value, [key]: url })), folder)} className="mt-2 block w-full text-sm" />
                    </label>
                  </div>
                ))}
                <button type="button" onClick={() => setSettings({ ...settings, logoUrl: '', showLogo: false })} className="mt-3 rounded-full border border-[#7d1128]/25 px-4 py-2 text-sm font-bold text-[#7d1128]">Remove / Hide Logo</button>
              </div>
              <div className="rounded-2xl border border-[#d7a84f]/20 bg-[#fffaf1] p-4">
                <div className="mb-3 flex items-center gap-2 font-bold text-[#4b0718]"><Palette className="h-5 w-5 text-[#b7812d]" /> Logo Theme / Website Colors</div>
                <label className="block text-sm font-semibold text-[#4b0718]">Primary Maroon
                  <input type="color" value={settings.primaryColor} onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })} className="mt-2 h-12 w-full rounded-xl border border-[#d7a84f]/30 bg-white p-1" />
                </label>
                <label className="mt-3 block text-sm font-semibold text-[#4b0718]">Royal Gold
                  <input type="color" value={settings.accentColor} onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })} className="mt-2 h-12 w-full rounded-xl border border-[#d7a84f]/30 bg-white p-1" />
                </label>
                <label className="mt-3 block text-sm font-semibold text-[#4b0718]">Light Background
                  <input type="color" value={settings.lightColor} onChange={(e) => setSettings({ ...settings, lightColor: e.target.value })} className="mt-2 h-12 w-full rounded-xl border border-[#d7a84f]/30 bg-white p-1" />
                </label>
              </div>
            </div>
          </div>
          )}

          {activeTab === 'media' && (
          <div className="admin-card">
            <div className="admin-heading"><Film /> Video Uploads / OTT Content</div>
            <p className="mt-3 text-sm text-[#6b5560]">Promo popup YouTube backend se bhi chal sakta hai aur Supabase Storage upload se bhi. Visibility public/unlisted control karein.</p>
            <div className="mt-5 space-y-5">
              {videos.map((video) => (
                <div key={video.id} className="rounded-2xl border border-[#d7a84f]/20 bg-[#fffaf1] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-bold text-[#4b0718]">Video Item</p>
                    <button type="button" onClick={() => removeVideo(video.id)} className="inline-flex items-center gap-2 rounded-full bg-[#7d1128] px-3 py-2 text-xs font-bold text-white"><Trash2 className="h-3.5 w-3.5" /> Remove Video</button>
                  </div>
                  {video.poster && <img src={video.poster} alt={video.title} className="mb-3 h-36 w-full rounded-2xl object-cover" />}
                  <input value={video.title} onChange={(e) => updateVideo(video.id, { title: e.target.value })} className="admin-input" />
                  <textarea value={video.description} onChange={(e) => updateVideo(video.id, { description: e.target.value })} className="admin-input mt-3 min-h-20" />
                  <input value={video.src} onChange={(e) => updateVideo(video.id, { src: e.target.value })} className="admin-input mt-3" placeholder="Video URL/path" />
                  <label className="mt-3 block text-sm font-semibold text-[#4b0718]">Upload Promo / OTT Video
                    <input type="file" accept="video/*" onChange={(e) => uploadAndSet(e.target.files?.[0], (url) => updateVideo(video.id, { src: url }), 'videos')} className="mt-2 block w-full text-sm" />
                  </label>
                  <input value={video.youtubeUrl} onChange={(e) => updateVideo(video.id, { youtubeUrl: e.target.value })} className="admin-input mt-3" placeholder="YouTube promo URL" />
                  <input value={video.poster} onChange={(e) => updateVideo(video.id, { poster: e.target.value })} className="admin-input mt-3" placeholder="Poster image URL/path" />
                  <label className="mt-3 block text-sm font-semibold text-[#4b0718]">Upload Video Poster / Thumbnail
                    <input type="file" accept="image/*" onChange={(e) => uploadAndSet(e.target.files?.[0], (url) => updateVideo(video.id, { poster: url }), 'video-posters')} className="mt-2 block w-full text-sm" />
                  </label>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <select value={video.visibility} onChange={(e) => updateVideo(video.id, { visibility: e.target.value as VideoItem['visibility'] })} className="admin-input max-w-48">
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</o
