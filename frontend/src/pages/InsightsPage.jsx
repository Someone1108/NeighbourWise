import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LinearProgress } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { getCensusProfileForLocation, getLiveabilityScore } from '../services/api.js'
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

function buildInterpretationSummary(scores, profileLabel, rangeMinutes) {
  const rows = CATEGORIES.map((key) => {
    const value = Number(scores?.[key])
    const avg = Number(MELBOURNE_AVG[key] ?? 0)
    const delta = Number.isFinite(value) ? value - avg : null
    return {
      key,
      label: CATEGORY_CONFIG[key].label,
      value,
      avg,
      delta,
    }
  }).filter((row) => Number.isFinite(row.value))

  if (!rows.length) return null

  const byScore = [...rows].sort((a, b) => b.value - a.value)
  const strongest = byScore[0]
  const weakest = byScore[byScore.length - 1]
  const middle = byScore[1]
  const scoreSpread = strongest.value - weakest.value
  const profileText = profileLabel ? ` for a ${profileLabel.toLowerCase()} profile` : ''
  const focusLabel = strongest.label.toLowerCase()
  const tradeoffLabel = weakest.label.toLowerCase()

  const headline = `Best fit: ${focusLabel}-focused living`
  const verdict =
    middle && strongest.key !== weakest.key
      ? `This area's strongest signal is ${strongest.label}, scoring ${Math.round(strongest.value)}/100. ${middle.label} is close behind at ${Math.round(middle.value)}/100, while ${weakest.label} is the main trade-off at ${Math.round(weakest.value)}/100.`
      : `This area's strongest signal is ${strongest.label}, scoring ${Math.round(strongest.value)}/100.`

  const context =
    scoreSpread <= 8
      ? 'The category scores are fairly close, so this is a balanced area rather than one with a single standout strength.'
      : `${strongest.label} stands out most clearly, while ${weakest.label.toLowerCase()} is the area to check more carefully.`

  const nextAction =
    strongest.key === weakest.key
      ? `Use this score as a comparison guide for your ${rangeMinutes}-minute search${profileText}.`
      : `If ${tradeoffLabel} is a top priority, it may be worth comparing a few nearby alternatives before deciding.`

  return {
    headline,
    verdict,
    closingLine: `${context} ${nextAction}`,
    rows,
  }
}

function categoryComparisonText(rows = []) {
  if (!rows.length) return ''

  const parts = rows.map((row) => {
    const delta = Number(row.delta)
    if (!Number.isFinite(delta)) return `${row.label} has no city average to compare against`
    if (Math.abs(delta) <= 2) return `${row.label} is close to the Melbourne average`
    if (delta > 0) return `${row.label} is above the Melbourne average`
    return `${row.label} is below the Melbourne average`
  })

  return parts.join('. ') + '.'
}

function findIndicator(indicators, category, namePart) {
  const factors = indicators?.[category]?.factors || []
  const needle = String(namePart).toLowerCase()
  return factors.find((factor) => String(factor.name || '').toLowerCase().includes(needle))
}

function compactIndicatorPhrase(factor, fallbackLabel) {
  if (!factor) return `${fallbackLabel} unavailable`
  const score = Number(factor.score)
  if (!Number.isFinite(score)) return `${factor.name} is unavailable`

  const name = String(factor.name || fallbackLabel).toLowerCase()
  if (score >= 80) return `${name} looks like a clear strength`
  if (score >= 65) return `${name} looks reliable`
  if (score >= 50) return `${name} is usable, but not a standout`
  return `${name} may need extra planning`
}

