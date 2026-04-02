import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import { getMapContext } from '../services/api.js'
import {
  clearCompareList,
  loadCompareList,
  removeFromCompareList,
} from '../utils/storage.js'

const CATEGORY_KEYS = ['accessibility', 'safety', 'environment']

function safeRangeMinutes(value) {
  const n = Number(value)
  if ([10, 20, 30].includes(n)) return n
  return 20
}

function labelForCategory(key) {
  const map = { accessibility: 'Accessibility', safety: 'Safety', environment: 'Environment' }
  return map[key] || key
}

function miniProgress(score, outOf = 100) {
  const s = Number.isFinite(score) ? score : 0
  const o = Number.isFinite(outOf) && outOf > 0 ? outOf : 100
  const percent = Math.max(0, Math.min(100, (s / o) * 100))
  return (
    <div className="nwProgressOuter" style={{ height: 8, marginTop: 6 }}>
      <div className="nwProgressInner" style={{ width: `${percent}%`, height: '100%' }} />
    </div>
  )
}

export default function ComparePage() {
  const navigate = useNavigate()

  const [compareList, setCompareList] = useState(() => loadCompareList())

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    if (compareList.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHint('No area is selected yet. Please add two areas to compare.')
      setError('')
      setData(null)
      setLoading(false)
      return
    }

    if (compareList.length === 1) {
      setHint(`"${compareList[0].locationName}" is kept. Please add one more area.`)
      setError('')
      setData(null)
      setLoading(false)
      return
    }

    const [a1, a2] = compareList
    const range1 = safeRangeMinutes(a1.rangeMinutes)
    const range2 = safeRangeMinutes(a2.rangeMinutes)
    let cancelled = false
    setLoading(true)
    setError('')
    setHint('')

    Promise.all([
      getMapContext({
        locationName: a1.locationName,
        rangeMinutes: range1,
        profile: a1.profile || {},
      }),
      getMapContext({
        locationName: a2.locationName,
        rangeMinutes: range2,
        profile: a2.profile || {},
      }),
    ])
      .then(([r1, r2]) => {
        if (cancelled) return
        const scores = {
          accessibility: [r1.scores.accessibility, r2.scores.accessibility],
          safety: [r1.scores.safety, r2.scores.safety],
          environment: [r1.scores.environment, r2.scores.environment],
        }

        const deltas = [
          { key: 'accessibility', delta: scores.accessibility[0] - scores.accessibility[1] },
          { key: 'safety', delta: scores.safety[0] - scores.safety[1] },
          { key: 'environment', delta: scores.environment[0] - scores.environment[1] },
        ]
        deltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
        const top = deltas[0]
        let recommendation = 'Both areas are closely matched.'
        if (top.delta > 0) {
          recommendation = `${a1.locationName} is better for ${labelForCategory(top.key).toLowerCase()}.`
        } else if (top.delta < 0) {
          recommendation = `${a2.locationName} is better for ${labelForCategory(top.key).toLowerCase()}.`
        }

        setData({
          area1: a1.locationName,
          area2: a2.locationName,
          range1,
          range2,
          scores,
          recommendation,
        })
      })
      .catch(() => {
        if (cancelled) return
        setError('Failed to load comparison data.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [compareList])

  function removeArea(locationName) {
    const next = removeFromCompareList(locationName)
    setCompareList(next)
  }

  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">Compare Areas</h1>
      <p className="nwSubtitle" style={{ marginBottom: 16 }}>
        {loading
          ? 'Loading...'
          : data
            ? `${data.area1} (${data.range1} min) vs ${data.area2} (${data.range2} min)`
            : 'Awaiting two selected areas'}
      </p>

      <div className="nwCard" style={{ textAlign: 'left' }}>
        {loading ? <div className="nwLoading">Loading comparison...</div> : null}
        {!loading && hint ? <div className="nwSubtitle">{hint}</div> : null}
        {!loading && error ? <div className="nwError">{error}</div> : null}

        {!loading && data ? (
          <>
            <table className="nwCompareTable" aria-label="Comparison table">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Category</th>
                  <th>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{data.area1}</span>
                      <span style={{ color: 'var(--text)', fontSize: 12 }}>
                        ({data.range1} min)
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => removeArea(data.area1)}
                        style={{ padding: '4px 8px', fontSize: 12 }}
                      >
                        Remove
                      </Button>
                    </div>
                  </th>
                  <th>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{data.area2}</span>
                      <span style={{ color: 'var(--text)', fontSize: 12 }}>
                        ({data.range2} min)
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => removeArea(data.area2)}
                        style={{ padding: '4px 8px', fontSize: 12 }}
                      >
                        Remove
                      </Button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_KEYS.map((k) => (
                  <tr key={k}>
                    <td className="nwCompareRowTitle">{labelForCategory(k)}</td>
                    <td>
                      <div style={{ fontWeight: 900, color: 'var(--text-h)' }}>
                        {data.scores?.[k]?.[0] ?? '—'} / 100
                      </div>
                      {miniProgress(data.scores?.[k]?.[0])}
                    </td>
                    <td>
                      <div style={{ fontWeight: 900, color: 'var(--text-h)' }}>
                        {data.scores?.[k]?.[1] ?? '—'} / 100
                      </div>
                      {miniProgress(data.scores?.[k]?.[1])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 16, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 900, color: 'var(--text-h)' }}>Recommendation</div>
              <div>{data.recommendation}</div>
            </div>

            <div className="nwBackRow">
              <Button variant="secondary" onClick={() => navigate('/map')}>
                Back to Results
              </Button>
              <Button
                variant="secondary"
                style={{ marginLeft: 10 }}
                onClick={() => {
                  clearCompareList()
                  navigate('/map')
                }}
              >
                Clear Compare List
              </Button>
            </div>
          </>
        ) : null}

        <div className="nwBtnRow" style={{ marginTop: 14 }}>
          <Button variant="primary" onClick={() => navigate('/')}>
            Back to Home
          </Button>
          <Button variant="secondary" onClick={() => navigate('/map')}>
            Go to Map
          </Button>
        </div>
      </div>
    </div>
  )
}

