import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LinearProgress } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { getLiveabilityScore } from '../services/api.js'
import { loadContext } from '../utils/storage.js'

const CATEGORIES = ['accessibility', 'safety', 'environment']

const CATEGORY_CONFIG = {
  accessibility: {
    label: 'Accessibility',
    color: '#2563eb',
    soft: '#eff6ff',
    border: '#bfdbfe',
    icon: '🚇',
    description: 'Transit links, walkability & essential services',
    weight: 35,
    sources: 'GTFS + OpenStreetMap',
  },
  safety: {
    label: 'Safety',
    color: '#059669',
    soft: '#ecfdf5',
    border: '#a7f3d0',
    icon: '🛡️',
    description: 'Crime rates, street lighting & pedestrian infrastructure',
    weight: 35,
    sources: 'Crime Statistics VIC + VicPlan',
  },
  environment: {
    label: 'Environment',
    color: '#ea580c',
    soft: '#fff7ed',
    border: '#fed7aa',
    icon: '🌿',
    description: 'Green space, air quality & urban heat exposure',
    weight: 30,
    sources: 'Urban Heat Islands + EPA AirWatch',
  },
}

const MELBOURNE_AVG = { accessibility: 58, safety: 62, environment: 71 }

function getScoreBand(score) {
  if (score >= 80) return { label: 'Excellent', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' }
  if (score >= 65) return { label: 'Good',      color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' }
  if (score >= 50) return { label: 'Moderate',  color: '#d97706', bg: '#fef3c7', border: '#fde68a' }
  return                  { label: 'Low',        color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
}

function getProfileLabel(profile) {
  if (!profile) return null
  if (profile.familyWithChildren) return 'Family'
  if (profile.elderly) return 'Elderly'
  if (profile.petOwner) return 'Pet Owner'
  return null
}

function buildInterpretation(scores, locationName, profileLabel, rangeMinutes) {
  const area = locationName || 'this area'
  const profileText = profileLabel
    ? `for a ${profileLabel.toLowerCase()} profile`
    : 'for a general profile'
  const rangeText = `${rangeMinutes}-minute`

  const rows = CATEGORIES.map((key) => {
    const value = Number(scores?.[key] ?? 0)
    const avg = Number(MELBOURNE_AVG[key] ?? 0)
    const delta = value - avg
    return { key, value, avg, delta }
  })

  const byDelta = [...rows].sort((a, b) => a.delta - b.delta)
  const lowestDelta = byDelta[0]
  const middleDelta = byDelta[1]
  const highestDelta = byDelta[2]

  const highestLabel = CATEGORY_CONFIG[highestDelta.key].label
  const middleLabel = CATEGORY_CONFIG[middleDelta.key].label
  const lowestLabel = CATEGORY_CONFIG[lowestDelta.key].label

  function deltaText(delta) {
    if (delta >= 0) return `${delta.toFixed(1)} points above Melbourne average`
    return `${Math.abs(delta).toFixed(1)} points below Melbourne average`
  }

  function absoluteBand(score) {
    if (score >= 80) return 'strong in absolute level'
    if (score >= 65) return 'good in absolute level'
    if (score >= 50) return 'moderate in absolute level'
    return 'low in absolute level'
  }

  return `${area} performs relatively best on ${highestLabel} (${highestDelta.value}/100), which is ${deltaText(highestDelta.delta)} and ${absoluteBand(highestDelta.value)}. ${middleLabel} is ${middleDelta.value}/100 (${deltaText(middleDelta.delta)}), showing a middle position versus city baseline. The main improvement area is ${lowestLabel} at ${lowestDelta.value}/100, which is ${deltaText(lowestDelta.delta)}. For your ${rangeText} search ${profileText}, this area is more suitable if your priority is ${highestLabel.toLowerCase()}, while users who care most about ${lowestLabel.toLowerCase()} may want to compare a few nearby alternatives.`
}

const ACCESSIBILITY_FACTOR_LABELS = {
  bus_stop: 'Bus stop coverage',
  train_station: 'Train station access',
  supermarket: 'Supermarket access',
  hospital: 'Hospital access',
  school: 'School access',
  park: 'Park access',
  dog_park: 'Dog park access',
}

const TARGET_COUNT_MAP = {
  bus_stop: 8,
  train_station: 1,
  supermarket: 3,
  hospital: 2,
  school: 3,
  park: 5,
  dog_park: 3,
}

const INDICATOR_WEIGHT_CONFIG = {
  bus_stop: { distance: 0.3, count: 0.7 },
  train_station: { distance: 0.8, count: 0.2 },
  supermarket: { distance: 0.5, count: 0.5 },
  hospital: { distance: 0.7, count: 0.3 },
  school: { distance: 0.6, count: 0.4 },
  park: { distance: 0.5, count: 0.5 },
  dog_park: { distance: 0.5, count: 0.5 },
}

const TIME_DISTANCE_KM = { 10: 0.8, 20: 1.6, 30: 2.4 }

function buildIndicatorMapFromBreakdown(breakdown = {}, rangeMinutes = 20) {
  const accessibilityBreakdown = breakdown.accessibility?.breakdown || {}
  const safety = breakdown.safety || {}
  const environment = breakdown.environment || {}
  const maxDistanceKm = TIME_DISTANCE_KM[Number(rangeMinutes)] || 1.6

  const accessibilityFactors = Object.entries(accessibilityBreakdown).map(([type, item]) => {
    const score = Number(item?.score) || 0
    const count = Number(item?.count) || 0
    const nearestDistanceKm = Number(item?.nearestDistanceKm)
    const target = TARGET_COUNT_MAP[type] || 3
    const indicatorWeights = INDICATOR_WEIGHT_CONFIG[type] || { distance: 0.5, count: 0.5 }
    const distanceScore =
      Number.isFinite(nearestDistanceKm) && nearestDistanceKm <= maxDistanceKm
        ? Math.max(0, 100 * (1 - nearestDistanceKm / maxDistanceKm))
        : 0
    const countScore = 100 * Math.min(count / target, 1)
    const distanceText = Number.isFinite(nearestDistanceKm)
      ? nearestDistanceKm < 1
        ? `${(nearestDistanceKm * 1000).toFixed(0)} m`
        : `${nearestDistanceKm.toFixed(2)} km`
      : 'No nearby result'

    const convenienceHint =
      score >= 80
        ? 'This is very convenient in daily life.'
        : score >= 60
          ? 'This is reasonably convenient for most people.'
          : 'This may feel less convenient and might need extra travel time.'

    return {
      name: ACCESSIBILITY_FACTOR_LABELS[type] || type.replaceAll('_', ' '),
      met: score >= 60,
      summary: `Score ${score.toFixed(1)}/100`,
      lines: [
        `Nearest place: ${distanceText}`,
        `Found in range: ${count} (target ${target})`,
        `Formula parts: distance ${distanceScore.toFixed(1)} + count ${countScore.toFixed(1)}`,
        convenienceHint,
      ],
      note: `Distance weight ${indicatorWeights.distance}, count weight ${indicatorWeights.count}.`,
    }
  })

  const safetyFactors = [
    {
      name: 'Crime context score',
      met: Number(safety?.scores?.crime) >= 60,
      summary: `Crime score ${safety?.scores?.crime ?? 'N/A'}/100`,
      lines: [
        `Nearby suburbs used: ${safety?.crimeDetails?.suburbCount ?? 0}`,
        Number(safety?.scores?.crime) >= 60
          ? 'Lower crime risk in this selected range.'
          : 'Crime risk is relatively higher in this selected range.',
      ],
    },
    {
      name: 'Zoning safety score',
      met: Number(safety?.scores?.zoning) >= 60,
      summary: `Zoning score ${safety?.scores?.zoning ?? 'N/A'}/100`,
      lines: [
        `Zoning features used: ${safety?.zoningDetails?.zoneCount ?? 0}`,
        'Land-use around you is translated into safety-friendly scores.',
      ],
    },
    {
      name: 'Combined safety output',
      met: Number(safety?.safetyScore) >= 60,
      summary: `Final safety score ${safety?.safetyScore ?? 'N/A'}/100`,
      lines: [
        'Final mix: crime 57% + zoning 43%',
        Number(safety?.safetyScore) >= 60
          ? 'Overall, this area feels comparatively safer.'
          : 'Overall, safety conditions are more mixed here.',
      ],
    },
  ]

  const environmentFactors = [
    {
      name: 'Green coverage',
      met: Number(environment?.scores?.green) >= 60,
      summary: `Green score ${environment?.scores?.green ?? 'N/A'}/100`,
      lines: [
        Number(environment?.scores?.green) >= 60
          ? 'Good amount of vegetation and green cover nearby.'
          : 'Green cover is more limited in this selected range.',
      ],
    },
    {
      name: 'Urban heat',
      met: Number(environment?.scores?.heat) >= 60,
      summary: `Heat score ${environment?.scores?.heat ?? 'N/A'}/100`,
      lines: [
        'Higher score means cooler and more comfortable outdoor conditions.',
      ],
    },
    {
      name: 'Environmental zoning comfort',
      met: Number(environment?.scores?.zoning) >= 60,
      summary: `Zoning comfort score ${environment?.scores?.zoning ?? 'N/A'}/100`,
      lines: [
        'Nearby land-use types are mapped to comfort levels.',
      ],
    },
    {
      name: 'Air quality',
      met: Number(environment?.scores?.airQuality) >= 60,
      summary: `Air quality score ${environment?.scores?.airQuality ?? 'N/A'}/100`,
      lines: [
        `Source: ${environment?.rawData?.airQualitySource || 'Air quality dataset'}`,
        Number(environment?.scores?.airQuality) >= 60
          ? 'Air quality is generally healthy for daily activity.'
          : 'Air quality may need more caution on sensitive days.',
      ],
    },
  ]

  return {
    accessibility: {
      category: 'accessibility',
      factors: accessibilityFactors,
      scoreExplanation: 'Computed from real POI distance and count data.',
    },
    safety: {
      category: 'safety',
      factors: safetyFactors,
      scoreExplanation: 'Computed from crime context and zoning safety model.',
    },
    environment: {
      category: 'environment',
      factors: environmentFactors,
      scoreExplanation: 'Computed from green, heat, zoning and air-quality signals.',
    },
  }
}

function CircularGauge({ score, color, size = 160, strokeWidth = 13, dark = false }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const [displayed, setDisplayed] = useState(0)
  const [dash, setDash] = useState(circ)

  useEffect(() => {
    if (score == null) return
    let start = null
    const duration = 900
    const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    function step(ts) {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const e = ease(progress)
      setDisplayed(Math.round(e * score))
      setDash(circ - e * (score / 100) * circ)
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [score, circ])

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={dash}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: 'Figtree, sans-serif', fontSize: size * 0.22, fontWeight: 900, fill: dark ? '#fff' : '#1a2436' }}>
        {displayed}
      </text>
      <text x={size / 2} y={size / 2 + size * 0.17} textAnchor="middle"
        style={{ fontFamily: 'Figtree, sans-serif', fontSize: size * 0.09, fontWeight: 600, fill: dark ? 'rgba(255,255,255,0.5)' : '#5c6b82' }}>
        / 100
      </text>
    </svg>
  )
}

function MiniGauge({ score, color, size = 52 }) {
  const sw = 5
  const r = (size - sw) / 2
  const circ = 2 * Math.PI * r
  const offset = score != null ? circ - (score / 100) * circ : circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={sw} />
      {score != null && (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      )}
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: 'Figtree, sans-serif', fontSize: size * 0.25, fontWeight: 800, fill: color }}>
        {score ?? '–'}
      </text>
    </svg>
  )
}

