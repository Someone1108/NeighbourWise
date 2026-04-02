import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import { getInsights } from '../services/api.js'
import { loadContext, saveContext } from '../utils/storage.js'

const CATEGORY_KEYS = ['accessibility', 'safety', 'environment']

export default function InsightsPage() {
  const navigate = useNavigate()

  const context = useMemo(() => {
    // Insights is usually reached from Map, but we keep it resilient.
    const stored = loadContext()
    return stored
  }, [])

  const [activeCategory, setActiveCategory] = useState('accessibility')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  const locationName = context?.locationName
  const profile = context?.profile
  const rangeMinutes = context?.rangeMinutes || 20

  useEffect(() => {
    if (!context || !locationName || !profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('Missing context. Please start from Home.')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    saveContext({ locationName, profile, rangeMinutes })

    getInsights({ locationName, rangeMinutes, profile, category: activeCategory })
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch(() => {
        if (cancelled) return
        setError('Failed to load details (using mock data right now).')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [context, locationName, profile, rangeMinutes, activeCategory])

  const categoryLabel = (key) => {
    const m = { accessibility: 'Accessibility', safety: 'Safety', environment: 'Environment' }
    return m[key] || key
  }

  return (
    <div className="nwPage">
      <h1 className="nwPageTitle" style={{ marginBottom: 6 }}>
        Breakdown
      </h1>
      <p className="nwSubtitle" style={{ marginBottom: 18 }}>
        {String(locationName || '')} - {rangeMinutes} minutes
      </p>

      {error ? (
        <div className="nwError">{error}</div>
      ) : (
        <div className="nwCard" style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 900, color: 'var(--text-h)' }}>Category</div>
          <div className="nwTabs" role="tablist" aria-label="Category tabs">
            {CATEGORY_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={`nwTabBtn ${activeCategory === k ? 'nwTabBtnActive' : ''}`}
                onClick={() => setActiveCategory(k)}
                role="tab"
                aria-selected={activeCategory === k}
              >
                {categoryLabel(k)}
              </button>
            ))}
          </div>

          {loading ? <div className="nwLoading">Loading factors...</div> : null}

          {!loading && data ? (
            <>
              <div className="nwFactors">
                {data.factors.map((f) => (
                  <div className="nwFactorItem" key={f.name}>
                    <div
                      className={`nwFactorIcon ${
                        f.met ? 'nwFactorIconMet' : 'nwFactorIconNotMet'
                      }`}
                    >
                      {f.met ? 'OK' : 'NO'}
                    </div>
                    <div style={{ fontWeight: 800 }}>{f.name}</div>
                  </div>
                ))}
              </div>

              <div className="nwKeyExplain">
                <h2 style={{ margin: '18px 0 10px' }}>Score explanation</h2>
                <div>{data.scoreExplanation}</div>
              </div>
            </>
          ) : null}

          <div className="nwBackRow">
            <Button variant="secondary" onClick={() => navigate('/map')}>
              Back to Map
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

