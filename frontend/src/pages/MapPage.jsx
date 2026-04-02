import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ScoreBar from '../components/ScoreBar.jsx'
import NeighbourMap from '../components/NeighbourMap.jsx'
import Button from '../components/buttons/Button.jsx'
import { getMapContext } from '../services/api.js'
import { addToCompareList, loadCompareList, loadContext, saveContext } from '../utils/storage.js'

const CATEGORY_KEYS = ['accessibility', 'safety', 'environment']

function asSafeNumber(n, fallback) {
  return Number.isFinite(n) ? n : fallback
}

export default function MapPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mapData, setMapData] = useState(null)
  const [rangeMinutes, setRangeMinutes] = useState(20)
  const [compareHint, setCompareHint] = useState('')

  const context = useMemo(() => {
    // Prefer route state for immediate transitions; fall back to saved localStorage.
    const stateCtx = location.state
    const stored = loadContext()
    const merged = stateCtx || stored
    return merged || null
  }, [location.state])

  const locationName = context?.locationName
  const profile = context?.profile

  useEffect(() => {
    if (!context || !locationName || !profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('Missing selected location. Please start from Home.')
      setLoading(false)
      return
    }

    setRangeMinutes(asSafeNumber(context.rangeMinutes, 20))
  }, [context, locationName, profile])

  useEffect(() => {
    if (!context || !locationName || !profile) return

    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError('')

    saveContext({ locationName, profile, rangeMinutes })

    getMapContext({ locationName, rangeMinutes, profile })
      .then((data) => {
        if (cancelled) return
        setMapData(data)
      })
      .catch(() => {
        if (cancelled) return
        setError('Failed to load map data (using mock data right now).')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [context, locationName, profile, rangeMinutes])

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
            coordinates={mapData?.coordinates}
            radiusMeters={mapData?.radiusMeters}
            pointsOfInterest={mapData?.pointsOfInterest}
          />
        </section>

        <aside className="nwMapRight">
          <div className="nwCard" style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 900, color: 'var(--text-h)' }}>Range selection</div>
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
                <div style={{ fontWeight: 900, color: 'var(--text-h)' }}>Overall liveability</div>
                <div className="nwOverallScore">
                  {mapData ? mapData.overallScore : '—'} / 100
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
                  const list = addToCompareList({ locationName, profile, rangeMinutes })
                  setCompareHint(`Added to compare (${list.length}/2).`)
                }}
              >
                Add to Compare
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  saveContext({ locationName, profile, rangeMinutes })
                  navigate('/insights', { state: { locationName, profile, rangeMinutes } })
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

