import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Home } from './pages/Home'
import { Admin } from './pages/Admin'
import { Login } from './pages/Login'
import { Pay } from './pages/Pay'
import { PaymentsAdmin } from './pages/PaymentsAdmin'
import { BookingsAdmin } from './pages/BookingsAdmin'
import { BookingStatus } from './pages/BookingStatus'
import { Policy } from './pages/Policy'
import { trackPageView } from './lib/metaPixel'

// Fires a Meta Pixel PageView on first load and on every route change.
// Admin and login pages are skipped so staff visits don't pollute ad data.
function PixelRouteTracker() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (pathname.startsWith('/admin') || pathname.startsWith('/login') || pathname.startsWith('/pay') || pathname.startsWith('/booking/')) return
    trackPageView()
  }, [pathname])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <PixelRouteTracker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/payments" element={<PaymentsAdmin />} />
        <Route path="/admin/bookings" element={<BookingsAdmin />} />
        <Route path="/pay/:token" element={<Pay />} />
        <Route path="/booking/:ref" element={<BookingStatus />} />
        <Route path="/privacy" element={<Policy kind="privacy" />} />
        <Route path="/terms" element={<Policy kind="terms" />} />
        <Route path="/refund-policy" element={<Policy kind="refund" />} />
        <Route path="/contact" element={<Policy kind="contact" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
