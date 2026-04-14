import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getCompareUpdatedEventName, loadCompareList } from '../utils/storage.js'

export default function NavigationBar() {
  const location = useLocation()
  const [compareCount, setCompareCount] = useState(() => loadCompareList().length)

  const isActive = (path) => location.pathname === path

  useEffect(() => {
    const eventName = getCompareUpdatedEventName()
    const onUpdated = () => setCompareCount(loadCompareList().length)
    window.addEventListener(eventName, onUpdated)
    return () => window.removeEventListener(eventName, onUpdated)
  }, [])

  return (
    <header className="nwNavBar">
      {/* LOGO */}
      <Link to="/" className="nwBrand" aria-label="NeighbourWise">
        <img className="nwBrandLogoFull" src="/logo-neighbourwise.png" alt="" />
      </Link>

      <nav className="nav-links" aria-label="Primary">
        <Link to="/" className={isActive('/') ? 'active' : ''}>
          Home
        </Link>

        <Link to="/compare" className={isActive('/compare') ? 'active' : ''}>
          Compare ({compareCount})
        </Link>

        <Link to="/about" className={isActive('/about') ? 'active' : ''}>
          About
        </Link>
      </nav>
    </header>
  )
}