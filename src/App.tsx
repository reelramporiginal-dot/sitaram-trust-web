import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Home } from './pages/Home'
import { Admin } from './pages/Admin'
import { Login } from './pages/Login'
import { trackPageView } from './lib/metaPixel'

// Fires a Meta Pixel PageView on first load and on every route change.
// Admin and login pages are skipped so staff visits don't pollute ad data.
function PixelRouteTracker() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (pathname.startsWith('/admin') || pathname.startsWith('/login')) return
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
      </Routes>
    </BrowserRouter>
  )
}

export default App
