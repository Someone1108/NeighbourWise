import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import { getInsights, getMapContext } from '../services/api.js'
import { loadContext } from '../utils/storage.js'

const CATEGORIES = ['accessibility', 'safety', 'environment']

const CATEGORY_CONFIG = {
  accessibility: {
    label: 'Accessibility',
    color: '#2a9d8f',
    description: 'Transit links, walkability, and essential services',
    weight: 35,
    sources: 'GTFS + OpenStreetMap',
  },
  safety: {
    label: 'Safety',
    color: '#1f9d68',
    description: 'Crime rates, street lighting, and pedestrian infrastructure',
    weight: 35,
    sources: 'Crime Statistics VIC + VicPlan',
  },
  environment: {
    label: 'Environment',
    color: '#f47c20',
    description: 'Green space, air quality, and urban heat exposure',
    weight: 30,
    sources: 'Urban Heat Islands + EPA AirWatch',
  },
}

function getScoreBand(score) {
  if (score >= 80) return { label: 'Excellent', color: '#1f9d68', bg: 'rgba(31,157,104,0.08)',  border: 'rgba(31,157,104,0.22)' }
  if (score >= 65) return { label: 'Good',      color: '#2a9d8f', bg: 'rgba(42,157,143,0.08)',  border: 'rgba(42,157,143,0.22)' }
  if (score >= 50) return { label: 'Moderate',  color: '#f47c20', bg: 'rgba(244,124,32,0.08)',  border: 'rgba(244,124,32,0.22)' }
  return                  { label: 'Low',        color: '#c53b3b', bg: 'rgba(197,59,59,0.08)',   border: 'rgba(197,59,59,0.22)' }
}

function getProfileLabel(profile) {
  if (!profile) return null
  if (profile.familyWithChildren) return 'Family'
  if (profile.elderly) return 'Elderly'
  if (profile.petOwner) return 'Pet Owner'
  return null
}

function buildInterpretation(scores, locationName) {
  const sorted = CATEGORIES.map((k) => [k, scores[k]]).sort(([, a], [, b]) => a - b)
  const [worstKey, worstScore] = sorted[0]
  const [bestKey, bestScore] = sorted[sorted.length - 1]
  const bestLabel = CATEGORY_CONFIG[bestKey].label.toLowerCase()

  const specific = {
    environment:   `A score of ${worstScore}/100 for environment suggests ${locationName} may have limited green space, elevated urban heat, or air quality concerns — worth factoring in before committing.`,
    accessibility: `A score of ${worstScore}/100 for accessibility indicates that public transport, walkability, or proximity to services like supermarkets and healthcare may be below average for ${locationName}.`,
    safety:        `A score of ${worstScore}/100 for safety reflects higher recorded incident rates or limited street infrastructure in ${locationName}. Reviewing local crime statistics directly is worthwhile.`,
  }

  return `${specific[worstKey]} On the other hand, ${locationName} performs well on ${bestLabel} (${bestScore}/100). These scores are currently based on illustrative data and will reflect live datasets in the final product.`
}

