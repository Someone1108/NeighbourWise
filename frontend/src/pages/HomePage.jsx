import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import {
  searchAddresses,
  searchLocalities,
  validateSearchInput,
} from '../services/api.js'
import { saveContext } from '../utils/storage.js'

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
      <h1 className="nwPageTitle">Find the right place to live</h1>
      <p className="nwSubtitle">Based on real neighbourhood data</p>

      <div className="nwCard" style={{ textAlign: 'left' }}>
        <div className="nwFormRow">
          <label style={{ fontWeight: 800 }}>Search</label>
          <input
            className="nwInput"
            placeholder="Enter suburb or address"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              setError('')
            }}
            aria-label="Search suburb or address"
          />

          {searching ? (
            <div style={{ marginTop: 8, color: 'var(--text)' }}>Searching...</div>
          ) : null}

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
                  <div style={{ fontWeight: 700 }}>{result.displayName || result.name}</div>
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
                {selectedLocation.displayName || selectedLocation.fullAddress || selectedLocation.name}
              </strong>
            </div>
          ) : null}
        </div>

        <div className="nwFormRow" style={{ marginTop: 6 }}>
          <label style={{ fontWeight: 800 }}>Your situation</label>
          <div className="nwCheckGroup">
            <label className="nwCheckbox">
              <input
                type="checkbox"
                checked={profile.familyWithChildren}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, familyWithChildren: e.target.checked }))
                }
              />
              Family with children
            </label>

            <label className="nwCheckbox">
              <input
                type="checkbox"
                checked={profile.elderly}
                onChange={(e) => setProfile((p) => ({ ...p, elderly: e.target.checked }))}
              />
              Elderly
            </label>

            <label className="nwCheckbox">
              <input
                type="checkbox"
                checked={profile.petOwner}
                onChange={(e) => setProfile((p) => ({ ...p, petOwner: e.target.checked }))}
              />
              Pet owner
            </label>
          </div>
        </div>

        {error ? <div className="nwError">{error}</div> : null}

        <div className="nwBtnRow">
          <Button variant="primary" onClick={onSubmit}>
            Check Liveability
          </Button>
        </div>

        <div style={{ marginTop: 14, color: 'var(--text)', textAlign: 'left' }}>
          Your data is protected
          {selectedProfileCount ? (
            <span style={{ display: 'block', marginTop: 8 }}>
              Selected options: {selectedProfileCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}