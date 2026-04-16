import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getCompareUpdatedEventName, loadCompareList } from '../utils/storage.js'

export default function NavigationBar() {
  const location = useLocation()
  const [compareCount, setCompareCount] = useState(() => loadCompareList().length)
  const [scrolled, setScrolled] = useState(false)

  const isHome = location.pathname === '/'
  const isActive = (path) => location.pathname === path

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