export default function InsightsPage() {
  const navigate = useNavigate()
  const routerLocation = useLocation()

  const context = useMemo(() => routerLocation.state || loadContext() || null, [routerLocation.state])

  const selectedLocation = context?.selectedLocation

  const locationName =
    selectedLocation?.displayName ||
    selectedLocation?.fullAddress ||
    selectedLocation?.name ||
    ''

  const profile = context?.profile
  const rangeMinutes = context?.rangeMinutes || 20
  const profileLabel = getProfileLabel(profile)

  const [overallScore, setOverallScore] = useState(null)
  const [scores, setScores] = useState(null)
  const [indicators, setIndicators] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!locationName) {
      setLoading(false)
      return
    }

    setLoading(true)
    let cancelled = false

    const scoreP = getMapContext({ locationName, rangeMinutes, profile })
    const indicatorPs = CATEGORIES.map((cat) =>
      getInsights({ locationName, rangeMinutes, profile, category: cat }).then((res) => [cat, res])
    )

    Promise.all([scoreP, ...indicatorPs])
      .then(([mapData, ...pairs]) => {
        if (cancelled) return
        setOverallScore(mapData.overallScore)
        setScores(mapData.scores)
        const map = {}
        pairs.forEach(([cat, res]) => { map[cat] = res })
        setIndicators(map)
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [locationName, rangeMinutes, profile])

  if (!locationName) {
    return (
      <div className="nwPage" style={{ textAlign: 'center', paddingTop: 60 }}>
        <h2 style={{ fontFamily: 'var(--heading)', fontSize: '1.4rem', color: 'var(--text-h)', marginBottom: 8 }}>
          No suburb selected
        </h2>
        <p style={{ fontSize: '0.95rem', color: 'var(--muted-dark)', marginBottom: 24 }}>
          Search for a suburb or address from the home page first.
        </p>
        <Button variant="primary" onClick={() => navigate('/')}>Back to Home</Button>
      </div>
    )
  }

  const band = overallScore != null ? getScoreBand(overallScore) : null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 64 }}>

      {/* Sticky sub-header */}
      <nav
        aria-label="Page navigation"
        style={{
          position: 'sticky',
          top: 64,
          zIndex: 50,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-light)',
          padding: '10px 40px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          onClick={() => navigate('/map')}
          aria-label="Go back to map"
          style={{
            background: 'none',
            border: '1px solid var(--border-light)',
            borderRadius: 10,
            padding: '6px 12px',
            cursor: 'pointer',
            color: 'var(--text-dark)',
            fontWeight: 700,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'inherit',
          }}
        >
          ← Map
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-h)', fontSize: '0.9rem', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {locationName}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted-dark)', marginTop: 2 }}>
            Liveability breakdown · {rangeMinutes} min range{profileLabel && ` · Scored for: ${profileLabel}`}
          </div>
        </div>
        {band && !loading && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              background: band.bg,
              color: band.color,
              fontWeight: 800,
              fontSize: '0.72rem',
              border: `1px solid ${band.border}`,
              borderRadius: 999,
              flexShrink: 0,
            }}
            aria-label={`Overall liveability rating: ${band.label}`}
          >
            {band.label}
          </span>
        )}
      </nav>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 40px 0' }}>

        {/* Hero score card */}
        <div
          className="nwCard"
          style={{
            marginBottom: 20,
            textAlign: 'center',
            background: band && !loading
              ? `linear-gradient(135deg, ${band.bg} 0%, #ffffff 55%)`
              : '#ffffff',
            borderColor: band && !loading ? band.border : 'var(--border-light)',
            transition: 'background 0.4s ease, border-color 0.4s ease',
            padding: '36px 40px',
          }}
        >
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted-dark)', marginBottom: 4 }}>
            {locationName}
          </div>
          <div style={{ fontFamily: 'var(--heading)', fontSize: '1.15rem', color: 'var(--text-h)', marginBottom: 20 }}>
            Overall Liveability Score
          </div>
          {loading ? (
            <div className="nwLoading" style={{ padding: '16px 0' }}>Loading scores…</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                <span
                  style={{ fontSize: 96, fontWeight: 900, lineHeight: 1, color: band?.color ?? 'var(--text-h)', letterSpacing: '-0.04em', transition: 'color 0.3s ease', fontFamily: 'var(--sans)' }}
                  aria-label={`Liveability score: ${overallScore} out of 100`}
                >
                  {overallScore}
                </span>
                <span style={{ fontSize: '1.4rem', color: 'var(--muted-dark)', fontWeight: 500, marginBottom: 14 }} aria-hidden="true">
                  / 100
                </span>
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 14px',
                  background: band?.bg,
                  color: band?.color,
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  border: `1px solid ${band?.border}`,
                  borderRadius: 999,
                }}
                aria-hidden="true"
              >
                {band?.label}
              </span>
              {profileLabel && (
                <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--muted-dark)' }}>
                  Scored for: {profileLabel}
                </div>
              )}
            </>
          )}
        </div>

        {/* Category scores */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}
          role="region"
          aria-label="Category scores"
        >
          {CATEGORIES.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat]
            const score = scores?.[cat]
            const pct = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0
            return (
              <div
                key={cat}
                className="nwCard"
                style={{ borderTop: `3px solid ${cfg.color}`, padding: 18, display: 'flex', flexDirection: 'column' }}
              >
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: cfg.color, marginBottom: 6 }}>
                  {cfg.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
                  <span
                    style={{ fontSize: '2.4rem', fontWeight: 900, color: cfg.color, lineHeight: 1, letterSpacing: '-0.02em' }}
                    aria-label={`${cfg.label} score: ${loading ? 'loading' : `${score ?? '–'} out of 100`}`}
                  >
                    {loading ? '–' : (score ?? '–')}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted-dark)' }} aria-hidden="true">/100</span>
                </div>
                <div
                  className="nwProgressOuter"
                  role="progressbar"
                  aria-valuenow={score ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${cfg.label}: ${score ?? 0} out of 100`}
                  style={{ marginBottom: 10 }}
                >
                  <div className="nwProgressInner" style={{ width: `${pct}%` }} />
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted-dark)', lineHeight: 1.55, marginTop: 'auto' }}>
                  {cfg.description}
                </div>
              </div>
            )
          })}
        </div>

        {/* Illustrative data notice */}
        <div
          role="note"
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: '12px 16px',
            marginBottom: 14,
            background: 'rgba(42,157,143,0.07)',
            border: '1px solid rgba(42,157,143,0.22)',
            borderRadius: 14,
            fontSize: '0.85rem',
            color: '#1a6b63',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>ℹ</span>
          <span>
            <strong>Sample data</strong> — These indicators are illustrative while the real backend is being built. They do not reflect actual conditions for this location.
          </span>
        </div>

        {/* Indicator breakdown */}
        <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted-dark)', marginBottom: 12 }}>
          Indicator Breakdown
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }} role="region" aria-label="Indicator breakdown by category">
          {CATEGORIES.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat]
            const data = indicators[cat]
            const metCount = data?.factors?.filter((f) => f.met).length ?? 0
            const total = data?.factors?.length ?? 0

            return (
              <div key={cat} className="nwCard" style={{ padding: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '13px 20px',
                    borderBottom: '1px solid var(--border-light)',
                    background: '#f4f7fb',
                  }}
                >
                  <div aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-h)' }}>
                    {cfg.label}
                  </div>
                  {!loading && data && (
                    <div
                      style={{ fontSize: '0.78rem', color: 'var(--muted-dark)', fontWeight: 600 }}
                      aria-label={`${metCount} of ${total} ${cfg.label} indicators are met`}
                    >
                      {metCount}/{total}
                    </div>
                  )}
                </div>
                <ul
                  className="nwFactors"
                  style={{ margin: 0, padding: '12px 16px', listStyle: 'none' }}
                  aria-label={`${cfg.label} indicators`}
                >
                  {loading ? (
                    <li className="nwLoading" style={{ padding: '8px 0' }}>Loading {cfg.label.toLowerCase()} indicators…</li>
                  ) : data?.factors?.length ? (
                    data.factors.map((f) => (
                      <li key={f.name} className="nwFactorItem">
                        <div
                          className={`nwFactorIcon ${f.met ? 'nwFactorIconMet' : 'nwFactorIconNotMet'}`}
                          aria-hidden="true"
                        >
                          {f.met ? '✓' : '✗'}
                        </div>
                        <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-dark)', fontWeight: 500 }}>
                          {f.name}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li style={{ padding: '8px 0', fontSize: '0.875rem', color: 'var(--muted-dark)' }}>No indicators available.</li>
                  )}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Interpretation */}
        {!loading && scores && (
          <div className="nwCard" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-2)', marginBottom: 6 }}>
              Interpretation
            </div>
            <div style={{ fontFamily: 'var(--heading)', fontSize: '1.1rem', color: 'var(--text-h)', marginBottom: 12 }}>
              What this means for you
            </div>
            <p style={{ fontSize: '0.9rem', color: '#4a566b', lineHeight: 1.75, margin: 0 }}>
              {buildInterpretation(scores, locationName)}
            </p>
          </div>
        )}

        {/* Methodology */}
        <div className="nwCard">
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-2)', marginBottom: 6 }}>
            Methodology
          </div>
          <div style={{ fontFamily: 'var(--heading)', fontSize: '1.1rem', color: 'var(--text-h)', marginBottom: 16 }}>
            How this score is calculated
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Score calculation methodology">
            <thead>
              <tr>
                {['Category', 'Weight', 'Data sources'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    style={{
                      textAlign: 'left',
                      paddingBottom: 10,
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--muted-dark)',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat, idx) => {
                const cfg = CATEGORY_CONFIG[cat]
                return (
                  <tr key={cat}>
                    <td style={{ padding: '12px 12px 12px 0', borderBottom: idx < 2 ? '1px solid #eef1f6' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-dark)' }}>{cfg.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 12px', borderBottom: idx < 2 ? '1px solid #eef1f6' : 'none' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px 9px',
                          background: `${cfg.color}18`,
                          color: cfg.color,
                          fontWeight: 800,
                          fontSize: '0.72rem',
                          borderRadius: 999,
                          border: `1px solid ${cfg.color}30`,
                        }}
                        aria-label={`${cfg.label} contributes ${cfg.weight} percent of the overall score`}
                      >
                        {cfg.weight}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 0', borderBottom: idx < 2 ? '1px solid #eef1f6' : 'none' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted-dark)' }}>{cfg.sources}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