function CompareBar({ value, avg, color }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.07)' }}>
        <div style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${avg}%`, background: 'rgba(0,0,0,0.25)', borderRadius: 1, zIndex: 2 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${value ?? 0}%`, background: color, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: '#6b7280' }}>
        <span>This area: <span style={{ color, fontWeight: 800 }}>{value ?? '–'}</span></span>
        <span>Melb avg: {avg}</span>
      </div>
    </div>
  )
}

function IndicatorCard({ factor, color, soft, border }) {
  const [open, setOpen] = useState(false)
  const met = factor.met
  return (
    <button
      onClick={() => setOpen(o => !o)}
      aria-expanded={open}
      style={{
        all: 'unset',
        display: 'block',
        width: '100%',
        background: met ? soft : '#fafafa',
        border: `1.5px solid ${met ? border : '#e5e7eb'}`,
        borderRadius: 14,
        padding: '14px 16px',
        cursor: 'pointer',
        boxSizing: 'border-box',
        textAlign: 'left',
        transition: 'box-shadow 0.18s, transform 0.18s',
      }}
      onFocus={e => { e.currentTarget.style.outline = '2px solid #2563eb'; e.currentTarget.style.outlineOffset = '2px' }}
      onBlur={e => { e.currentTarget.style.outline = 'none' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: met ? color : '#e5e7eb',
          color: met ? '#fff' : '#6b7280',
          fontSize: 12, fontWeight: 900,
        }} aria-hidden="true">
          {met ? '✓' : '✕'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: '#1a2436', lineHeight: 1.35 }}>{factor.name}</p>
          {factor.summary ? (
            <p style={{ fontSize: 12, color: '#4b5563', marginTop: 6, lineHeight: 1.6, fontWeight: 600 }}>
              {factor.summary}
            </p>
          ) : null}
          {open && Array.isArray(factor.lines) && factor.lines.length > 0 ? (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {factor.lines.map((line, idx) => (
                <p key={idx} style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.55 }}>
                  {line}
                </p>
              ))}
              {factor.note ? (
                <p style={{ fontSize: 11, color: '#8a94a6', lineHeight: 1.5 }}>
                  {factor.note}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: met ? color : '#6b7280', flexShrink: 0, paddingTop: 2 }} aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </div>
    </button>
  )
}

