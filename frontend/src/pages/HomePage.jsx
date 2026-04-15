import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  searchAddresses,
  searchLocalities,
  validateSearchInput,
} from '../services/api.js'
import { saveContext } from '../utils/storage.js'
import heroImage from '../assets/bg.png'

const PROFILES = [
  { key: 'familyWithChildren', title: 'Family', emoji: '👨‍👩‍👧', desc: 'Schools, parks & safe streets' },
  { key: 'elderly', title: 'Elderly', emoji: '🧓', desc: 'Healthcare, quiet & accessible' },
  { key: 'petOwner', title: 'Pet Owner', emoji: '🐾', desc: 'Dog parks & off-leash areas' },
]

const VALUE_PROPS = [
  {
    icon: '🏆',
    title: 'Liveability Score',
    desc: 'Instant suburb ratings across accessibility, safety and environment',
  },
  {
    icon: '🗺️',
    title: 'Map Insights',
    desc: 'Insights, heatmaps and green space in one interactive view',
  },
  {
    icon: '⚖️',
    title: 'Compare Areas',
    desc: 'Side-by-side suburb data to help you decide with confidence',
  },
]

export default function HomePage() {
  const navigate = useNavigate()

  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  const [suburbResults, setSuburbResults] = useState([])
  const [addressResults, setAddressResults] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)

  const [profile, setProfile] = useState({
    familyWithChildren: false,
    elderly: false,
    petOwner: false,
  })

  useEffect(() => {
    const query = address.trim()
    const selectedText =
      selectedLocation?.displayName ||
      selectedLocation?.fullAddress ||
      selectedLocation?.name ||
      ''

    if (selectedLocation && query === selectedText) {
      setSuburbResults([])
      setAddressResults([])
      return
    }

    if (selectedLocation && query !== selectedText) {
      setSelectedLocation(null)
    }

    if (query.length < 3) {
      setSuburbResults([])
      setAddressResults([])
      return
    }

    const words = query.toLowerCase().split(/\s+/).filter(Boolean)

    function dedupeAndFilter(arr) {
      const seen = new Set()
      return arr.filter((item) => {
        const label = (item.displayName || item.fullAddress || item.name || '').toLowerCase()
        const key = label
        if (seen.has(key)) return false
        seen.add(key)
        return words.every((w) => label.includes(w))
      })
    }

    let cancelled = false

    const timer = setTimeout(() => {
      Promise.allSettled([searchLocalities(query), searchAddresses(query)])
        .then((results) => {
          if (cancelled) return
          const localities =
            results[0].status === 'fulfilled' && Array.isArray(results[0].value)
              ? results[0].value
              : []
          const addresses =
            results[1].status === 'fulfilled' && Array.isArray(results[1].value)
              ? results[1].value
              : []
          setSuburbResults(dedupeAndFilter(localities))
          setAddressResults(dedupeAndFilter(addresses))
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [address, selectedLocation])

  function onSelectLocation(location) {
    const label = location.displayName || location.fullAddress || location.name || ''
    setSelectedLocation(location)
    setAddress(label)
    setSuburbResults([])
    setAddressResults([])
    setError('')
  }

  function toggleProfile(key) {
    setProfile((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function onSubmit() {
    const v = validateSearchInput(address)
    if (!v.ok) {
      setError(v.message)
      return
    }
    if (!selectedLocation) {
      setError('Please select a suburb or address from the results.')
      return
    }
    setError('')
    const ctx = { selectedLocation, profile, rangeMinutes: 20 }
    saveContext(ctx)
    navigate('/map', { state: ctx })
  }

  const hasResults = suburbResults.length > 0 || addressResults.length > 0

  return (
    <div className="nwHome">
      {/* HERO */}
      <section
        className="hero"
        style={{ backgroundImage: `url(${heroImage})` }}
        aria-label="Hero"
      >
        <div className="hero-overlay" aria-hidden="true" />

        <div className="hero-content">
          <span className="hero-eyebrow">Melbourne · Liveability Explorer</span>

          <h1 className="hero-headline">
            Melbourne neighbourhoods,<br />
            scored for <em>the way you live.</em>
          </h1>

          <p className="hero-subtitle">
            Data-backed insights across accessibility, safety and environment -
            personalised to your situation.
          </p>
        </div>

        <button
          className="hero-scroll"
          aria-label="Scroll to content"
          onClick={() => document.getElementById('value-prop')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span>Explore</span>
          <div className="hero-scroll-chevron" aria-hidden="true" />
        </button>
      </section>

      {/* VALUE PROP */}
      <section id="value-prop" className="vp-section" aria-labelledby="vp-heading">
        <div className="vp-header">
          <p className="vp-header-label">What you get</p>
          <h2 id="vp-heading">Everything you need to choose your suburb</h2>
        </div>

        <div className="vp-inner">
          {VALUE_PROPS.map((vp) => (
            <div key={vp.title} className="vp-card">
              <div className="vp-card-icon" aria-hidden="true">{vp.icon}</div>
              <h3>{vp.title}</h3>
              <p>{vp.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SEARCH */}
      <section className="search-section" aria-labelledby="search-heading">
        <div className="search-inner">
          <p className="search-section-label">Get started</p>
          <h2 id="search-heading" className="search-section-title">
            Check a suburb or address
          </h2>

          <div className="search-input-wrap">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Fitzroy or 123 Swanston St"
              aria-label="Search suburb or address"
              aria-autocomplete="list"
              aria-expanded={hasResults}
              autoComplete="off"
            />
            <span className="search-icon" aria-hidden="true">⌕</span>
          </div>

          {error && (
            <p className="search-error" role="alert">{error}</p>
          )}

          {hasResults && (
            <div className="search-dropdown" role="listbox" aria-label="Search results">
              {suburbResults.length > 0 && (
                <>
                  <div className="search-dropdown-group-label" aria-hidden="true">Suburbs</div>
                  {suburbResults.map((item, i) => (
                    <div
                      key={`suburb-${i}`}
                      className="search-dropdown-item"
                      role="option"
                      aria-selected="false"
                      tabIndex={0}
                      onClick={() => onSelectLocation(item)}
                      onKeyDown={(e) => e.key === 'Enter' && onSelectLocation(item)}
                    >
                      {item.displayName || item.name}
                    </div>
                  ))}
                </>
              )}
              {addressResults.length > 0 && (
                <>
                  {suburbResults.length > 0 && <div className="search-dropdown-group-divider" aria-hidden="true" />}
                  <div className="search-dropdown-group-label" aria-hidden="true">Addresses</div>
                  {addressResults.map((item, i) => (
                    <div
                      key={`address-${i}`}
                      className="search-dropdown-item"
                      role="option"
                      aria-selected="false"
                      tabIndex={0}
                      onClick={() => onSelectLocation(item)}
                      onKeyDown={(e) => e.key === 'Enter' && onSelectLocation(item)}
                    >
                      {item.displayName || item.fullAddress || item.name}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          <p className="profile-label" id="profile-label">Your situation</p>

          <div className="profile-row" role="group" aria-labelledby="profile-label">
            {PROFILES.map(({ key, title, emoji, desc }) => (
              <div
                key={key}
                className={`profile-card${profile[key] ? ' active' : ''}`}
                role="button"
                aria-pressed={profile[key]}
                tabIndex={0}
                onClick={() => toggleProfile(key)}
                onKeyDown={(e) => e.key === 'Enter' && toggleProfile(key)}
              >
                <span className="profile-card-emoji" aria-hidden="true">{emoji}</span>
                <span className="profile-card-title">{title}</span>
                <span className="profile-card-desc">{desc}</span>
                <div className="profile-check" aria-hidden="true">
                  {profile[key] && '✓'}
                </div>
              </div>
            ))}
          </div>

          <button
            className="home-cta"
            onClick={onSubmit}
            aria-label="Explore liveability for selected location"
          >
            Explore Liveability →
          </button>

          <div className="coverage-notice">
            <span className="coverage-dot" aria-hidden="true" />
            <span>Currently covering select Melbourne suburbs</span>
            <span aria-hidden="true">·</span>
            <Link to="/coverage" className="coverage-link">View Coverage Map</Link>
          </div>
        </div>
      </section>
    </div>
  )
}