function buildSituationHighlights(profile, scores, indicators) {
  if (!profile) return null

  const accessibility = Number(scores?.accessibility)
  const safety = Number(scores?.safety)
  const environment = Number(scores?.environment)

  if (profile.familyWithChildren) {
    const school = findIndicator(indicators, 'accessibility', 'school')
    const park = findIndicator(indicators, 'accessibility', 'park')
    return {
      title: 'For a family household',
      summary: 'For a family household, the key checks are school access, parks and safety.',
      points: [
        compactIndicatorPhrase(school, 'School access'),
        compactIndicatorPhrase(park, 'Park access'),
        Number.isFinite(safety)
          ? safety >= 65
            ? 'the safety signal is generally reassuring'
            : 'the safety signal is worth checking more carefully'
          : 'safety context is unavailable',
      ],
    }
  }

  if (profile.elderly) {
    const bus = findIndicator(indicators, 'accessibility', 'bus stop')
    const train = findIndicator(indicators, 'accessibility', 'train')
    const hospital = findIndicator(indicators, 'accessibility', 'hospital')
    return {
      title: 'For an older resident',
      summary: 'For an older resident, the key checks are transport, healthcare and outdoor comfort.',
      points: [
        compactIndicatorPhrase(bus, 'Bus stop coverage'),
        compactIndicatorPhrase(train, 'Train station access'),
        compactIndicatorPhrase(hospital, 'Hospital access'),
        Number.isFinite(environment)
          ? environment >= 65
            ? 'outdoor comfort looks reasonably supportive'
            : 'outdoor comfort may need extra consideration'
          : 'outdoor comfort is unavailable',
      ],
    }
  }

  if (profile.petOwner) {
    const dogPark = findIndicator(indicators, 'accessibility', 'dog park')
    const park = findIndicator(indicators, 'accessibility', 'park')
    const green = findIndicator(indicators, 'environment', 'green')
    return {
      title: 'For a pet owner',
      summary: 'For a pet owner, the key checks are parks, green coverage and daily access.',
      points: [
        compactIndicatorPhrase(dogPark || park, 'Park access'),
        compactIndicatorPhrase(green, 'Green coverage'),
        Number.isFinite(accessibility)
          ? accessibility >= 65
            ? 'daily access looks convenient overall'
            : 'daily access may require more planning'
          : 'daily access is unavailable',
      ],
    }
  }

  return null
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

function getIndicatorStatus(score) {
  const value = Number(score)
  if (!Number.isFinite(value)) {
    return { label: 'Unavailable', tone: 'neutral' }
  }
  if (value >= 80) return { label: 'Strong', tone: 'positive' }
  if (value >= 65) return { label: 'Good', tone: 'positive' }
  if (value >= 50) return { label: 'Needs attention', tone: 'caution' }
  return { label: 'Limited', tone: 'negative' }
}

function getImpactText(score, categoryLabel) {
  const value = Number(score)
  if (!Number.isFinite(value)) return 'Impact unavailable'
  if (value >= 80) return `Improves ${categoryLabel.toLowerCase()}`
  if (value >= 65) return `Supports ${categoryLabel.toLowerCase()}`
  if (value >= 50) return `Slightly reduces ${categoryLabel.toLowerCase()}`
  return `Pulls ${categoryLabel.toLowerCase()} down`
}

function summarizeCategory(category, factors = []) {
  const label = CATEGORY_CONFIG[category]?.label || 'This category'
  const scored = factors
    .map((factor) => ({ ...factor, numericScore: Number(factor.score) }))
    .filter((factor) => Number.isFinite(factor.numericScore))

  if (!scored.length) {
    return `No detailed ${label.toLowerCase()} indicators are available yet.`
  }

  const sorted = [...scored].sort((a, b) => b.numericScore - a.numericScore)
  const best = sorted[0]
  const weakest = sorted[sorted.length - 1]

  if (weakest.numericScore < 60 && best.numericScore >= 70) {
    return `${label} is helped most by ${best.name.toLowerCase()}, while ${weakest.name.toLowerCase()} is the main thing pulling the score down.`
  }

  if (weakest.numericScore >= 65) {
    return `${label} is fairly balanced, with ${best.name.toLowerCase()} as the strongest contributor.`
  }

  return `${label} has mixed signals. ${best.name} performs best, but ${weakest.name.toLowerCase()} needs attention.`
}

function groupIndicatorFactors(factors = []) {
  const strengths = []
  const needsAttention = []
  const supporting = []

  factors.forEach((factor) => {
    const score = Number(factor.score)
    if (Number.isFinite(score) && score >= 75) {
      strengths.push(factor)
    } else if (Number.isFinite(score) && score < 60) {
      needsAttention.push(factor)
    } else {
      supporting.push(factor)
    }
  })

  return [
    { title: 'Biggest strengths', factors: strengths },
    { title: 'Needs attention', factors: needsAttention },
    { title: 'Supporting factors', factors: supporting },
  ].filter((group) => group.factors.length > 0)
}

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
      score,
      met: score >= 60,
      summary: `${score.toFixed(1)}/100`,
      plainText: `${ACCESSIBILITY_FACTOR_LABELS[type] || type.replaceAll('_', ' ')} scores ${score.toFixed(1)}/100. The nearest result is ${distanceText}, with ${count} found in the selected range.`,
      impact: getImpactText(score, 'Accessibility'),
      lines: [
        convenienceHint,
      ],
      details: [
        `Nearest place: ${distanceText}`,
        `Availability: ${count} found, target ${target}`,
        `Distance score: ${distanceScore.toFixed(1)}/100`,
        `Availability score: ${countScore.toFixed(1)}/100`,
        `Weighting: distance ${Math.round(indicatorWeights.distance * 100)}%, availability ${Math.round(indicatorWeights.count * 100)}%`,
      ],
    }
  })

  const crimeScore = Number(safety?.scores?.crime)
  const zoningSafetyScore = Number(safety?.scores?.zoning)
  const finalSafetyScore = Number(safety?.safetyScore)

  const safetyFactors = [
    {
      name: 'Crime context score',
      score: crimeScore,
      met: crimeScore >= 60,
      summary: Number.isFinite(crimeScore) ? `${crimeScore}/100` : 'Unavailable',
      plainText: Number.isFinite(crimeScore)
        ? `Crime context scores ${crimeScore}/100 based on nearby suburb crime patterns.`
        : 'Crime context is unavailable for this area.',
      impact: getImpactText(crimeScore, 'Safety'),
      lines: [
        crimeScore >= 60
          ? 'Lower crime risk in this selected range.'
          : 'Crime risk is relatively higher in this selected range.',
      ],
      details: [`Nearby suburbs used: ${safety?.crimeDetails?.suburbCount ?? 0}`],
    },
    {
      name: 'Zoning safety score',
      score: zoningSafetyScore,
      met: zoningSafetyScore >= 60,
      summary: Number.isFinite(zoningSafetyScore) ? `${zoningSafetyScore}/100` : 'Unavailable',
      plainText: Number.isFinite(zoningSafetyScore)
        ? `Zoning safety scores ${zoningSafetyScore}/100 from nearby land-use patterns.`
        : 'Zoning safety is unavailable for this area.',
      impact: getImpactText(zoningSafetyScore, 'Safety'),
      lines: [
        'Land-use around you is translated into safety-friendly scores.',
      ],
      details: [`Zoning features used: ${safety?.zoningDetails?.zoneCount ?? 0}`],
    },
    {
      name: 'Combined safety output',
      score: finalSafetyScore,
      met: finalSafetyScore >= 60,
      summary: Number.isFinite(finalSafetyScore) ? `${finalSafetyScore}/100` : 'Unavailable',
      plainText: Number.isFinite(finalSafetyScore)
        ? `The final safety score is ${finalSafetyScore}/100 after combining crime and zoning signals.`
        : 'The final safety score is unavailable for this area.',
      impact: getImpactText(finalSafetyScore, 'Safety'),
      lines: [
        finalSafetyScore >= 60
          ? 'Overall, this area feels comparatively safer.'
          : 'Overall, safety conditions are more mixed here.',
      ],
      details: ['Final mix: crime 57%, zoning 43%'],
    },
  ]

  const greenScore = Number(environment?.scores?.green)
  const heatScore = Number(environment?.scores?.heat)
  const zoningComfortScore = Number(environment?.scores?.zoning)
  const airQualityScore = Number(environment?.scores?.airQuality)

  const environmentFactors = [
    {
      name: 'Green coverage',
      score: greenScore,
      met: greenScore >= 60,
      summary: Number.isFinite(greenScore) ? `${greenScore}/100` : 'Unavailable',
      plainText: Number.isFinite(greenScore)
        ? `Green coverage scores ${greenScore}/100 based on vegetation and green space nearby.`
        : 'Green coverage is unavailable for this area.',
      impact: getImpactText(greenScore, 'Environment'),
      lines: [
        greenScore >= 60
          ? 'Good amount of vegetation and green cover nearby.'
          : 'Green cover is more limited in this selected range.',
      ],
    },
    {
      name: 'Urban heat',
      score: heatScore,
      met: heatScore >= 60,
      summary: Number.isFinite(heatScore) ? `${heatScore}/100` : 'Unavailable',
      plainText: Number.isFinite(heatScore)
        ? `Urban heat scores ${heatScore}/100. Higher scores mean cooler and more comfortable outdoor conditions.`
        : 'Urban heat is unavailable for this area.',
      impact: getImpactText(heatScore, 'Environment'),
      lines: [
        'Higher score means cooler and more comfortable outdoor conditions.',
      ],
    },
    {
      name: 'Environmental zoning comfort',
      score: zoningComfortScore,
      met: zoningComfortScore >= 60,
      summary: Number.isFinite(zoningComfortScore) ? `${zoningComfortScore}/100` : 'Unavailable',
      plainText: Number.isFinite(zoningComfortScore)
        ? `Environmental zoning comfort scores ${zoningComfortScore}/100 from nearby land-use types.`
        : 'Environmental zoning comfort is unavailable for this area.',
      impact: getImpactText(zoningComfortScore, 'Environment'),
      lines: [
        'Nearby land-use types are mapped to comfort levels.',
      ],
    },
    {
      name: 'Air quality',
      score: airQualityScore,
      met: airQualityScore >= 60,
      summary: Number.isFinite(airQualityScore) ? `${airQualityScore}/100` : 'Unavailable',
      plainText: Number.isFinite(airQualityScore)
        ? `Air quality scores ${airQualityScore}/100 using the nearest available air quality signal.`
        : 'Air quality is unavailable for this area.',
      impact: getImpactText(airQualityScore, 'Environment'),
      lines: [
        airQualityScore >= 60
          ? 'Air quality is generally healthy for daily activity.'
          : 'Air quality may need more caution on sensitive days.',
      ],
      details: [`Source: ${environment?.rawData?.airQualitySource || 'Air quality dataset'}`],
    },
  ]

  return {
    accessibility: {
      category: 'accessibility',
      factors: accessibilityFactors,
      takeaway: summarizeCategory('accessibility', accessibilityFactors),
      scoreExplanation: 'Computed from real POI distance and count data.',
    },
    safety: {
      category: 'safety',
      factors: safetyFactors,
      takeaway: summarizeCategory('safety', safetyFactors),
      scoreExplanation: 'Computed from crime context and zoning safety model.',
    },
    environment: {
      category: 'environment',
      factors: environmentFactors,
      takeaway: summarizeCategory('environment', environmentFactors),
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
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'rgba(0,0,0,0.07)' }}>
        <div style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${avg}%`, background: 'rgba(0,0,0,0.25)', borderRadius: 1, zIndex: 2 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${value ?? 0}%`, background: color, borderRadius: 5 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
        <span>This area: <span style={{ color, fontWeight: 800 }}>{value ?? '–'}</span></span>
        <span>Melb avg: {avg}</span>
      </div>
    </div>
  )
}

