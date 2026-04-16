import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ScoreBar from '../components/ScoreBar.jsx'
import NeighbourMap from '../components/NeighbourMap.jsx'
import Button from '../components/buttons/Button.jsx'
import {
  getMapContext,
  getLocalityPolygon,
  getPoiInsights,
  getLayerDataForSuburb,
  getLayerDataForAddress,
} from '../services/api.js'
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
  const [showInsights, setShowInsights] = useState(true)
  const [activeLayer, setActiveLayer] = useState('none')
  const [layerData, setLayerData] = useState(null)

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

    Promise.all([
      mapContextPromise,
      polygonPromise,
      poiPromise,
      isSuburb
        ? getLayerDataForSuburb(selectedLocation.name)
        : isAddress
          ? getLayerDataForAddress(
              selectedLocation.lat,
              selectedLocation.lng,
              rangeMinutes
            )
          : Promise.resolve(null),
    ])
      .then(([data, polygon, poiResponse, layers]) => {
        if (cancelled) return

        setMapData(data)
        setSuburbPolygon(polygon)
        setPoiData(poiResponse?.results || [])
        console.log('poiResponse:', poiResponse)
        setLayerData(layers)
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
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0 12px', marginBottom: 18 }}>
        <h1 className="nwPageTitle" style={{ marginBottom: 0 }}>
          {String(locationName || 'Neighbourhood Map')}
        </h1>
        <span style={{ fontSize: 15, color: 'var(--muted-dark)', fontWeight: 500 }}>
          Liveability Map
        </span>
      </div>

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
            pointsOfInterest={showInsights ? poiData : []}
            suburbPolygon={isSuburb ? suburbPolygon : null}
            selectedLabel={locationName}
            heatLayer={activeLayer === 'heat' ? layerData?.heat : null}
            vegetationLayer={activeLayer === 'vegetation' ? layerData?.vegetation : null}
            zoningLayer={activeLayer === 'zoning' ? layerData?.zoning : null}
          />
        </section>

        <aside className="nwMapRight">
          <div className="nwCard" style={{ textAlign: 'left' }}>

            {/* LIVEABILITY SCORE (top, most prominent)  */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-2)', marginBottom: 2 }}>
                Liveability Score
              </div>
              <div className="nwOverallScore" style={{ marginBottom: 10 }}>
                {mapData ? mapData.overallScore : '-'} / 100
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CATEGORY_KEYS.map((k) => (
                  <ScoreBar key={k} category={k} score={mapData?.scores?.[k]} outOf={100} />
                ))}
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '16px 0' }} />

            {/* COMPACT CONTROLS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Travel Time */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-dark)', marginBottom: 7 }}>
                  Travel Time
                </div>
                <div style={{ display: 'flex', gap: 6 }} role="radiogroup" aria-label="Travel time in minutes">
                  {[10, 20, 30].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`nwRangeBtn ${rangeMinutes === m ? 'nwRangeBtnActive' : ''}`}
                      style={{ flex: 1, padding: '8px 4px', fontSize: 13, margin: 0 }}
                      onClick={() => setRangeMinutes(m)}
                      aria-checked={rangeMinutes === m}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Nearby Places */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-dark)', marginBottom: 7 }}>
                  Nearby Places
                </div>
                <div style={{ display: 'flex', gap: 6 }} role="radiogroup" aria-label="Show or hide nearby places">
                  <button
                    type="button"
                    className={`nwRangeBtn ${showInsights ? 'nwRangeBtnActive' : ''}`}
                    style={{ flex: 1, padding: '8px 4px', fontSize: 13, margin: 0 }}
                    onClick={() => setShowInsights(true)}
                    aria-checked={showInsights}
                  >
                    Show
                  </button>
                  <button
                    type="button"
                    className={`nwRangeBtn ${!showInsights ? 'nwRangeBtnActive' : ''}`}
                    style={{ flex: 1, padding: '8px 4px', fontSize: 13, margin: 0 }}
                    onClick={() => setShowInsights(false)}
                    aria-checked={!showInsights}
                  >
                    Hide
                  </button>
                </div>
              </div>

              {/* Map Layer */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-dark)', marginBottom: 7 }}>
                  Map Layer
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { key: 'none', label: 'Default' },
                    { key: 'heat', label: '🌡 Heat' },
                    { key: 'vegetation', label: '🌿 Green' },
                    { key: 'zoning', label: '🏙 Zoning' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={`nwRangeBtn ${activeLayer === key ? 'nwRangeBtnActive' : ''}`}
                      style={{ padding: '8px 4px', fontSize: 13, margin: 0, textAlign: 'center' }}
                      onClick={() => setActiveLayer(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS  */}
            <div className="nwBtnRow" style={{ marginTop: 16 }}>
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
                  const compareItem = {
                    locationName: locationName,
                    displayName:
                      selectedLocation?.displayName ||
                      selectedLocation?.fullAddress ||
                      selectedLocation?.name ||
                      '',
                    fullAddress: selectedLocation?.fullAddress || '',
                    name: selectedLocation?.name || '',
                    type: selectedLocation?.type || 'suburb',
                    lat: selectedLocation?.lat,
                    lng: selectedLocation?.lng,
                    profile,
                    rangeMinutes,
                    selectedLocation,
                  }

                  const list = addToCompareList(compareItem)
                  setCompareHint(`Added to compare (${list.length}/2).`)
                  navigate('/compare')
                }}
              >
                Add to Compare
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
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted-dark)' }}>
                {compareHint}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}