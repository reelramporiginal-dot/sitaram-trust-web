import type { Booking, LocalService, Review, Room, Settings, Temple, VideoItem } from '../types'

const STORAGE_KEYS = {
  settings: 'sst-settings',
  rooms: 'sst-rooms',
  videos: 'sst-videos',
  reviews: 'sst-reviews',
  bookings: 'sst-bookings',
  temples: 'sst-temples',
  services: 'sst-services',
  authed: 'sst-admin-authed',
}

export const defaultSettings: Settings = {
  trustName: 'Shri Sitaram Seva Trust',
  location: 'Ayodhya Dham',
  phone: '9918310009',
  secondaryPhone: '8303333309',
  helpline: '05278-424511',
  email: 'YatraDham listing email protected',
  whatsapp: '9918310009',
  address: 'Luvkushnagar, Ramghat-Ayodhya Dhaam',
  logoText: 'श्री सीताराम',
  upiId: 'sitaramsevatrust@upi',
  checkIn: '12:00 PM',
  checkOut: '11:00 AM',
  mapQuery: 'Shree Sitaram Seva Trust Luvkushnagar Ramghat Ayodhya Dhaam',
  paymentQr: '/images/WhatsApp Image 2026-05-12 at 8.14.37 AM (1).jpeg',
  appInstallQr: '',
  checkinQr: '',
  roomServiceQr: '',
  logoUrl: '',
  heroImage: '/images/hero-ram-mandir-ai.png',
  heroCardImage: '/images/yatradham/property-1.jpg',
  storyImage: '/images/yatradham/property-6.jpg',
  showLogo: true,
  primaryColor: '#4b0718',
  accentColor: '#d7a84f',
  lightColor: '#fffaf1',
}

export const defaultRooms: Room[] = [
  {
    id: '2-bed-ac-room',
    name: '2 Bed AC Room',
    tagline: 'Compact AC stay for two pilgrims',
    description: 'Real YatraDham listing category with a double bed, western attached let-bath, and ground / first floor allocation. Designed for couples or two family members seeking a comfortable Ayodhya stay.',
    price: 1299,
    tax: 64.95,
    available: 8,
    capacity: '2 Guests',
    size: 'Double Bed',
    floor: 'Ground / 1st Floor',
    bathType: 'Western Attached Let-Bath',
    image: '/images/yatradham/property-1.jpg',
    gallery: ['/images/yatradham/property-1.jpg', '/images/yatradham/property-2.jpg', '/images/yatradham/property-3.jpg'],
    amenities: ['AC', 'Double Bed', 'Western Attached Let-Bath', 'Food Facility', 'Parking', 'CCTV'],
  },
  {
    id: '3-bed-ac-room',
    name: '3 Bed AC Room',
    tagline: 'AC family room with double + single bed',
    description: 'A practical AC family room category with one double bed, one single bed, western attached let-bath, and ground / first floor allocation as mentioned on the booking listing.',
    price: 1499,
    tax: 74.95,
    available: 10,
    capacity: '3 Guests',
    size: 'Double + Single Bed',
    floor: 'Ground / 1st Floor',
    bathType: 'Western Attached Let-Bath',
    image: '/images/yatradham/property-4.jpg',
    gallery: ['/images/yatradham/property-4.jpg', '/images/yatradham/property-1.jpg', '/images/yatradham/property-6.jpg'],
    amenities: ['AC', 'Double Bed', 'Single Bed', 'Hot Water', 'Clean Drinking Water', 'Parking'],
  },
  {
    id: '3-bed-non-ac-common',
    name: '3 Bed Non AC Room',
    tagline: 'Budget family room with common let-bath',
    description: 'Affordable non-AC option listed with one double bed, one single bed, and Indian or western common let-bath. Suitable for value-conscious yatris and small families.',
    price: 1099,
    tax: 54.95,
    available: 9,
    capacity: '3 Guests',
    size: 'Double + Single Bed',
    floor: 'Ground / 1st Floor',
    bathType: 'Indian or Western Common Let-Bath',
    image: '/images/yatradham/property-2.jpg',
    gallery: ['/images/yatradham/property-2.jpg', '/images/yatradham/property-3.jpg', '/images/yatradham/property-6.jpg'],
    amenities: ['Non AC', 'Double Bed', 'Single Bed', 'Common Let-Bath', 'Food Facility', 'CCTV'],
  },
  {
    id: '4-bed-ac-room',
    name: '4 Bed AC Room',
    tagline: 'Spacious AC room with geyser',
    description: 'Four-guest AC room category with two double beds, geyser facility, western attached let-bath, and first-floor allocation for a comfortable family pilgrimage stay.',
    price: 1799,
    tax: 89.95,
    available: 7,
    capacity: '4 Guests',
    size: '2 Double Beds',
    floor: '1st Floor',
    bathType: 'Western Attached Let-Bath',
    image: '/images/yatradham/property-5.jpg',
    gallery: ['/images/yatradham/property-5.jpg', '/images/yatradham/property-4.jpg', '/images/yatradham/property-6.jpg'],
    amenities: ['AC', '2 Double Beds', 'With Geyser', 'Attached Let-Bath', 'Parking', 'Food Facility'],
  },
  {
    id: '5-bed-ac-room',
    name: '5 Bed AC Room',
    tagline: 'Large AC room for group stays',
    description: 'Five-guest AC room category with two double beds, one single bed, western attached let-bath, and first-floor allocation for group darshan visits.',
    price: 1999,
    tax: 99.95,
    available: 5,
    capacity: '5 Guests',
    size: '2 Double + Single Bed',
    floor: '1st Floor',
    bathType: 'Western Attached Let-Bath',
    image: '/images/yatradham/property-3.jpg',
    gallery: ['/images/yatradham/property-3.jpg', '/images/yatradham/property-5.jpg', '/images/yatradham/property-6.jpg'],
    amenities: ['AC', '2 Double Beds', 'Single Bed', 'Attached Let-Bath', 'Clean Drinking Water', 'CCTV'],
  },
  {
    id: 'ac-dormitory-hall',
    name: 'AC Dormitory Hall',
    tagline: 'Group hall for up to 25 persons',
    description: 'Dormitory accommodation listed with 25-person capacity, mattress-only arrangement, and Indian or western common let-bath for large groups and yatri batches.',
    price: 560,
    tax: 28,
    available: 25,
    capacity: '25 Person Capacity',
    size: 'Mattress Only',
    floor: 'Dormitory',
    bathType: 'Indian or Western Common Let-Bath',
    image: '/images/yatradham/property-6.jpg',
    gallery: ['/images/yatradham/property-6.jpg', '/images/yatradham/property-1.jpg', '/images/yatradham/property-5.jpg'],
    amenities: ['AC Dormitory', 'Mattress Only', 'Common Let-Bath', 'Food Facility', 'Parking', 'Clean Drinking Water'],
  },
]

