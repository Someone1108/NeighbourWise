import CoverageMap from '../components/CoverageMap.jsx'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  searchAddresses,
  searchLocalities,
  validateSearchInput,
  getCoverageSuburbs,
  getCoverageMap,
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
  const [showCoverageModal, setShowCoverageModal] = useState(false)
  const [supportedSuburbs, setSupportedSuburbs] = useState([])

  const [coverageMapData, setCoverageMapData] = useState(null)
  const [coverageMapLoading, setCoverageMapLoading] = useState(true)
  const [coverageMapError, setCoverageMapError] = useState('')

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
        .catch((err) => {
          console.error('Search fetch failed:', err)
          if (!cancelled) {
            setSuburbResults([])
            setAddressResults([])
          }
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [address, selectedLocation])

  useEffect(() => {
    let cancelled = false

    async function loadCoverageSuburbs() {
      try {
        const data = await getCoverageSuburbs()
        if (!cancelled) {
          setSupportedSuburbs(Array.isArray(data?.suburbs) ? data.suburbs : [])
        }
      } catch (error) {
        console.error('Failed to load coverage suburbs:', error)
        if (!cancelled) {
          setSupportedSuburbs([])
        }
      }
    }

    loadCoverageSuburbs()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCoverageMap() {
      try {
        setCoverageMapLoading(true)
        setCoverageMapError('')
        const data = await getCoverageMap()

        if (!cancelled) {
          setCoverageMapData(data)
        }
      } catch (error) {
        console.error('Failed to load coverage map:', error)
        if (!cancelled) {
          setCoverageMapError('Failed to load coverage map')
          setCoverageMapData(null)
        }
      } finally {
        if (!cancelled) {
          setCoverageMapLoading(false)
        }
      }
    }

    loadCoverageMap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!showCoverageModal) return

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setShowCoverageModal(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [showCoverageModal])

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
    <>
      <div className="nwHome">
        <section
          className="hero"
          style={{ backgroundImage: `url(${heroImage})` }}
          aria-label="Hero"
        >
          <div className="hero-overlay" aria-hidden="true" />

          <div className="hero-content">
            <span className="hero-eyebrow">Melbourne · Liveability Explorer</span>

            <h1 className="hero-headline">
              Melbourne neighbourhoods,
              <br />
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
            onClick={() =>
              document.getElementById('value-prop')?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            <span>Explore</span>
            <div className="hero-scroll-chevron" aria-hidden="true" />
          </button>
        </section>

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

        <section className="coverageSection" aria-labelledby="coverage-heading">
          <div className="coverageSectionInner">
            <div className="coverageCopy">
              <p className="coverageEyebrow">Coverage</p>
              <h2 id="coverage-heading" className="coverageTitle">
                See which parts of Melbourne we cover
              </h2>
              <p className="coverageText">
                Explore the areas currently supported by NeighbourWise across Melbourne.
                Open the coverage view to see where you can search suburbs and addresses.
              </p>

              <div className="coverageMeta">
                <span className="coverageMetaPill">
                  {supportedSuburbs.length}+ suburbs
                </span>
                <span className="coverageMetaPill">
                  Suburb and address search
                </span>
              </div>

              <button
                type="button"
                className="coverageButton"
                onClick={() => setShowCoverageModal(true)}
              >
                View coverage map
              </button>
            </div>

            <div className="coveragePreviewCard">
              <CoverageMap
                data={coverageMapData}
                loading={coverageMapLoading}
                error={coverageMapError}
              />
            </div>
          </div>
        </section>

        <section className="search-section" aria-labelledby="search-heading">
          <div className="search-inner">
            <p className="search-section-label">Get started</p>
            <h2 id="search-heading" className="search-section-title">
              Check a suburb or address
            </h2>

            <label
              htmlFor="home-search-input"
              className="search-section-label"
              style={{ display: 'block', marginBottom: 8 }}
            >
              Enter a suburb or address
            </label>

            <div className="search-input-wrap">
              <input
                id="home-search-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Fitzroy or 123 Swanston St"
                aria-autocomplete="list"
                aria-expanded={hasResults}
                aria-controls={hasResults ? 'home-search-results' : undefined}
                aria-describedby={error ? 'home-search-error' : undefined}
                autoComplete="off"
              />
              <span className="search-icon" aria-hidden="true">⌕</span>
            </div>

            <div
              id="home-search-error"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              style={{ minHeight: 20 }}
            >
              {error && <p className="search-error">{error}</p>}
            </div>

            {hasResults && (
              <div
                id="home-search-results"
                className="search-dropdown"
                role="listbox"
                aria-label="Search results"
              >
                {suburbResults.length > 0 && (
                  <>
                    <div className="search-dropdown-group-label" aria-hidden="true">Suburbs</div>
                    {suburbResults.map((item, i) => (
                      <div
                        key={`suburb-${i}`}
                        className="search-dropdown-item"
                        role="option"
                        aria-selected={selectedLocation?.displayName === (item.displayName || item.name)}
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
                    {suburbResults.length > 0 && (
                      <div className="search-dropdown-group-divider" aria-hidden="true" />
                    )}
                    <div className="search-dropdown-group-label" aria-hidden="true">Addresses</div>
                    {addressResults.map((item, i) => (
                      <div
                        key={`address-${i}`}
                        className="search-dropdown-item"
                        role="option"
                        aria-selected={selectedLocation?.fullAddress === (item.fullAddress || item.name)}
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
              <span>Currently covering Melbourne locations through suburb and address search</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className="coverage-link coverage-link-button"
                onClick={() => setShowCoverageModal(true)}
              >
                View Coverage Map
              </button>
            </div>
          </div>
        </section>
      </div>

      {showCoverageModal && (
        <div
          className="coverageModalOverlay"
          role="presentation"
          onClick={() => setShowCoverageModal(false)}
        >
          <div
            className="coverageModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coverage-modal-title"
            aria-describedby="coverage-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="coverageModalHeader">
              <div>
                <p className="coverageEyebrow">Coverage map</p>
                <h3 id="coverage-modal-title" className="coverageModalTitle">
                  See what parts of Melbourne we currently support
                </h3>
                <p id="coverage-modal-desc" className="coverageModalDesc">
                  NeighbourWise currently supports Melbourne-wide suburb coverage,
                  with suburb and address search available across the platform.
                </p>
              </div>

              <button
                type="button"
                className="coverageModalClose"
                aria-label="Close coverage map"
                onClick={() => setShowCoverageModal(false)}
              >
                ✕
              </button>
            </div>

            <CoverageMap
              data={coverageMapData}
              loading={coverageMapLoading}
              error={coverageMapError}
            />

            <div className="coverageModalFooter">
              <p>
                This view highlights overall Melbourne coverage. Search results can be
                explored by suburb or address across the supported area.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}