import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import {
  searchAddresses,
  searchLocalities,
  validateSearchInput,
} from '../services/api.js'
import { saveContext } from '../utils/storage.js'
import heroImage from '../assets/bg.png'
import familyIcon from '../assets/family.png'
import elderlyIcon from '../assets/elderly.png'
import petIcon from '../assets/pet.png'

const PROFILE_INFO = {
  familyWithChildren: {
    title: 'Family with children',
    description: 'Focus on a suburb that feels practical for family living and daily convenience.',
    icon: familyIcon,
  },
  elderly: {
    title: 'Elderly',
    description: 'Explore areas with a clearer sense of comfort, access, and local suitability.',
    icon: elderlyIcon,
  },
  petOwner: {
    title: 'Pet owner',
    description: 'Consider neighbourhoods that may better support pet-friendly daily living.',
    icon: petIcon,
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
      selectedLocation?.displayName ||
      selectedLocation?.fullAddress ||
      selectedLocation?.name ||
      ''

    if (selectedLocation && query === selectedText) {
      setSuburbResults([])
      setAddressResults([])
      setSearching(false)
      return
    }

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
    const label =
      location.displayName || location.fullAddress || location.name || ''

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
    <>

      {/* HERO SECTION */}
      <section
        className="hero"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="overlay"></div>

        <div className="hero-content">
          <h1>Find the right place to live</h1>
          <p>Explore Melbourne neighbourhoods with data-backed insights</p>

          {/* SEARCH CARD */}
          <div className="search-card">
            <h4 className="section-title">Search</h4>

            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter suburb or address"
            />

            {error && <div className="error">{error}</div>}

            {hasResults && (
              <div className="dropdown">
                {[...suburbResults, ...addressResults].map((item, i) => (
                  <div
                    key={i}
                    onClick={() => onSelectLocation(item)}
                    className="dropdown-item"
                  >
                    {item.displayName || item.fullAddress || item.name}
                  </div>
                ))}
              </div>
            )}

            <h4 className="section-title">Your situation</h4>

            <div className="situation-row">
              {Object.entries(PROFILE_INFO).map(([key, info]) => (
                <div
                  key={key}
                  className={`situation-card ${profile[key] ? 'active' : ''}`}
                  onClick={() => toggleProfile(key, !profile[key])}
                >
                  <div className="icon">
                    <img src={info.icon} alt="" />
                  </div>

                  <h5>{info.title}</h5>
                  <p className="situation-desc">{info.description}</p>
                  <div className="checkbox">
                    {profile[key] && "✔"}
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={onSubmit} className="cta">
              Check Liveability
            </Button>
          </div>
        </div>
      </section>

      {/* WHY SECTION*/}
      <section className="why">
        <div className="why-item">
          <div className="why-icon">🗺️</div>
          <h4>Map-based insights</h4>
          <p>View neighbourhood data clearly</p>
        </div>

        <div className="why-item">
          <div className="why-icon">📊</div>
          <h4>Data-driven scores</h4>
          <p>Understand liveability instantly</p>
        </div>

        <div className="why-item">
          <div className="why-icon">⚖️</div>
          <h4>Compare areas</h4>
          <p>Make better decisions faster</p>
        </div>
      </section>

    </>
  )
}