export const defaultVideos: VideoItem[] = [
  {
    id: 'promo',
    title: 'A Divine Stay with Modern Facilities',
    description: 'Ayodhya Darshan promo with Shri Ram Janmabhoomi, Hanuman Garhi, Kanak Bhawan and guest facilities near Ramghat.',
    src: '/videos/ayodhya-darshan.mp4',
    poster: '/images/temples/ram-mandir-real.jpg',
    duration: '00:11',
    youtubeUrl: 'https://www.youtube.com/watch?v=Jqv0k3rY2QQ',
    visibility: 'public',
    popupSource: 'storage',
  },
]

export const defaultTemples: Temple[] = [
  {
    id: 'ram-mandir',
    name: 'Shri Ram Janmabhoomi Temple',
    distance: '1.7 km from trust',
    image: '/images/temples/ram-mandir-real.jpg',
    description: 'The sacred birthplace of Lord Ram and the central darshan destination for Ayodhya yatris.',
  },
  {
    id: 'hanuman-garhi',
    name: 'Hanuman Garhi',
    distance: '1.3 km from trust',
    image: '/images/temples/hanuman-garhi-real.jpg',
    description: 'A revered Hanuman ji temple and one of the most important pilgrimage stops near Ramghat.',
  },
  {
    id: 'kanak-bhawan',
    name: 'Kanak Bhawan Temple',
    distance: '1.3 km from trust',
    image: '/images/temples/kanak-bhawan-real.jpg',
    description: 'A beautiful temple associated with Lord Ram and Mata Sita, known for its ornate devotional architecture.',
  },
]