function IndicatorScoreBar({ score, color }) {
  const value = Number(score)
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(value, 100)) : 0

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 7, borderRadius: 999, background: 'rgba(15,23,42,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${safeValue}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
    </div>
  )
}

function IndicatorCard({ factor, color, soft, border }) {
  const [open, setOpen] = useState(false)
  const status = getIndicatorStatus(factor.score)
  const isPositive = status.tone === 'positive'
  const isCaution = status.tone === 'caution'
  const isMet = factor.met
  const cardBorder = isMet ? border : '#e5e7eb'
  const cardBackground = isMet ? soft : '#fff'
  const badgeBackground = isMet ? color : '#e5e7eb'
  const badgeColor = isMet ? '#fff' : '#9ca3af'
  const numericScore = Number(factor.score)
  const scoreText = Number.isFinite(numericScore) ? `${numericScore.toFixed(1)}/100` : 'Unavailable'
  return (
    <button
      onClick={() => setOpen(o => !o)}
      aria-expanded={open}
      style={{
        all: 'unset',
        display: 'block',
        width: '100%',
        background: cardBackground,
        border: `1.5px solid ${cardBorder}`,
        borderRadius: 14,
        padding: '16px 18px',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: badgeBackground,
          color: badgeColor,
          fontSize: 16, fontWeight: 900,
        }} aria-hidden="true">
          {isMet ? '✓' : '✕'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#1a2436', lineHeight: 1.3 }}>{factor.name}</p>
          <p style={{ fontSize: 14, color: '#4b5563', marginTop: 4, lineHeight: 1.4 }}>
            Score {scoreText}
          </p>
        </div>
        <span style={{ fontSize: 22, fontWeight: 800, color: isMet ? color : '#9ca3af', flexShrink: 0, lineHeight: 1 }} aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </div>
      {open ? (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(15,23,42,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{
              borderRadius: 999,
              padding: '3px 10px',
              background: isPositive ? 'rgba(5,150,105,0.12)' : isCaution ? 'rgba(217,119,6,0.14)' : 'rgba(107,114,128,0.12)',
              color: isPositive ? '#047857' : isCaution ? '#92400e' : '#4b5563',
              fontSize: 12,
              fontWeight: 900,
            }}>
              {status.label}
            </span>
          </div>
          <IndicatorScoreBar score={factor.score} color={color} />
          {factor.plainText ? (
            <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6 }}>
              {factor.plainText}
            </p>
          ) : null}
          {Array.isArray(factor.lines) && factor.lines.map((line, idx) => (
            <p key={`line-${idx}`} style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6 }}>
              {line}
            </p>
          ))}
          {Array.isArray(factor.details) && factor.details.map((line, idx) => (
            <p key={`detail-${idx}`} style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.55 }}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </button>
  )
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Unavailable'
  return Math.round(n).toLocaleString('en-AU')
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Unavailable'
  return `${Math.round(n * 10) / 10}%`
}

