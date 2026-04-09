import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import {
  searchAddresses,
  searchLocalities,
  validateSearchInput,
} from '../services/api.js'
import { saveContext } from '../utils/storage.js'

const PROFILE_INFO = {
  familyWithChildren: {
    title: 'Family with children',
    description: 'Focus on a suburb that feels practical for family living and daily convenience.',
  },
  elderly: {
    title: 'Elderly',
    description: 'Explore areas with a clearer sense of comfort, access, and local suitability.',
  },
  petOwner: {
    title: 'Pet owner',
    description: 'Consider neighbourhoods that may better support pet-friendly daily living.',
  },
}

export default function HomePage() {
  const navigate = useNavigate()

  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  const [suburbResults, setSuburbResults] = useState([])
  const [addressResults, setAddressResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState(null)

  const [profile, setProfile] = useState({
    familyWithChildren: false,
    elderly: false,
    petOwner: false,
  })

  const selectedProfileCount = useMemo(() => {
    return Object.values(profile).filter(Boolean).length
  }, [profile])

  useEffect(() => {
    const query = address.trim()

    const selectedText =
      selectedLocation?.displayName || selectedLocation?.name || ''

    if (selectedLocation && query !== selectedText) {
      setSelectedLocation(null)
    }

    if (query.length < 3) {
      setSuburbResults([])
      setAddressResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

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

          setSuburbResults(localities)
          setAddressResults(addresses)
        })
        .finally(() => {
          if (cancelled) return
          setSearching(false)
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [address, selectedLocation])

  function onSelectLocation(location) {
    const label = location.displayName || location.name || ''
    setSelectedLocation(location)
    setAddress(label)
    setSuburbResults([])
    setAddressResults([])
    setError('')
  }

  function toggleProfile(key, checked) {
    setProfile((prev) => ({ ...prev, [key]: checked }))
  }

  function onSubmit() {
    const v = validateSearchInput(address)
    if (!v.ok) {
      setError(v.message)
      return
    }

    if (!selectedLocation) {
      setError('Please select a suburb or address from the search results.')
      return
    }

    setError('')

    const ctx = {
      selectedLocation,
      profile,
      rangeMinutes: 20,
    }

    saveContext(ctx)
    navigate('/map', { state: ctx })
  }

  const hasResults = suburbResults.length > 0 || addressResults.length > 0

  return (
    <div className="nwPage">
      <section className="nwHero">
        <div className="nwHeroTop">
          <div className="nwHeroIntro">
            <h1 className="nwPageTitle nwHomeTitle">Find the right place to live</h1>
            <p className="nwSubtitle nwHomeSubtitle">
              Explore unfamiliar Melbourne suburbs through neighbourhood context,
              map-based insights, and a clearer starting point before you move.
            </p>
          </div>
        </div>

        <div className="nwHeroGrid">
          <div className="nwCard nwHomeCard">
            <div className="nwHomeSection">
              <label className="nwSectionLabel" htmlFor="nw-suburb-search">
                Search
              </label>

              <div className="nwSearchBlock">
                <input
                  id="nw-suburb-search"
                  className="nwInput nwSearchInput"
                  placeholder="Enter suburb or address"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    setError('')
                  }}
                  aria-label="Search suburb or address"
                  autoComplete="off"
                />

                {searching ? <div className="nwSearchStatus">Searching...</div> : null}

                {!searching && hasResults ? (
                  <div
                    style={{
                      marginTop: 10,
                      border: '1px solid #ddd',
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: '#fff',
                    }}
                  >
                    {suburbResults.length > 0 ? (
                      <div
                        style={{
                          padding: '10px 14px',
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: 0.3,
                          color: '#555',
                          background: '#f7f7f7',
                          borderBottom: '1px solid #eee',
                        }}
                      >
                        SUBURBS
                      </div>
                    ) : null}

                    {suburbResults.map((result, index) => (
                      <button
                        key={`suburb-${result.id}-${index}`}
                        type="button"
                        onClick={() => onSelectLocation(result)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '12px 14px',
                          border: 'none',
                          borderBottom:
                            index === suburbResults.length - 1 && addressResults.length === 0
                              ? 'none'
                              : '1px solid #eee',
                          background: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {result.displayName || result.name}
                        </div>
                        <div style={{ fontSize: 13, color: '#666' }}>
                          {result.state || 'Suburb'}
                        </div>
                      </button>
                    ))}

                    {addressResults.length > 0 ? (
                      <div
                        style={{
                          padding: '10px 14px',
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: 0.3,
                          color: '#555',
                          background: '#f7f7f7',
                          borderTop: suburbResults.length > 0 ? '1px solid #eee' : 'none',
                          borderBottom: '1px solid #eee',
                        }}
                      >
                        ADDRESSES
                      </div>
                    ) : null}

                    {addressResults.map((result, index) => (
                      <button
                        key={`address-${result.id || result.displayName}-${index}`}
                        type="button"
                        onClick={() => onSelectLocation(result)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '12px 14px',
                          border: 'none',
                          borderBottom:
                            index === addressResults.length - 1 ? 'none' : '1px solid #eee',
                          background: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {result.displayName || result.fullAddress || result.name}
                        </div>
                        <div style={{ fontSize: 13, color: '#666' }}>
                          {result.suburb
                            ? `${result.suburb}${result.postcode ? `, ${result.postcode}` : ''}`
                            : result.placeType || 'Address'}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}

                {!searching &&
                address.trim().length >= 3 &&
                !hasResults &&
                !selectedLocation ? (
                  <div style={{ marginTop: 8, color: 'var(--text)' }}>
                    No matching suburb or address found.
                  </div>
                ) : null}

                {selectedLocation ? (
                  <div style={{ marginTop: 10, color: 'var(--text)' }}>
                    Selected {selectedLocation.type === 'address' ? 'address' : 'suburb'}:{' '}
                    <strong>
                      {selectedLocation.displayName ||
                        selectedLocation.fullAddress ||
                        selectedLocation.name}
                    </strong>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="nwHomeSection">
              <div className="nwSectionLabel">Your situation</div>

              <div className="nwPersonaGrid">
                {Object.entries(PROFILE_INFO).map(([key, item]) => {
                  const checked = profile[key]
                  return (
                    <label
                      key={key}
                      className={`nwPersonaCard ${checked ? 'nwPersonaCardActive' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleProfile(key, e.target.checked)}
                      />
                      <span className="nwPersonaCardTitle">{item.title}</span>
                      <span className="nwPersonaCardText">{item.description}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {error ? <div className="nwError">{error}</div> : null}

            <div className="nwBtnRow">
              <Button variant="primary" onClick={onSubmit}>
                Check Liveability
              </Button>
            </div>

            <div className="nwHomeMeta">
              <div>Your data is protected</div>
              {selectedProfileCount ? (
                <div className="nwSelectedOptions">Selected options: {selectedProfileCount}</div>
              ) : null}
            </div>
          </div>

          <aside className="nwHeroAside">
            <div className="nwCard nwInsightPanel">
              <div className="nwInsightEyebrow">Why NeighbourWise</div>
              <h2 className="nwInsightTitle">
                A clearer starting point before you choose where to live
              </h2>

              <div className="nwInsightList">
                <div className="nwInsightItem">
                  <div className="nwInsightDot" aria-hidden="true" />
                  <div>
                    <div className="nwInsightItemTitle">Start with an unfamiliar suburb</div>
                    <p className="nwInsightItemText">
                      Search a Melbourne suburb or address and begin with a clear place to explore.
                    </p>
                  </div>
                </div>

                <div className="nwInsightItem">
                  <div className="nwInsightDot" aria-hidden="true" />
                  <div>
                    <div className="nwInsightItemTitle">See the broader neighbourhood</div>
                    <p className="nwInsightItemText">
                      Move beyond a single map pin and understand the surrounding local area.
                    </p>
                  </div>
                </div>

                <div className="nwInsightItem">
                  <div className="nwInsightDot" aria-hidden="true" />
                  <div>
                    <div className="nwInsightItemTitle">Judge local suitability earlier</div>
                    <p className="nwInsightItemText">
                      Use neighbourhood context before relying only on listings, prices, or
                      directions.
                    </p>
                  </div>
                </div>
              </div>

              <div className="nwChipRow" aria-label="Platform highlights">
                <span className="nwChip">Map-based view</span>
                <span className="nwChip">Neighbourhood context</span>
                <span className="nwChip">Better decision support</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="nwFeatureSection" aria-labelledby="nw-feature-heading">
        <div className="nwFeatureIntro">
          <div className="nwFeatureEyebrow">How it helps</div>
          <h2 id="nw-feature-heading" className="nwFeatureHeading">
            Built for renters and first-time movers exploring unfamiliar suburbs
          </h2>
        </div>

        <div className="nwFeatureGrid">
          <article className="nwFeatureCard">
            <div className="nwFeatureIcon" aria-hidden="true">
              01
            </div>
            <h3 className="nwFeatureTitle">Explore a location</h3>
            <p className="nwFeatureText">
              Search a Melbourne suburb or address and begin with a clear starting point.
            </p>
          </article>

          <article className="nwFeatureCard">
            <div className="nwFeatureIcon" aria-hidden="true">
              02
            </div>
            <h3 className="nwFeatureTitle">Understand the neighbourhood</h3>
            <p className="nwFeatureText">
              View the surrounding area and local context on a map, not just one point.
            </p>
          </article>

          <article className="nwFeatureCard">
            <div className="nwFeatureIcon" aria-hidden="true">
              03
            </div>
            <h3 className="nwFeatureTitle">Compare before you decide</h3>
            <p className="nwFeatureText">
              Build a more informed housing decision by understanding which area may suit you
              better.
            </p>
          </article>
        </div>
      </section>
    </div>
  )
}