export const defaultServices: LocalService[] = [
  {
    id: 'satvik-food',
    title: 'Satvik Food Available',
    subtitle: 'Fresh bhojan for families and yatris',
    description: 'Clean, homely and satvik vegetarian meals are available for guests so your Ayodhya stay remains comfortable, healthy and devotional.',
    image: '/images/services/food.jpg',
    highlights: ['Breakfast / Lunch / Dinner support', 'Family-friendly vegetarian meals', 'Group bhojan coordination'],
    cta: 'Ask for Food Timing',
  },
  {
    id: 'transportation',
    title: 'Bike, Car & Local Transport',
    subtitle: 'Easy movement across Ayodhya Dham',
    description: 'Tourists can request bike, car or local transport assistance for station pickup, airport transfer, Ram Mandir darshan route and nearby temple visits.',
    image: '/images/services/transport.jpg',
    highlights: ['Bike / car assistance', 'Railway station & airport help', 'Darshan route planning'],
    cta: 'Request Transport',
  },
  {
    id: 'ayodhya-guide',
    title: 'Ayodhya Darshan Guide',
    subtitle: 'A local guide to show sacred places',
    description: 'A knowledgeable local guide can help guests explore Ram Mandir, Hanuman Garhi, Kanak Bhawan, Dashrath Mahal, Saryu Ghat and other important sites.',
    image: '/images/services/guide.jpg',
    highlights: ['Main temple darshan route', 'Local history & guidance', 'Family/group tour support'],
    cta: 'Book Local Guide',
  },
]

export const defaultReviews: Review[] = [
  {
    id: 'r1',
    name: 'Raghav Sharma',
    rating: 5,
    message: 'Nice place for stay. Near from Temple of Ramlala, Hanuman Garhi and Ghat. Staff behaviour is excellent.',
    date: '2026-05-08',
  },
  {
    id: 'r2',
    name: 'Meera Iyer',
    rating: 5,
    message: 'Stay was comfortable and all places are nearby to visit. Good accommodation and convenient location.',
    date: '2026-05-10',
  },
]

export const defaultBookings: Booking[] = [
  {
    id: 'BKG-1088',
    name: 'Amit Verma',
    phone: '+91 90000 11223',
    room: '2 Bed AC Room',
    checkIn: '2026-05-18',
    guests: '2',
    status: 'New',
  },
  {
    id: 'BKG-1089',
    name: 'Sunita Rao',
    phone: '+91 91111 22334',
    room: '4 Bed AC Room',
    checkIn: '2026-05-21',
    guests: '4',
    status: 'Confirmed',
  },
]

function getStored<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key)
    return item ? (JSON.parse(item) as T) : fallback
  } catch {
    return fallback
  }
}

function setStored<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new Event('sst-storage-updated'))
}

function mergeSettings(value: Settings): Settings {
  return { ...defaultSettings, ...value }
}

function mergeVideos(value: VideoItem[]): VideoItem[] {
  return value.map((video) => ({ ...video, visibility: video.visibility || 'public', popupSource: video.popupSource || 'storage' }))
}

export const storage = {
  keys: STORAGE_KEYS,
  getSettings: () => mergeSettings(getStored<Settings>(STORAGE_KEYS.settings, defaultSettings)),
  setSettings: (value: Settings) => setStored(STORAGE_KEYS.settings, value),
  getRooms: () => getStored<Room[]>(STORAGE_KEYS.rooms, defaultRooms),
  setRooms: (value: Room[]) => setStored(STORAGE_KEYS.rooms, value),
  getVideos: () => mergeVideos(getStored<VideoItem[]>(STORAGE_KEYS.videos, defaultVideos)),
  setVideos: (value: VideoItem[]) => setStored(STORAGE_KEYS.videos, value),
  getReviews: () => getStored<Review[]>(STORAGE_KEYS.reviews, defaultReviews),
  setReviews: (value: Review[]) => setStored(STORAGE_KEYS.reviews, value),
  getBookings: () => getStored<Booking[]>(STORAGE_KEYS.bookings, defaultBookings),
  setBookings: (value: Booking[]) => setStored(STORAGE_KEYS.bookings, value),
  getTemples: () => getStored<Temple[]>(STORAGE_KEYS.temples, defaultTemples),
  setTemples: (value: Temple[]) => setStored(STORAGE_KEYS.temples, value),
  getServices: () => getStored<LocalService[]>(STORAGE_KEYS.services, defaultServices),
  setServices: (value: LocalService[]) => setStored(STORAGE_KEYS.services, value),
}
