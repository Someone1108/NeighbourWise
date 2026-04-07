import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import { searchLocalities, validateSearchInput } from '../services/api.js'
import { saveContext } from '../utils/storage.js'

export default function HomePage() {
  const navigate = useNavigate()

  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  const [searchResults, setSearchResults] = useState([])
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

    if (selectedLocation && query !== selectedLocation.name) {
      setSelectedLocation(null)
    }

    if (query.length < 3) {
      setSearchResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

    const timer = setTimeout(() => {
      searchLocalities(query)
        .then((results) => {
          if (cancelled) return
          setSearchResults(Array.isArray(results) ? results : [])
        })
        .catch(() => {
          if (cancelled) return
          setSearchResults([])
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
    setSelectedLocation(location)
    setAddress(location.name)
    setSearchResults([])
    setError('')
  }

  function onSubmit() {
    const v = validateSearchInput(address)
    if (!v.ok) {
      setError(v.message)
      return
    }

    if (!selectedLocation) {
      setError('Please select a suburb from the search results.')
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

  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">Find the right place to live</h1>
      <p className="nwSubtitle">Based on real neighbourhood data</p>

      <div className="nwCard" style={{ textAlign: 'left' }}>
        <div className="nwFormRow">
          <label style={{ fontWeight: 800 }}>Search</label>
          <input
            className="nwInput"
            placeholder="Enter suburb"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              setError('')
            }}
            aria-label="Search suburb"
          />

          {searching ? (
            <div style={{ marginTop: 8, color: 'var(--text)' }}>Searching...</div>
          ) : null}

          {!searching && searchResults.length > 0 ? (
            <div
              style={{
                marginTop: 10,
                border: '1px solid #ddd',
                borderRadius: 10,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => onSelectLocation(result)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    border: 'none',
                    borderBottom: '1px solid #eee',
                    background: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{result.name}</div>
                  <div style={{ fontSize: 13, color: '#666' }}>{result.state}</div>
                </button>
              ))}
            </div>
          ) : null}

          {!searching &&
          address.trim().length >= 3 &&
          searchResults.length === 0 &&
          !selectedLocation ? (
            <div style={{ marginTop: 8, color: 'var(--text)' }}>
              No matching suburb found.
            </div>
          ) : null}

          {selectedLocation ? (
            <div style={{ marginTop: 10, color: 'var(--text)' }}>
              Selected suburb: <strong>{selectedLocation.name}</strong>
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