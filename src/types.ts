export type Room = {
  id: string
  name: string
  tagline: string
  description: string
  price: number
  available: number
  capacity: string
  size: string
  image: string
  gallery: string[]
  amenities: string[]
  tax: number
  floor: string
  bathType: string
}

export type VideoItem = {
  id: string
  title: string
  description: string
  src: string
  poster: string
  duration: string
  youtubeUrl: string
  visibility: 'public' | 'unlisted'
  popupSource: 'storage' | 'youtube'
}

export type Temple = {
  id: string
  name: string
  distance: string
  image: string
  description: string
}

export type LocalService = {
  id: string
  title: string
  subtitle: string
  description: string
  image: string
  highlights: string[]
  cta: string
}

export type Settings = {
  trustName: string
  location: string
  phone: string
  secondaryPhone: string
  helpline: string
  email: string
  whatsapp: string
  address: string
  logoText: string
  upiId: string
  checkIn: string
  checkOut: string
  mapQuery: string
  paymentQr: string
  appInstallQr: string
  checkinQr: string
  roomServiceQr: string
  logoUrl: string
  heroImage: string
  heroCardImage: string
  storyImage: string
  showLogo: boolean
  primaryColor: string
  accentColor: string
  lightColor: string
}

export type Review = {
  id: string
  name: string
  rating: number
  message: string
  date: string
}

export type Booking = {
  id: string
  name: string
  phone: string
  room: string
  checkIn: string
  guests: string
  status: 'New' | 'Confirmed' | 'Checked-in'
}