function formatMoney(value, suffix) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Unavailable'
  return `$${Math.round(n).toLocaleString('en-AU')}${suffix}`
}

function getSituationCensusHighlight(userProfile, censusProfile) {
  if (!userProfile || !censusProfile) return null

  if (userProfile.familyWithChildren) {
    const familyHouseholds = formatPercent(censusProfile.familyHouseholdsPct)
    const children = formatPercent(censusProfile.age0To14Pct)
    const householdSize =
      censusProfile.averageHouseholdSize != null
        ? `${censusProfile.averageHouseholdSize} people`
        : 'Unavailable'

    if (
      familyHouseholds === 'Unavailable' &&
      children === 'Unavailable' &&
      householdSize === 'Unavailable'
    ) {
      return null
    }

    return {
      label: 'Relevant for families',
      text: `For a family household, the useful Census context here is that ${familyHouseholds} of households are family households, children aged 0-14 make up ${children} of residents, and the average household size is ${householdSize}.`,
    }
  }

  if (userProfile.elderly) {
    const olderResidents = formatPercent(censusProfile.age65PlusPct)
    const assistance = formatPercent(censusProfile.needForAssistancePct)
    const lonePerson = formatPercent(censusProfile.lonePersonHouseholdsPct)
    const noCar = formatPercent(censusProfile.noCarHouseholdsPct)

    if (
      olderResidents === 'Unavailable' &&
      assistance === 'Unavailable' &&
      lonePerson === 'Unavailable' &&
      noCar === 'Unavailable'
    ) {
      return null
    }

    return {
      label: 'Relevant for older residents',
      text: `For an older resident, the useful Census context here is that ${olderResidents} of residents are aged 65+, ${assistance} report needing assistance, ${lonePerson} of households are lone-person households, and ${noCar} have no car.`,
    }
  }

  if (userProfile.petOwner) {
    const renters = formatPercent(censusProfile.rentersPct)
    const ownerOccupied = formatPercent(censusProfile.ownerOccupiedPct)
    const householdSize =
      censusProfile.averageHouseholdSize != null
        ? `${censusProfile.averageHouseholdSize} people`
        : 'Unavailable'

    if (
      renters === 'Unavailable' &&
      ownerOccupied === 'Unavailable' &&
      householdSize === 'Unavailable'
    ) {
      return null
    }

    return {
      label: 'Relevant for pet owners',
      text: `Census does not measure pet ownership directly, but housing context can still help: ${renters} of households rent, ${ownerOccupied} are owner-occupied, and the average household size is ${householdSize}.`,
    }
  }

  return null
}

