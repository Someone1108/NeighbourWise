import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  getCompareUpdatedEventName,
  loadCompareList,
  loadContext,
} from '../utils/storage.js'

export default function NavigationBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [compareCount, setCompareCount] = useState(() => loadCompareList().length)
  const [scrolled, setScrolled] = useState(false)

  const isHome = location.pathname === '/'
  const isActive = (path) => location.pathname === path

  function hasEnteredAddress() {
    const ctx = loadContext()
    const sel = ctx?.selectedLocation
    if (!sel) return false
    return Boolean(sel.displayName || sel.fullAddress || sel.name)
  }

  function scrollHomeToSearch() {
    // Wait a frame so HomePage has mounted if we just navigated.
    requestAnimationFrame(() => {
      const el = document.getElementById('home-search-input')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Slight delay before focusing so the smooth scroll isn't interrupted.
        setTimeout(() => {
          try { el.focus({ preventScroll: true }) } catch { el.focus() }
        }, 350)
      }
    })
  }

  function handleMapClick(e) {
    e.preventDefault()
    if (hasEnteredAddress()) {
      navigate('/map')
      return
    }
    if (isHome) {
      scrollHomeToSearch()
    } else {
      navigate('/')
      // Give the route transition a tick before scrolling.
      setTimeout(scrollHomeToSearch, 50)
    }
  }

  useEffect(() => {
    const eventName = getCompareUpdatedEventName()
    const onUpdated = () => setCompareCount(loadCompareList().length)
    window.addEventListener(eventName, onUpdated)
    return () => window.removeEventListener(eventName, onUpdated)
  }, [])

  useEffect(() => {
    if (!isHome) {
      setScrolled(false)
      return
    }
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isHome])

  const navClass = [
    'nwNavBar',
    !isHome ? 'is-solid' : scrolled ? 'is-scrolled' : '',
  ].filter(Boolean).join(' ')

  return (
    <header className={navClass}>
      <div className="nwNavInner">
        <Link to="/" className="nwBrand" aria-label="NeighbourWise home">
          <img className="nwBrandLogoFull" src="/logo-neighbourwise.png" alt="NeighbourWise" />
        </Link>

        <nav className="nav-links" aria-label="Primary navigation">
          <Link
            to="/"
            className={isActive('/') ? 'active' : ''}
            aria-current={isActive('/') ? 'page' : undefined}
          >
            Home
          </Link>

          <Link
            to="/map"
            onClick={handleMapClick}
            className={isActive('/map') ? 'active' : ''}
            aria-current={isActive('/map') ? 'page' : undefined}
          >
            Map
          </Link>

          <Link
            to="/compare"
            className={isActive('/compare') ? 'active' : ''}
            aria-current={isActive('/compare') ? 'page' : undefined}
          >
            Compare
            {compareCount > 0 && (
              <span className="nwCompareBadge" aria-label={`${compareCount} areas saved for comparison`}>
                {compareCount}
              </span>
            )}
          </Link>

          <Link
            to="/about"
            className={isActive('/about') ? 'active' : ''}
            aria-current={isActive('/about') ? 'page' : undefined}
          >
            About
          </Link>
        </nav>
      </div>
    </header>
  )
}