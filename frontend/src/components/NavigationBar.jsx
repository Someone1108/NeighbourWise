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

  const activeStyle = {
    borderColor: 'rgba(244, 124, 32, 0.42)',
    background: 'rgba(244, 124, 32, 0.08)',
  }

  return (
    <header className="nwNavBar">
      <Link to="/" className="nwBrand" aria-label="NeighbourWise">
        <span className="nwBrandLogo" aria-hidden="true">
          <img className="nwBrandLogoHouse" src="/logo-house.jpg" alt="" />
          <img className="nwBrandLogoWordmark" src="/logo-wordmark.jpg" alt="" />
        </span>
      </Link>

      <nav className="nwNavLinks" aria-label="Primary">
        <Link to="/" className="nwLinkBtn" style={isActive('/') ? activeStyle : undefined}>
          Home
        </Link>

        <Link
          to="/compare"
          className="nwLinkBtn"
          style={isActive('/compare') ? activeStyle : undefined}
        >
          Compare ({compareCount})
        </Link>

        <Link to="/about" className="nwLinkBtn" style={isActive('/about') ? activeStyle : undefined}>
          About
        </Link>
      </nav>
    </header>
  )
}