function CensusContextSection({ data, loading, userProfile }) {
  const profile = data?.profile || {}
  const source = data?.source || {}
  const situationHighlight =
    !loading && data?.available ? getSituationCensusHighlight(userProfile, profile) : null
  const stats = [
    { label: 'Population', value: formatNumber(profile.totalPopulation) },
    { label: 'Median age', value: profile.medianAge != null ? `${profile.medianAge}` : 'Unavailable' },
    { label: 'Renters', value: formatPercent(profile.rentersPct) },
    { label: 'Median rent', value: formatMoney(profile.medianRentWeekly, ' / week') },
    { label: 'Public transport to work', value: formatPercent(profile.publicTransportToWorkPct) },
    { label: 'Residents 65+', value: formatPercent(profile.age65PlusPct) },
  ]

  return (
    <div style={{ marginBottom: 28 }} role="region" aria-label="Census context">
      <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 6 }}>Census Context</p>
      <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 28, fontWeight: 400, color: '#1a2436', marginBottom: 18 }}>
        Who lives here
      </h2>

      <div style={{
        background: '#fff',
        border: '1.5px solid #e5e7eb',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          padding: '20px 26px',
          background: 'linear-gradient(90deg, #064e3b, #0f766e)',
          color: '#fff',
        }}>
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>
            2021 Census profile
          </p>
          <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 22, lineHeight: 1.25 }}>
            {loading
              ? 'Loading local Census information...'
              : data?.available
                ? `${source.sa2Name || 'Matched neighbourhood'}${source.matchedSuburb ? `, matched from ${source.matchedSuburb}` : ''}`
                : 'Census information is not available for this location'}
          </p>
          {!loading && data?.available && (
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 8, lineHeight: 1.5 }}>
              Based on the best matching SA2 area{source.overlapAreaPct != null ? ` (${source.overlapAreaPct}% boundary overlap)` : ''}.
            </p>
          )}
        </div>

        <div style={{ padding: '22px 24px' }}>
          {loading ? (
            <LinearProgress sx={{ borderRadius: 2, height: 5, bgcolor: '#d1fae5', '& .MuiLinearProgress-bar': { bgcolor: '#0f766e' } }} />
          ) : data?.available ? (
            <>
              {situationHighlight && (
                <div style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderLeft: '4px solid #0f766e',
                  borderRadius: 14,
                  padding: '16px 18px',
                  marginBottom: 20,
                }}>
                  <p style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#047857', marginBottom: 6 }}>
                    {situationHighlight.label}
                  </p>
                  <p style={{ fontSize: 15, color: '#134e4a', lineHeight: 1.65, fontWeight: 600 }}>
                    {situationHighlight.text}
                  </p>
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 12,
                marginBottom: 20,
              }}>
                {stats.map((stat) => (
                  <div key={stat.label} style={{
                    background: '#f8fafc',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: '14px 16px',
                  }}>
                    <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                      {stat.label}
                    </p>
                    <p style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>{stat.value}</p>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                {(data.insights || []).map((item) => (
                  <div key={item.title} style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: '16px 18px',
                    background: '#fff',
                  }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#0f766e', marginBottom: 8 }}>{item.title}</p>
                    <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.65 }}>{item.text}</p>
                  </div>
                ))}
              </div>

              <p style={{ marginTop: 16, fontSize: 13, color: '#64748b', lineHeight: 1.55 }}>
                Census data is from 2021 and suburb/postcode boundaries may not perfectly match the SA2 profile area.
              </p>
            </>
          ) : (
            <p style={{ fontSize: 16, color: '#4b5563', lineHeight: 1.7 }}>
              {data?.message || 'No Census profile could be matched for this location yet.'}
            </p>
          )}
        </div>
      </div>
    </div>
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
  const [censusLoading, setCensusLoading] = useState(true)
  const [censusData, setCensusData] = useState(null)
  const [activeTab, setActiveTab] = useState('accessibility')

  useEffect(() => {
    const lat = Number(selectedLocation?.lat)
    const lng = Number(selectedLocation?.lng)

    if (!locationName || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return
    }
    let cancelled = false

    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true)
        setCensusLoading(true)
      }
    })

    const scoreP = getLiveabilityScore({
      lat,
      lng,
      time: rangeMinutes,
      persona: profile || 'default',
    })
    const censusP = getCensusProfileForLocation(selectedLocation).catch((err) => {
      console.error('Census profile load error:', err)
      return {
        available: false,
        message: 'Census information could not be loaded for this location.',
      }
    })

    Promise.all([scoreP, censusP])
      .then(([scoreData, censusProfile]) => {
        if (cancelled) return
        setOverallScore(scoreData.liveabilityScore)
        setScores(scoreData.scores || null)
        setScoreWeights(scoreData.weights || null)
        setIndicators(buildIndicatorMapFromBreakdown(scoreData.breakdown || {}, rangeMinutes))
        setCensusData(censusProfile)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setCensusLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [locationName, rangeMinutes, profile, selectedLocation])

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
  const activeGroups = groupIndicatorFactors(activeIndicators?.factors || [])
  const situationHighlights = buildSituationHighlights(profile, scores, indicators)
  const interpretationSummary = buildInterpretationSummary(scores, profileLabel, rangeMinutes)

  return (
    <div style={{ background: '#f5f0eb', minHeight: '100%', paddingBottom: 80 }}>

      <nav aria-label="Page navigation" style={{
        position: 'sticky', top: 64, zIndex: 50,
        background: 'rgba(245,240,235,0.95)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        padding: '12px 40px', display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button
          onClick={() => navigate('/map')}
          aria-label="Go back to map"
          onFocus={e => { e.currentTarget.style.outline = '2px solid #2563eb'; e.currentTarget.style.outlineOffset = '2px' }}
          onBlur={e => { e.currentTarget.style.outline = 'none' }}
          style={{
            width: 38, height: 38, borderRadius: 9, border: '1px solid rgba(0,0,0,0.12)',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0, color: '#374151',
          }}
        >
          <ArrowBackIcon style={{ fontSize: 20 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#1a2436', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{locationName}</p>
          <p style={{ fontSize: 13, color: '#4b5563', marginTop: 3 }}>
            Liveability breakdown · {rangeMinutes} min range{profileLabel ? ` · ${profileLabel}` : ''}
          </p>
        </div>
        {band && !loading && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
            background: band.bg, border: `1px solid ${band.border}`,
            borderRadius: 999, padding: '5px 14px',
          }} aria-label={`Overall liveability: ${band.label}`}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: band.color }} aria-hidden="true" />
            <span style={{ fontSize: 14, fontWeight: 800, color: band.color }}>{band.label}</span>
          </div>
        )}
      </nav>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 32px 0' }}>

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
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                {locationName} · Overall Liveability
              </p>
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 'clamp(28px, 3.6vw, 42px)', fontWeight: 400, color: '#fff', lineHeight: 1.15, marginBottom: 16 }}>
                {band && !loading
                  ? <>{`A `}<em style={{ color: '#fcd34d', fontStyle: 'italic' }}>{band.label.toLowerCase()}</em>{` place`}<br />{`to call home`}</>
                  : 'Loading your score…'
                }
              </h1>
              {!loading && band && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 999, padding: '7px 16px', marginBottom: 22,
                }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: band.color }} aria-hidden="true" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                    {band.label}{profileLabel ? ` · Scored for ${profileLabel}` : ''}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {CATEGORIES.map(k => {
                  const c = CATEGORY_CONFIG[k]
                  return (
                    <div key={k} style={{
                      background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 12, padding: '10px 16px',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <span style={{ fontSize: 16 }} aria-hidden="true">{c.icon}</span>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{c.label}</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}
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
                ? <div style={{ width: 210, height: 210, borderRadius: '50%', border: '15px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 15 }}>…</span>
                  </div>
                : <CircularGauge score={overallScore} color={band?.color ?? '#d97706'} size={210} strokeWidth={15} dark={true} />
              }
              <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textAlign: 'center', letterSpacing: '0.06em' }}>LIVEABILITY SCORE</p>
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
                borderRadius: 20, padding: '24px 22px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                transition: 'box-shadow 0.2s, transform 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.color, marginBottom: 6 }}>{c.label}</p>
                    <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.5, maxWidth: 180 }}>{c.description}</p>
                  </div>
                  <MiniGauge score={loading ? null : score} color={c.color} size={62} />
                </div>
                {delta != null && (
                  <p style={{ fontSize: 13, fontWeight: 700, color: delta >= 0 ? '#059669' : '#dc2626' }}
                    aria-label={`${Math.abs(delta)} points ${delta >= 0 ? 'above' : 'below'} Melbourne average`}>
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs Melb avg
                  </p>
                )}
                <CompareBar value={loading ? null : score} avg={avg} color={c.color} />
                {!loading && indicators[k] && (
                  <p style={{ marginTop: 12, fontSize: 13, color: '#4b5563' }}>
                    {indicators[k].factors?.filter(f => f.met).length ?? 0}/{indicators[k].factors?.length ?? 0} indicators met
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Indicator breakdown */}
        <div style={{ marginBottom: 28 }} role="region" aria-label="Indicator breakdown">
          <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 6 }}>Indicator Breakdown</p>
          <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 28, fontWeight: 400, color: '#1a2436', marginBottom: 18 }}>
            What&apos;s driving your score
          </h2>
          {!loading && activeIndicators?.takeaway ? (
            <div style={{
              background: '#fff',
              border: `1.5px solid ${activeCfg.border}`,
              borderLeft: `5px solid ${activeCfg.color}`,
              borderRadius: 14,
              padding: '16px 18px',
              marginBottom: 16,
              boxShadow: '0 4px 18px rgba(0,0,0,0.04)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: activeCfg.color, marginBottom: 6 }}>
                {activeCfg.label} takeaway
              </p>
              <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.65, fontWeight: 650 }}>
                {activeIndicators.takeaway}
              </p>
            </div>
          ) : null}

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
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px', borderRadius: 12, cursor: 'pointer',
                    border: active ? `1.5px solid ${c.border}` : '1.5px solid #e5e7eb',
                    background: active ? c.soft : '#fff',
                    color: active ? c.color : '#6b7280',
                    fontFamily: 'Figtree, sans-serif', fontWeight: 700, fontSize: 15,
                    transition: 'all 0.18s',
                  }}
                >
                  <span aria-hidden="true">{c.icon}</span>
                  <span>{c.label}</span>
                  <span style={{
                    background: active ? c.color : '#e5e7eb',
                    color: active ? '#fff' : '#6b7280',
                    borderRadius: 999, fontSize: 12, fontWeight: 900, padding: '2px 9px',
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
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {loading
              ? <div style={{ gridColumn: '1/-1', padding: '20px 0' }}>
                  <LinearProgress sx={{ borderRadius: 2, height: 5, bgcolor: activeCfg.soft, '& .MuiLinearProgress-bar': { bgcolor: activeCfg.color } }} />
                </div>
              : activeGroups.length
                ? activeGroups.map((group) => (
                    <section key={group.title} aria-label={group.title}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <p style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4b5563' }}>
                          {group.title}
                        </p>
                        <span style={{ height: 1, flex: 1, background: 'rgba(15,23,42,0.08)' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, alignItems: 'start' }}>
                        {group.factors.map((f) => (
                          <IndicatorCard key={f.name} factor={f} color={activeCfg.color} soft={activeCfg.soft} border={activeCfg.border} />
                        ))}
                      </div>
                    </section>
                  ))
                : <p style={{ color: '#4b5563', fontSize: 16, padding: '16px 0', gridColumn: '1/-1' }}>No indicators available.</p>
            }
          </div>
          {!loading && activeIndicators?.scoreExplanation ? (
            <p style={{ marginTop: 12, fontSize: 14, color: '#4b5563', lineHeight: 1.6 }}>
              {activeIndicators.scoreExplanation}
            </p>
          ) : null}
          <p style={{ marginTop: 10, fontSize: 13, color: '#4b5563' }}>
            Tap any indicator to read the detail behind it.
          </p>
        </div>

        <CensusContextSection data={censusData} loading={censusLoading} userProfile={profile} />

        {/* Interpretation */}
        {!loading && scores && (
          <div style={{
            background: '#fff', border: '1.5px solid #e5e7eb',
            borderRadius: 20, overflow: 'hidden', marginBottom: 20,
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          }}>
            <div style={{ background: 'linear-gradient(90deg, #1a1a2e, #0f3460)', padding: '18px 26px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }} aria-hidden="true">💬</span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Interpretation</p>
                <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 20, color: '#fff' }}>What this means for you</p>
              </div>
            </div>
            <div style={{ padding: '24px 26px 20px' }}>
              {interpretationSummary ? (
                <>
                  <h3 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 28, fontWeight: 400, color: '#101828', marginBottom: 10 }}>
                    {interpretationSummary.headline}
                  </h3>
                  <p style={{ fontSize: 16, color: '#374151', lineHeight: 1.7, marginBottom: 14 }}>
                    {interpretationSummary.verdict}
                  </p>
                  <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.65, marginBottom: 12 }}>
                    {categoryComparisonText(interpretationSummary.rows)}
                  </p>
                  <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.65, marginBottom: situationHighlights ? 14 : 0 }}>
                    {interpretationSummary.closingLine}
                  </p>
                </>
              ) : null}
              {situationHighlights ? (
                <div style={{
                  marginTop: 14,
                  border: '1.5px solid #bfdbfe',
                  borderRadius: 12,
                  background: '#eff6ff',
                  padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px', marginBottom: 10 }}>
                    <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2563eb' }}>
                      Selected situation
                    </p>
                    <p style={{ fontSize: 15, color: '#1e3a8a', fontWeight: 900 }}>
                      {situationHighlights.title}
                    </p>
                    <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, flexBasis: '100%' }}>
                      {situationHighlights.summary}
                    </p>
                  </div>
                  <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.65 }}>
                    {situationHighlights.points.join('. ')}.
                  </p>
                </div>
              ) : null}
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#f5f0eb', borderRadius: 10, borderLeft: '3px solid #d97706' }} role="note">
                <p style={{ fontSize: 13, color: '#92400e', fontWeight: 650, lineHeight: 1.55 }}>
                  Scores use live calculations and public datasets. Use them as a comparison guide, not a final decision.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Methodology */}
        <div style={{
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 20, padding: '28px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        }}>
          <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 6 }}>Methodology</p>
          <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, fontWeight: 400, color: '#1a2436', marginBottom: 20 }}>
            How this score is calculated
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Score calculation methodology">
            <thead>
              <tr>
                {['Category', 'Weight', 'Data sources'].map(h => (
                  <th key={h} scope="col" style={{
                    textAlign: 'left', paddingBottom: 14,
                    fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4b5563',
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
                    <td style={{ padding: '16px 18px 16px 0', borderBottom: idx < 2 ? '1px solid #f3f4f6' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span aria-hidden="true" style={{ fontSize: 18 }}>{c.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: 16, color: '#1a2436' }}>{c.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 18px 16px 0', borderBottom: idx < 2 ? '1px solid #f3f4f6' : 'none' }}>
                      <span style={{
                        display: 'inline-block', background: c.soft, border: `1px solid ${c.border}`,
                        borderRadius: 999, padding: '4px 14px',
                        fontSize: 14, fontWeight: 800, color: c.color,
                      }} aria-label={`${displayWeight} percent`}>{displayWeight}%</span>
                    </td>
                    <td style={{ padding: '16px 0', borderBottom: idx < 2 ? '1px solid #f3f4f6' : 'none' }}>
                      <span style={{ fontSize: 14, color: '#4b5563' }}>{c.sources}</span>
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
