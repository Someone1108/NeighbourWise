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
  const [menuOpen, setMenuOpen] = useState(false)

  const isHome = location.pathname === '/'
  const isActive = (path) => location.pathname === path

  // Close mobile menu on route change
  useEffect(() => {
    const closeMenuTimer = setTimeout(() => setMenuOpen(false), 0)
    return () => clearTimeout(closeMenuTimer)
  }, [location.pathname])

  // Close on Escape
  useEffect(() => {
    if (!menuOpen) return
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  function hasEnteredAddress() {
    const savedContext = loadContext()
    const selectedLocation = savedContext?.selectedLocation
    if (!selectedLocation) return false
    return Boolean(selectedLocation.displayName || selectedLocation.fullAddress || selectedLocation.name)
  }

  function scrollHomeToSearch() {
    // Wait a frame so HomePage has mounted if we just navigated.
    requestAnimationFrame(() => {
      const searchInput = document.getElementById('home-search-input')
      if (searchInput) {
        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Slight delay before focusing so the smooth scroll isn't interrupted.
        setTimeout(() => {
          try { searchInput.focus({ preventScroll: true }) } catch { searchInput.focus() }
        }, 350)
      }
    })
  }

  function handleMapClick(e) {
    e.preventDefault()
    setMenuOpen(false)
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
      const resetScrollTimer = setTimeout(() => setScrolled(false), 0)
      return () => clearTimeout(resetScrollTimer)
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

        <button
          className="nwNavHamburger"
          onClick={() => setMenuOpen(v => !v)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          <span className="nwHamburgerBar" />
          <span className="nwHamburgerBar" />
          <span className="nwHamburgerBar" />
        </button>
      </div>

      {menuOpen && (
        <nav className="nwNavMobileMenu" aria-label="Mobile navigation">
          <Link
            to="/"
            className={isActive('/') ? 'active' : ''}
            aria-current={isActive('/') ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}
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
            onClick={() => setMenuOpen(false)}
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
            onClick={() => setMenuOpen(false)}
          >
            About
          </Link>
        </nav>
      )}
    </header>
  )
}