export default function InsightsPage() {
  const navigate = useNavigate()
  const routerLocation = useLocation()

  const context = useMemo(() => routerLocation.state || loadContext() || null, [routerLocation.state])
  const selectedLocation = context?.selectedLocation
  const locationName = selectedLocation?.displayName || selectedLocation?.fullAddress || selectedLocation?.name || ''
  const profile = context?.profile
  const rangeMinutes = context?.rangeMinutes || 20
  const profileLabel = getProfileLabel(profile)

  const [overallScore, setOverallScore] = useState(null)
  const [scores, setScores] = useState(null)
  const [scoreWeights, setScoreWeights] = useState(null)
  const [indicators, setIndicators] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('accessibility')

  useEffect(() => {
    const lat = Number(selectedLocation?.lat)
    const lng = Number(selectedLocation?.lng)

    if (!locationName || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false

    const scoreP = getLiveabilityScore({
      lat,
      lng,
      time: rangeMinutes,
      persona: profile || 'default',
    })

    scoreP
      .then((scoreData) => {
        if (cancelled) return
        setOverallScore(scoreData.liveabilityScore)
        setScores(scoreData.scores || null)
        setScoreWeights(scoreData.weights || null)
        setIndicators(buildIndicatorMapFromBreakdown(scoreData.breakdown || {}, rangeMinutes))
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [locationName, rangeMinutes, profile, selectedLocation?.lat, selectedLocation?.lng])

  if (!locationName) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '1.4rem', color: '#101828', marginBottom: 8 }}>No suburb selected</p>
        <p style={{ fontSize: '0.95rem', color: '#4b5563', marginBottom: 24 }}>Search for a suburb or address from the home page first.</p>
        <button
          onClick={() => navigate('/')}
          onFocus={e => { e.currentTarget.style.outline = '2px solid #2563eb'; e.currentTarget.style.outlineOffset = '2px' }}
          onBlur={e => { e.currentTarget.style.outline = 'none' }}
          style={{
            padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: '#f47c20', color: '#fff', fontWeight: 800, fontSize: 15, fontFamily: 'Figtree, sans-serif',
          }}
        >
          Back to Home
        </button>
      </div>
    )
  }

  const band = overallScore != null ? getScoreBand(overallScore) : null
  const activeCfg = CATEGORY_CONFIG[activeTab]
  const activeIndicators = indicators[activeTab]

  return (
    <div style={{ background: '#f5f0eb', minHeight: '100%', paddingBottom: 80 }}>

      <nav aria-label="Page navigation" style={{
        position: 'sticky', top: 64, zIndex: 50,
        background: 'rgba(245,240,235,0.95)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        padding: '10px 32px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => navigate('/map')}
          aria-label="Go back to map"
          onFocus={e => { e.currentTarget.style.outline = '2px solid #2563eb'; e.currentTarget.style.outlineOffset = '2px' }}
          onBlur={e => { e.currentTarget.style.outline = 'none' }}
          style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0, color: '#374151',
          }}
        >
          <ArrowBackIcon style={{ fontSize: 16 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#1a2436', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{locationName}</p>
          <p style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>
            Liveability breakdown · {rangeMinutes} min range{profileLabel ? ` · ${profileLabel}` : ''}
          </p>
        </div>
        {band && !loading && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            background: band.bg, border: `1px solid ${band.border}`,
            borderRadius: 999, padding: '4px 12px',
          }} aria-label={`Overall liveability: ${band.label}`}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: band.color }} aria-hidden="true" />
            <span style={{ fontSize: 12, fontWeight: 800, color: band.color }}>{band.label}</span>
          </div>
        )}
      </nav>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px 0' }}>

        {/* Hero score card */}
        <div style={{
          borderRadius: 28, overflow: 'hidden', marginBottom: 20,
          background: 'linear-gradient(135deg, #1e1b4b 0%, #6b21a8 45%, #9a3412 100%)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
        }}>
          <div style={{
            padding: '36px 40px',
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) auto',
            gap: 32,
            alignItems: 'center',
          }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                {locationName} · Overall Liveability
              </p>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 400, color: '#fff', lineHeight: 1.15, marginBottom: 14 }}>
                {band && !loading
                  ? <>{`A `}<em style={{ color: '#fcd34d', fontStyle: 'italic' }}>{band.label.toLowerCase()}</em>{` place`}<br />{`to call home`}</>
                  : 'Loading your score…'
                }
              </h1>
              {!loading && band && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 999, padding: '6px 14px', marginBottom: 20,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: band.color }} aria-hidden="true" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                    {band.label}{profileLabel ? ` · Scored for ${profileLabel}` : ''}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {CATEGORIES.map(k => {
                  const c = CATEGORY_CONFIG[k]
                  return (
                    <div key={k} style={{
                      background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 12, padding: '8px 14px',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 13 }} aria-hidden="true">{c.icon}</span>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{c.label}</p>
                        <p style={{ fontSize: 17, fontWeight: 900, color: '#fff', lineHeight: 1 }}
                          aria-label={`${c.label}: ${loading ? 'loading' : scores?.[k] ?? 'unavailable'}`}>
                          {loading ? '–' : scores?.[k] ?? '–'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {loading
                ? <div style={{ width: 160, height: 160, borderRadius: '50%', border: '13px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>…</span>
                  </div>
                : <CircularGauge score={overallScore} color={band?.color ?? '#d97706'} size={160} strokeWidth={13} dark={true} />
              }
              <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textAlign: 'center', letterSpacing: '0.06em' }}>LIVEABILITY SCORE</p>
            </div>
          </div>
        </div>

        {/* Category score cards */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}
          role="region" aria-label="Category scores"
        >
          {CATEGORIES.map(k => {
            const c = CATEGORY_CONFIG[k]
            const score = scores?.[k]
            const avg = MELBOURNE_AVG[k]
            const delta = score != null ? score - avg : null
            return (
              <div key={k} style={{
                background: '#fff', border: `1.5px solid ${c.border}`,
                borderRadius: 20, padding: '20px 18px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                transition: 'box-shadow 0.2s, transform 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.color, marginBottom: 2 }}>{c.label}</p>
                    <p style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.4, maxWidth: 100 }}>{c.description}</p>
                  </div>
                  <MiniGauge score={loading ? null : score} color={c.color} size={50} />
                </div>
                {delta != null && (
                  <p style={{ fontSize: 10, fontWeight: 700, color: delta >= 0 ? '#059669' : '#dc2626' }}
                    aria-label={`${Math.abs(delta)} points ${delta >= 0 ? 'above' : 'below'} Melbourne average`}>
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs Melb avg
                  </p>
                )}
                <CompareBar value={loading ? null : score} avg={avg} color={c.color} />
                {!loading && indicators[k] && (
                  <p style={{ marginTop: 10, fontSize: 11, color: '#4b5563' }}>
                    {indicators[k].factors?.filter(f => f.met).length ?? 0}/{indicators[k].factors?.length ?? 0} indicators met
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Indicator breakdown */}
        <div style={{ marginBottom: 24 }} role="region" aria-label="Indicator breakdown">
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 4 }}>Indicator Breakdown</p>
          <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 22, fontWeight: 400, color: '#1a2436', marginBottom: 16 }}>
            What&apos;s driving your score
          </h2>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }} role="tablist" aria-label="Score categories">
            {CATEGORIES.map(k => {
              const c = CATEGORY_CONFIG[k]
              const active = activeTab === k
              const tabId = `tab-${k}`
              return (
                <button
                  key={k}
                  id={tabId}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(k)}
                  onFocus={e => { e.currentTarget.style.outline = '2px solid #2563eb'; e.currentTarget.style.outlineOffset = '2px' }}
                  onBlur={e => { e.currentTarget.style.outline = 'none' }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 12, cursor: 'pointer',
                    border: active ? `1.5px solid ${c.border}` : '1.5px solid #e5e7eb',
                    background: active ? c.soft : '#fff',
                    color: active ? c.color : '#6b7280',
                    fontFamily: 'Figtree, sans-serif', fontWeight: 700, fontSize: 13,
                    transition: 'all 0.18s',
                  }}
                >
                  <span aria-hidden="true">{c.icon}</span>
                  <span>{c.label}</span>
                  <span style={{
                    background: active ? c.color : '#e5e7eb',
                    color: active ? '#fff' : '#6b7280',
                    borderRadius: 999, fontSize: 10, fontWeight: 900, padding: '1px 6px',
                  }} aria-label={`score ${loading ? 'loading' : scores?.[k] ?? 'unavailable'}`}>
                    {loading ? '–' : scores?.[k] ?? '–'}
                  </span>
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}
          >
            {loading
              ? <div style={{ gridColumn: '1/-1', padding: '20px 0' }}>
                  <LinearProgress sx={{ borderRadius: 2, height: 5, bgcolor: activeCfg.soft, '& .MuiLinearProgress-bar': { bgcolor: activeCfg.color } }} />
                </div>
              : activeIndicators?.factors?.length
                ? activeIndicators.factors.map((f, i) => (
                    <IndicatorCard key={i} factor={f} color={activeCfg.color} soft={activeCfg.soft} border={activeCfg.border} />
                  ))
                : <p style={{ color: '#4b5563', fontSize: 14, padding: '16px 0', gridColumn: '1/-1' }}>No indicators available.</p>
            }
          </div>
          {!loading && activeIndicators?.scoreExplanation ? (
            <p style={{ marginTop: 10, fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>
              {activeIndicators.scoreExplanation}
            </p>
          ) : null}
          <p style={{ marginTop: 10, fontSize: 11, color: '#4b5563' }}>
            Tap any indicator to read the detail behind it.
          </p>
        </div>

        {/* Interpretation */}
        {!loading && scores && (
          <div style={{
            background: '#fff', border: '1.5px solid #e5e7eb',
            borderRadius: 20, overflow: 'hidden', marginBottom: 20,
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          }}>
            <div style={{ background: 'linear-gradient(90deg, #1a1a2e, #0f3460)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }} aria-hidden="true">💬</span>
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Interpretation</p>
                <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 16, color: '#fff' }}>What this means for you</p>
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.75 }}>
                {buildInterpretation(scores, locationName, profileLabel, rangeMinutes)}
              </p>
              <div style={{ marginTop: 16, padding: '12px 16px', background: '#f5f0eb', borderRadius: 12, borderLeft: '3px solid #d97706' }} role="note">
                <p style={{ fontSize: 12, color: '#92400e', fontWeight: 600, lineHeight: 1.6 }}>
                  Scores are computed from live backend formulas and open-data signals.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Methodology */}
        <div style={{
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 20, padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 4 }}>Methodology</p>
          <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 20, fontWeight: 400, color: '#1a2436', marginBottom: 18 }}>
            How this score is calculated
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Score calculation methodology">
            <thead>
              <tr>
                {['Category', 'Weight', 'Data sources'].map(h => (
                  <th key={h} scope="col" style={{
                    textAlign: 'left', paddingBottom: 12,
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4b5563',
                    borderBottom: '1px solid #e5e7eb',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((k, idx) => {
                const c = CATEGORY_CONFIG[k]
                const dynamicWeight =
                  k === 'accessibility'
                    ? scoreWeights?.A
                    : k === 'safety'
                      ? scoreWeights?.S
                      : scoreWeights?.E
                const displayWeight = Number.isFinite(dynamicWeight)
                  ? Math.round(dynamicWeight * 100)
                  : c.weight
                return (
                  <tr key={k}>
                    <td style={{ padding: '14px 16px 14px 0', borderBottom: idx < 2 ? '1px solid #f3f4f6' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span aria-hidden="true">{c.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#1a2436' }}>{c.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px 14px 0', borderBottom: idx < 2 ? '1px solid #f3f4f6' : 'none' }}>
                      <span style={{
                        display: 'inline-block', background: c.soft, border: `1px solid ${c.border}`,
                        borderRadius: 999, padding: '3px 12px',
                        fontSize: 12, fontWeight: 800, color: c.color,
                      }} aria-label={`${displayWeight} percent`}>{displayWeight}%</span>
                    </td>
                    <td style={{ padding: '14px 0', borderBottom: idx < 2 ? '1px solid #f3f4f6' : 'none' }}>
                      <span style={{ fontSize: 12, color: '#4b5563' }}>{c.sources}</span>
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
