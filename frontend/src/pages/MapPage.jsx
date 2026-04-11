import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ScoreBar from '../components/ScoreBar.jsx'
import NeighbourMap from '../components/NeighbourMap.jsx'
import Button from '../components/buttons/Button.jsx'
import { getMapContext, getLocalityPolygon, getPoiInsights } from '../services/api.js'
import { addToCompareList, loadCompareList, loadContext, saveContext } from '../utils/storage.js'

const CATEGORY_KEYS = ['accessibility', 'safety', 'environment']

function asSafeNumber(n, fallback) {
  return Number.isFinite(n) ? n : fallback
}

function getDisplayLocationName(selectedLocation) {
  if (!selectedLocation) return ''
  return (
    selectedLocation.displayName ||
    selectedLocation.fullAddress ||
    selectedLocation.name ||
    ''
  )
}

export default function MapPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mapData, setMapData] = useState(null)
  const [suburbPolygon, setSuburbPolygon] = useState(null)
  const [rangeMinutes, setRangeMinutes] = useState(20)
  const [compareHint, setCompareHint] = useState('')
  const [poiData, setPoiData] = useState([])

  const context = useMemo(() => {
    const stateCtx = location.state
    const stored = loadContext()
    const merged = stateCtx || stored
    return merged || null
  }, [location.state])

  const selectedLocation = context?.selectedLocation
  const locationName = getDisplayLocationName(selectedLocation)
  const profile = context?.profile
  const isSuburb = selectedLocation?.type === 'suburb'
  const isAddress = selectedLocation?.type === 'address'

  useEffect(() => {
    if (!context || !selectedLocation || !profile) {
      setError('Missing selected location. Please start from Home.')
      setLoading(false)
      return
    }

    setRangeMinutes(asSafeNumber(context.rangeMinutes, 20))
  }, [context, selectedLocation, profile])

  useEffect(() => {
    if (!context || !selectedLocation || !profile) return

    let cancelled = false

    setLoading(true)
    setError('')

    saveContext({ selectedLocation, profile, rangeMinutes })

    const mapContextPromise = getMapContext({
      locationName:
        selectedLocation.displayName ||
        selectedLocation.fullAddress ||
        selectedLocation.name,
      rangeMinutes,
      profile,
    })

    const polygonPromise = isSuburb
      ? getLocalityPolygon(selectedLocation.name)
      : Promise.resolve(null)

    const poiPromise = getPoiInsights({
      lat: Number(selectedLocation.lat),
      lng: Number(selectedLocation.lng),
      time: Number(rangeMinutes),
    })

    Promise.all([mapContextPromise, polygonPromise, poiPromise])
      .then(([data, polygon, poiResponse]) => {
        if (cancelled) return

        setMapData(data)
        setSuburbPolygon(polygon)
        setPoiData(poiResponse?.results || [])

        console.log('poiResponse:', poiResponse)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('MapPage load error:', err)
        setError(
          isAddress
            ? 'Failed to load address map data.'
            : 'Failed to load suburb map data.'
        )
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [context, selectedLocation, profile, rangeMinutes, isSuburb, isAddress])

  if (error) {
    return (
      <div className="nwPage">
        <h1 className="nwPageTitle">Map</h1>
        <div className="nwError">{error}</div>
        <div className="nwBtnRow">
          <Button variant="primary" onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </div>
      </div>
    )
  }

  console.log('selectedLocation:', selectedLocation)
  console.log('rangeMinutes:', rangeMinutes)
  console.log('poiData:', poiData)

  return (
    <div className="nwPage">
      <h1 className="nwPageTitle" style={{ marginBottom: 6 }}>
        Neighbourhood liveability map
      </h1>

      <p className="nwSubtitle" style={{ marginBottom: 18 }}>
        Selected: {String(locationName || '')}
      </p>

      <div className="nwMapLayout">
        <section className="nwMapLeft">
          {loading ? <div className="nwLoading">Loading map...</div> : null}

          <NeighbourMap
            coordinates={
              selectedLocation
                ? { lat: selectedLocation.lat, lng: selectedLocation.lng }
                : mapData?.coordinates
            }
            radiusMeters={mapData?.radiusMeters}
            pointsOfInterest={poiData}
            suburbPolygon={isSuburb ? suburbPolygon : null}
            selectedLabel={locationName}
          />
        </section>

        <aside className="nwMapRight">
          <div className="nwCard" style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 900, color: 'var(--text-h)' }}>
              Range selection
            </div>

            <div className="nwRangeButtons" role="radiogroup" aria-label="Range minutes">
              {[10, 20, 30].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`nwRangeBtn ${rangeMinutes === m ? 'nwRangeBtnActive' : ''}`}
                  onClick={() => setRangeMinutes(m)}
                  aria-checked={rangeMinutes === m}
                >
                  {m} minutes
                </button>
              ))}
            </div>

            <div className="nwScoreStack">
              <div>
                <div style={{ fontWeight: 900, color: 'var(--text-h)' }}>
                  Overall liveability
                </div>
                <div className="nwOverallScore">
                  {mapData ? mapData.overallScore : '-'} / 100
                </div>
              </div>

              {CATEGORY_KEYS.map((k) => (
                <ScoreBar key={k} category={k} score={mapData?.scores?.[k]} outOf={100} />
              ))}
            </div>

            <div className="nwBtnRow">
              <Button
                variant="secondary"
                onClick={() => {
                  const list = addToCompareList({
                    selectedLocation,
                    profile,
                    rangeMinutes,
                  })
                  setCompareHint(`Added to compare (${list.length}/2).`)
                }}
              >
                Add to Compare
              </Button>

              <Button
                variant="primary"
                onClick={() => {
                  saveContext({ selectedLocation, profile, rangeMinutes })
                  navigate('/insights', {
                    state: { selectedLocation, profile, rangeMinutes },
                  })
                }}
              >
                View Details
              </Button>

              <Button
                variant="secondary"
                onClick={() => {
                  const count = loadCompareList().length
                  if (count < 2) {
                    setCompareHint('Please add two areas before opening Compare.')
                    return
                  }
                  navigate('/compare')
                }}
              >
                Compare Areas
              </Button>
            </div>

            {compareHint ? (
              <div style={{ marginTop: 10, color: 'var(--text)' }}>{compareHint}</div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}