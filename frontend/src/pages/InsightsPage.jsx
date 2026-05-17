import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LinearProgress } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { addToCompareList, replaceCompareArea, loadCompareList, getCompareUpdatedEventName, loadContext, saveContext } from '../utils/storage.js'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import CompareReplaceModal from '../components/CompareReplaceModal.jsx'
import ChangeConditionsModal from '../components/ChangeConditionsModal.jsx'
import {
  getCensusProfileForLocation,
  getCouncilLinksForLocation,
  getLiveabilityScore,
  getInsightRecommendations,
} from '../services/api.js'

const CATEGORIES = ['accessibility', 'safety', 'environment']

const STATIC_SCORE_BENCHMARK = {
  label: 'Supported locality avg',
  description:
    'Calculated from 497 completed Melbourne locality scores in the latest recalibrated 20-minute default scoring export.',
  sampleSize: 497,
  scores: {
    accessibility: 51,
    safety: 69,
    environment: 75,
    liveability: 63,
  },
}

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
    label: 'Safety & Comfort',
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

function buildInterpretationSummary(scores, profileLabel, rangeMinutes, benchmarkScores) {
  const rows = CATEGORIES.map((key) => {
    const value = Number(scores?.[key])
    const avg = Number(benchmarkScores?.[key])
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
  const tradeoffLabel = weakest.label.toLowerCase()
  const profileNoun = profileLabel ? `${profileLabel.toLowerCase()} household` : 'household'
  const experienceCopy = {
    accessibility: {
      headline: 'Daily essentials should feel easier here',
      strength: 'getting around and reaching everyday services should be one of the easier parts of living here',
      caution: 'daily trips may need a little more planning',
    },
    safety: {
      headline: 'The area looks steady for day-to-day living',
      strength: 'the local safety context looks comparatively reassuring',
      caution: 'it is worth checking the safety context street by street',
    },
    environment: {
      headline: 'Outdoor comfort is one of the better signals here',
      strength: 'green space, heat and air-quality signals look more supportive than the other categories',
      caution: 'outdoor comfort may be the main thing to inspect more closely',
    },
  }
  const strongestCopy = experienceCopy[strongest.key] || experienceCopy.accessibility
  const weakestCopy = experienceCopy[weakest.key] || experienceCopy.accessibility

  const headline =
    profileLabel === 'Family'
      ? strongest.key === 'accessibility'
        ? 'A practical fit for family routines'
        : strongestCopy.headline
      : strongestCopy.headline
  const verdict =
    middle && strongest.key !== weakest.key
      ? `For a ${profileNoun}, ${strongestCopy.strength}. ${middle.label.toLowerCase()} also looks workable, while ${weakestCopy.caution}.`
      : `For a ${profileNoun}, ${strongestCopy.strength}.`

  const context =
    scoreSpread <= 8
      ? 'The signals are fairly balanced, so this does not look like a suburb with one obvious strength and one obvious weakness.'
      : `${strongest.label} is doing most of the heavy lifting here, while ${weakest.label.toLowerCase()} is the area to inspect before making a decision.`

  const nextAction =
    strongest.key === weakest.key
      ? `Use this score as a comparison guide for your ${rangeMinutes}-minute search${profileText}.`
      : `If ${tradeoffLabel} matters a lot to you, compare a nearby suburb before treating this as the best option.`

  return {
    headline,
    verdict,
    closingLine: `${context} ${nextAction}`,
    rows,
  }
}

function categoryComparisonText(rows = [], benchmarkLabel = 'benchmark') {
  if (!rows.length) return ''

  const parts = rows.map((row) => {
    const delta = Number(row.delta)
    if (!Number.isFinite(delta)) return `${row.label} does not have a benchmark to compare against`
    if (Math.abs(delta) <= 2) return `${row.label} is close to the ${benchmarkLabel}`
    if (delta > 0) return `${row.label} is above the ${benchmarkLabel}`
    return `${row.label} is below the ${benchmarkLabel}`
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
    const schoolScore = Number(school?.score)
    const parkScore = Number(park?.score)
    const strongestFamilySignal = [
      {
        key: 'environment',
        value: environment,
        text: 'This area works best for a family through outdoor comfort: green space, heat and air-quality signals are the most supportive part of the result, which helps with parks, walking and time outside',
      },
      {
        key: 'safety',
        value: safety,
        text: 'This area works well for a family through its safety and comfort signal, which helps everyday trips feel more manageable',
      },
      {
        key: 'accessibility',
        value: accessibility,
        text: 'This area works well for a family through everyday access, with local services, schools and parks doing more of the practical work',
      },
    ]
      .filter((signal) => Number.isFinite(signal.value))
      .sort((a, b) => b.value - a.value)[0]
    const accessPhrase =
      Number.isFinite(schoolScore) && Number.isFinite(parkScore)
        ? schoolScore >= 65 && parkScore >= 65
          ? 'School and park access both look supportive for everyday family routines'
          : schoolScore >= 65
            ? 'School access looks supportive, while park access is worth checking in more detail'
            : parkScore >= 65
              ? 'Park access looks supportive, while school access is worth checking in more detail'
              : 'School and park access look like the main everyday routine checks to verify'
        : 'School and park access are useful checks for everyday family routines'
    const safetyPhrase = Number.isFinite(safety)
      ? safety >= 65
        ? 'The safety signal also looks reassuring enough to keep this area in consideration'
        : 'The safety signal is the part to inspect more closely before deciding'
      : 'Safety context is unavailable for this area'

    return {
      title: 'For a family household',
      summary: strongestFamilySignal?.text || 'This area has some useful signals for family routines, especially when you compare schools, parks and safety together.',
      points: [
        accessPhrase,
        safetyPhrase,
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
  dog_park: 1,
}

const INDICATOR_WEIGHT_CONFIG = {
  bus_stop: { distance: 0.3, count: 0.7 },
  train_station: { distance: 0.8, count: 0.2 },
  supermarket: { distance: 0.5, count: 0.5 },
  hospital: { distance: 0.7, count: 0.3 },
  school: { distance: 0.6, count: 0.4 },
  park: { distance: 0.5, count: 0.5 },
  dog_park: { distance: 0.3, count: 0.7 },
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

function describeScore(score, strongText, goodText, moderateText, lowText) {
  const value = Number(score)
  if (!Number.isFinite(value)) return 'This signal is unavailable for the selected area.'
  if (value >= 80) return strongText
  if (value >= 65) return goodText
  if (value >= 50) return moderateText
  return lowText
}

function joinList(items = [], limit = 3) {
  const clean = items.map((item) => String(item || '').trim()).filter(Boolean)
  if (!clean.length) return ''
  const shown = clean.slice(0, limit)
  const suffix = clean.length > limit ? ` and ${clean.length - limit} more` : ''
  return `${shown.join(', ')}${suffix}`
}

function formatDecimal(value, digits = 1) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Unavailable'
  return n.toFixed(digits)
}

function formatSharePercent(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Unavailable'
  return `${Math.round(n * 100)}%`
}

function validPlaceName(value) {
  const name = String(value || '').trim()
  if (!name || name.toLowerCase() === 'unknown') return ''
  return name
}

function formatDistanceKm(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (n < 1) return `${Math.round(n * 1000)} m`
  return `${Math.round(n * 10) / 10} km`
}

function formatDistanceMeters(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (n < 1000) return `${Math.round(n)} m`
  return `${Math.round((n / 1000) * 10) / 10} km`
}

function describeVegetationRange(minValue, maxValue) {
  const min = Number(minValue)
  const max = Number(maxValue)
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return 'The spread of greenery across nearby streets is unavailable.'
  }
  if (max - min >= 50) {
    return 'Greenery is uneven across the area: some nearby pockets are very green, while others have very little cover.'
  }
  if (min >= 25) {
    return 'Greenery appears fairly consistent across the selected area.'
  }
  return 'Some nearby streets may feel less shaded even if the area has greenery overall.'
}

function describeHeatRange(minValue, maxValue) {
  const min = Number(minValue)
  const max = Number(maxValue)
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return 'The spread of heat exposure across nearby streets is unavailable.'
  }
  if (max >= 8) {
    return 'Parts of this area are likely to feel noticeably hotter on warm days.'
  }
  if (max - min >= 4) {
    return 'Heat comfort may vary across the area, so some streets may feel cooler than others.'
  }
  return 'Heat exposure looks fairly consistent across the selected area.'
}

function describeFeatureConfidence(count, label) {
  const value = Number(count)
  if (!Number.isFinite(value) || value <= 0) return `${label} detail is limited for this area.`
  if (value >= 100) return `This is based on many nearby ${label.toLowerCase()} records, so the signal is reasonably well supported.`
  return `This is based on ${value} nearby ${label.toLowerCase()} records, so read it as a local estimate.`
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

function getPersonaIndicatorPriority(factor, profile) {
  const name = String(factor?.name || '').toLowerCase()

  if (name.includes('crime context')) return 0
  if (name.includes('activity')) return 1
  if (name.includes('noise') || name.includes('traffic')) return 2
  if (name.includes('transport')) return 3
  if (name.includes('zoning safety')) return 4

  if (profile?.familyWithChildren) {
    if (name.includes('school')) return 0
    if (name.includes('park') && !name.includes('dog')) return 1
    if (name.includes('supermarket')) return 2
    if (name.includes('hospital')) return 3
    if (name.includes('bus') || name.includes('train')) return 8
    return 50
  }

  if (profile?.elderly) {
    if (name.includes('hospital')) return 0
    if (name.includes('bus')) return 1
    if (name.includes('train')) return 2
    if (name.includes('supermarket')) return 3
    if (name.includes('park') && !name.includes('dog')) return 4
    return 50
  }

  if (profile?.petOwner) {
    if (name.includes('dog park')) return 0
    if (name.includes('park')) return 1
    if (name.includes('green')) return 2
    if (name.includes('bus') || name.includes('train')) return 7
    return 50
  }

  return 50
}

function orderFactorsForPersona(factors = [], profile) {
  return [...factors].sort((a, b) => {
    const priorityDelta = getPersonaIndicatorPriority(a, profile) - getPersonaIndicatorPriority(b, profile)
    if (priorityDelta !== 0) return priorityDelta
    return Number(b.score || 0) - Number(a.score || 0)
  })
}

function groupIndicatorFactors(factors = [], profile) {
  const strengths = []
  const needsAttention = []
  const supporting = []

  orderFactorsForPersona(factors, profile).forEach((factor) => {
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
    const nearestPoi = item?.nearestPoi || null
    const nearestPoiName = validPlaceName(nearestPoi?.name)
    const target = TARGET_COUNT_MAP[type] || 3
    const indicatorWeights = INDICATOR_WEIGHT_CONFIG[type] || { distance: 0.5, count: 0.5 }
    const distanceScore =
      Number.isFinite(nearestDistanceKm) && nearestDistanceKm <= maxDistanceKm
        ? Math.max(0, 100 * (1 - nearestDistanceKm / maxDistanceKm))
        : 0
    const countScore = 100 * Math.min(count / target, 1)
    const distanceText = Number.isFinite(nearestDistanceKm)
      ? formatDistanceKm(nearestDistanceKm)
      : 'No nearby result'
    const nearestPlaceText = nearestPoiName
      ? `${nearestPoiName}${distanceText !== 'No nearby result' ? ` (${distanceText} away)` : ''}`
      : distanceText

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
      preview: nearestPoiName ? `Nearest: ${nearestPlaceText}` : '',
      plainText: `${ACCESSIBILITY_FACTOR_LABELS[type] || type.replaceAll('_', ' ')} scores ${score.toFixed(1)}/100. ${nearestPoiName ? `Nearest named place: ${nearestPlaceText}.` : `The nearest result is ${distanceText}.`} ${count} found in the selected range.`,
      impact: getImpactText(score, 'Accessibility'),
      lines: [
        convenienceHint,
      ],
      details: [
        `Nearest place: ${nearestPlaceText}`,
        `Availability: ${count} found, target ${target}`,
        `Distance score: ${distanceScore.toFixed(1)}/100`,
        `Availability score: ${countScore.toFixed(1)}/100`,
        `Weighting: distance ${Math.round(indicatorWeights.distance * 100)}%, availability ${Math.round(indicatorWeights.count * 100)}%`,
      ],
    }
  })

  const crimeScore = Number(safety?.scores?.crime)
  const activityScore = Number(safety?.scores?.activity)
  const noiseScore = Number(safety?.scores?.noise)
  const transportComfortScore = Number(safety?.scores?.transportComfort)
  const zoningSafetyScore = Number(safety?.scores?.zoning)
  const rawCrimeAverage = Number(safety?.crimeDetails?.averageInRadius)
  const nearbySuburbCount = Number(safety?.crimeDetails?.suburbCount)
  const nearbySuburbs = joinList(safety?.crimeDetails?.suburbNames || [])
  const activityDetails = safety?.activityDetails || {}
  const activityCategories = joinList(activityDetails.categories || [], 5)
  const noiseDetails = safety?.noiseDetails || {}
  const noiseFeatureTypes = joinList(noiseDetails.featureTypes || [], 5)
  const transportDetails = safety?.transportComfortDetails || {}
  const transportModes = joinList(transportDetails.modes || [], 4)
  const transportTagCoverage = transportDetails.tagCoverage || {}
  const nearestTransportStop = transportDetails.nearestStop || null
  const nearestTransportStopName = validPlaceName(nearestTransportStop?.name)
  const nearestTransportStopDistance = formatDistanceMeters(nearestTransportStop?.distanceMeters)
  const nearestTransportStopText = nearestTransportStopName
    ? `${nearestTransportStopName}${nearestTransportStopDistance ? ` (${nearestTransportStopDistance} away)` : ''}`
    : ''
  const zoneCount = Number(safety?.zoningDetails?.zoneCount)
  const zoneMix = (safety?.zoningDetails?.zoneMix || [])
    .map((zone) => `${zone.label} (${zone.count})`)
    .join(', ')
  const safetyWeights = safety?.effectiveWeights || safety?.weights || {}
  const crimeWeight = Math.round(Number(safetyWeights.crime ?? 0.45) * 100)
  const activityWeight = Math.round(Number(safetyWeights.activity ?? 0.10) * 100)
  const noiseWeight = Math.round(Number(safetyWeights.noise ?? 0.15) * 100)
  const transportWeight = Math.round(Number(safetyWeights.transportComfort ?? 0.10) * 100)
  const zoningWeight = Math.round(Number(safetyWeights.zoning ?? 0.20) * 100)
  const missingCrime = safety?.missingData?.crime
  const missingActivity = safety?.missingData?.activity
  const missingNoise = safety?.missingData?.noise
  const missingTransportComfort = safety?.missingData?.transportComfort
  const missingZoning = safety?.missingData?.zoning

  const safetyFactors = [
    {
      name: 'Crime context score',
      score: crimeScore,
      met: crimeScore >= 60,
      summary: Number.isFinite(crimeScore) ? `${crimeScore}/100` : 'Unavailable',
      plainText: Number.isFinite(crimeScore)
        ? `Crime context scores ${crimeScore}/100 using recorded-crime patterns from suburbs intersecting the selected travel range.`
        : 'Crime context is unavailable for this area.',
      impact: getImpactText(crimeScore, 'Safety'),
      lines: [
        describeScore(
          crimeScore,
          'Recorded-crime context looks strong compared with the areas in the dataset.',
          'Recorded-crime context looks broadly favourable for this selected range.',
          'Recorded-crime context is mixed, so this area may need more street-level checking.',
          'Recorded-crime context is the main safety concern in this selected range.',
        ),
        Number.isFinite(rawCrimeAverage)
          ? `Raw nearby crime context average: ${rawCrimeAverage}/100 before the urban-area adjustment used by the model.`
          : 'Raw nearby crime context average is unavailable.',
        nearbySuburbs
          ? `Suburbs contributing to this signal include ${nearbySuburbs}.`
          : 'No contributing suburb names were returned for this signal.',
      ],
      details: [
        `Nearby suburbs used: ${Number.isFinite(nearbySuburbCount) ? nearbySuburbCount : 0}`,
        `This contributes ${crimeWeight}% of the safety score.`,
        missingCrime ? 'Crime data was missing, so zoning was used as the fallback.' : 'Crime data available.',
      ],
    },
    {
      name: 'Street activity and passive surveillance',
      score: activityScore,
      met: activityScore >= 60,
      summary: Number.isFinite(activityScore) ? `${activityScore}/100` : 'Unavailable',
      plainText: Number.isFinite(activityScore)
        ? `Street activity scores ${activityScore}/100 using mapped shops, services, hospitality and community places inside the selected range. Active frontages can support safety by putting more people and informal observation on the street.`
        : 'Street activity data is unavailable for this area.',
      impact: getImpactText(activityScore, 'Safety'),
      lines: [
        describeScore(
          activityScore,
          'Mapped activity is strong, which can improve passive surveillance and perceived safety.',
          'Mapped activity is reasonably supportive for day-to-day street presence.',
          'Mapped activity is present but not a major safety strength.',
          'Mapped activity is limited, so some streets may feel quieter or less naturally observed.',
        ),
        Number.isFinite(Number(activityDetails.featureCount))
          ? `${activityDetails.featureCount} activity features were found in the selected range.`
          : 'Activity feature count is unavailable.',
        activityCategories
          ? `Examples of mapped activity types include ${activityCategories}.`
          : 'No detailed activity categories were returned for this area.',
      ],
      details: [
        `Weighted activity density: ${formatDecimal(activityDetails.weightedDensity)}`,
        `Average activity support weight: ${formatDecimal(activityDetails.averageWeight, 2)}`,
        `This contributes ${activityWeight}% of the safety score.`,
        missingActivity ? 'Activity data was missing, so the other safety signals were reweighted.' : 'Activity data available.',
      ],
    },
    {
      name: 'Noise and traffic comfort',
      score: noiseScore,
      met: noiseScore >= 60,
      summary: Number.isFinite(noiseScore) ? `${noiseScore}/100` : 'Unavailable',
      plainText: Number.isFinite(noiseScore)
        ? `Noise and traffic comfort scores ${noiseScore}/100 using nearby major roads, rail, tram corridors and mapped lighting. Higher scores mean less traffic pressure and a more comfortable public realm.`
        : 'Noise and traffic comfort data is unavailable for this area.',
      impact: getImpactText(noiseScore, 'Safety'),
      lines: [
        describeScore(
          noiseScore,
          'Traffic and noise pressure looks low, which supports comfort when moving around.',
          'Traffic and noise pressure looks manageable for most day-to-day trips.',
          'Traffic and noise pressure is mixed, so comfort may vary by street.',
          'Traffic and noise pressure may reduce comfort, especially around busier corridors.',
        ),
        Number.isFinite(Number(noiseDetails.totalSegmentKm))
          ? `${formatDecimal(noiseDetails.totalSegmentKm)} km of relevant transport or traffic segments were assessed.`
          : 'Traffic segment length is unavailable.',
        Number.isFinite(Number(noiseDetails.litShare))
          ? `${formatSharePercent(noiseDetails.litShare)} of mapped traffic segments with lighting tags are marked as lit.`
          : 'Lighting coverage for traffic segments is unavailable.',
      ],
      details: [
        `Traffic/noise feature types: ${noiseFeatureTypes || 'Unavailable'}`,
        `Noise pressure: ${formatDecimal(noiseDetails.noisePressure)}`,
        `This contributes ${noiseWeight}% of the safety score.`,
        missingNoise ? 'Noise data was missing, so the other safety signals were reweighted.' : 'Noise data available.',
      ],
    },
    {
      name: 'Public transport stop comfort',
      score: transportComfortScore,
      met: transportComfortScore >= 60,
      summary: Number.isFinite(transportComfortScore) ? `${transportComfortScore}/100` : 'Unavailable',
      preview: nearestTransportStopText ? `Nearby stop: ${nearestTransportStopText}` : '',
      plainText: Number.isFinite(transportComfortScore)
        ? `Public transport stop comfort scores ${transportComfortScore}/100 using nearby stops and mapped amenities such as lighting, shelters, benches, wheelchair access and tactile paving.${nearestTransportStopText ? ` A nearby stop assessed is ${nearestTransportStopText}.` : ''}`
        : 'Public transport stop comfort data is unavailable for this area.',
      impact: getImpactText(transportComfortScore, 'Safety'),
      lines: [
        describeScore(
          transportComfortScore,
          'Nearby stops look well supported, which helps trips feel safer and more comfortable.',
          'Nearby stops have a reasonable comfort signal for everyday use.',
          'Stop comfort is mixed, so some waits may feel better supported than others.',
          'Stop comfort is limited, which may make waiting or transferring feel less comfortable.',
        ),
        Number.isFinite(Number(transportDetails.stopCount))
          ? `${transportDetails.stopCount} public transport stops were assessed in the selected range.`
          : 'Public transport stop count is unavailable.',
        transportModes
          ? `Mapped modes include ${transportModes}.`
          : 'No transport modes were returned for this area.',
      ],
      details: [
        nearestTransportStopText ? `Nearby public transport: ${nearestTransportStopText}` : 'Nearby public transport: Unavailable',
        `Lighting coverage: ${formatSharePercent(transportTagCoverage.lit)}`,
        `Shelter coverage: ${formatSharePercent(transportTagCoverage.shelter)}`,
        `Bench coverage: ${formatSharePercent(transportTagCoverage.bench)}`,
        `Wheelchair coverage: ${formatSharePercent(transportTagCoverage.wheelchair)}`,
        `Tactile paving coverage: ${formatSharePercent(transportTagCoverage.tactilePaving)}`,
        `This contributes ${transportWeight}% of the safety score.`,
        missingTransportComfort ? 'Transport comfort data was missing, so the other safety signals were reweighted.' : 'Transport comfort data available.',
      ],
    },
    {
      name: 'Zoning safety score',
      score: zoningSafetyScore,
      met: zoningSafetyScore >= 60,
      summary: Number.isFinite(zoningSafetyScore) ? `${zoningSafetyScore}/100` : 'Unavailable',
      plainText: Number.isFinite(zoningSafetyScore)
        ? `Zoning safety scores ${zoningSafetyScore}/100 from land-use zones inside the selected range. Commercial, mixed-use and active public areas can support safety because they often bring more foot traffic, lighting, passive surveillance and CCTV coverage.`
        : 'Zoning safety is unavailable for this area.',
      impact: getImpactText(zoningSafetyScore, 'Safety'),
      lines: [
        describeScore(
          zoningSafetyScore,
          'The surrounding land-use mix is strongly safety-supportive.',
          'The surrounding land-use mix is generally safety-supportive.',
          'The surrounding land-use mix is varied, so the local street context matters.',
          'The surrounding land-use mix may reduce perceived or practical safety.',
        ),
        zoneMix
          ? `Most common zoning types found: ${zoneMix}.`
          : 'No detailed zoning mix was returned for this area.',
        'Industrial-heavy or low-activity zones can reduce this signal because there may be fewer people around at different times of day.',
      ],
      details: [
        `Zoning features used: ${Number.isFinite(zoneCount) ? zoneCount : 0}`,
        `This contributes ${zoningWeight}% of the safety score.`,
        missingZoning ? 'Zoning data was missing, so crime context was used as the fallback.' : 'Zoning data available.',
      ],
    },
  ]

  const greenScore = Number(environment?.scores?.green)
  const heatScore = Number(environment?.scores?.heat)
  const zoningComfortScore = Number(environment?.scores?.zoning)
  const airQualityScore = Number(environment?.scores?.airQuality)
  const envRaw = environment?.rawData || {}
  const envWeights = environment?.weights || {}
  const envZoneMix = (envRaw.zoneMix || [])
    .map((zone) => `${zone.label} (${zone.count})`)
    .join(', ')
  const greenWeight = Math.round(Number(envWeights.green ?? 0.35) * 100)
  const heatWeight = Math.round(Number(envWeights.heat ?? 0.30) * 100)
  const zoningEnvWeight = Math.round(Number(envWeights.zoning ?? 0.15) * 100)
  const airWeight = Math.round(Number(envWeights.airQuality ?? 0.20) * 100)

  const environmentFactors = [
    {
      name: 'Green coverage',
      score: greenScore,
      met: greenScore >= 60,
      summary: Number.isFinite(greenScore) ? `${greenScore}/100` : 'Unavailable',
      plainText: Number.isFinite(greenScore)
        ? `Green coverage scores ${greenScore}/100 using vegetation-cover features inside the selected range. Higher vegetation cover generally means more shade, cooler streets and more comfortable outdoor movement.`
        : 'Green coverage is unavailable for this area.',
      impact: getImpactText(greenScore, 'Environment'),
      lines: [
        describeScore(
          greenScore,
          'Vegetation cover looks strong for the selected range.',
          'Vegetation cover looks reasonably supportive.',
          'Vegetation cover is present but not a standout strength.',
          'Vegetation cover is limited, so shade and greenery may be harder to find.',
        ),
        `On average, about ${formatDecimal(envRaw.avgGreen)}% of the measured nearby land has vegetation cover.`,
        describeVegetationRange(envRaw.minGreen, envRaw.maxGreen),
      ],
      details: [
        describeFeatureConfidence(envRaw.vegetationCount, 'vegetation'),
        `This contributes ${greenWeight}% of the environment score.`,
        environment?.missingData?.green ? 'Green data was missing, so a neutral fallback was used.' : 'Green data available.',
      ],
    },
    {
      name: 'Urban heat',
      score: heatScore,
      met: heatScore >= 60,
      summary: Number.isFinite(heatScore) ? `${heatScore}/100` : 'Unavailable',
      plainText: Number.isFinite(heatScore)
        ? `Urban heat scores ${heatScore}/100 using urban heat island measurements inside the selected range. Higher scores mean the area is cooler relative to hotter built-up places.`
        : 'Urban heat is unavailable for this area.',
      impact: getImpactText(heatScore, 'Environment'),
      lines: [
        describeScore(
          heatScore,
          'Heat exposure looks low, which supports outdoor comfort.',
          'Heat exposure looks manageable for everyday outdoor activity.',
          'Heat exposure is mixed and may vary by street or time of day.',
          'Heat exposure looks high, so hot days may feel less comfortable here.',
        ),
        `The average heat reading is ${formatDecimal(envRaw.avgHeat)}, where higher values mean stronger heat-island effect.`,
        describeHeatRange(envRaw.minHeat, envRaw.maxHeat),
      ],
      details: [
        describeFeatureConfidence(envRaw.heatCount, 'heat'),
        `This contributes ${heatWeight}% of the environment score.`,
        environment?.missingData?.heat ? 'Heat data was missing, so a neutral fallback was used.' : 'Heat data available.',
      ],
    },
    {
      name: 'Environmental zoning comfort',
      score: zoningComfortScore,
      met: zoningComfortScore >= 60,
      summary: Number.isFinite(zoningComfortScore) ? `${zoningComfortScore}/100` : 'Unavailable',
      plainText: Number.isFinite(zoningComfortScore)
        ? `Environmental zoning comfort scores ${zoningComfortScore}/100 from nearby land-use types. Parks and residential zones usually support comfort, while industrial or heavily commercial zones can reduce it.`
        : 'Environmental zoning comfort is unavailable for this area.',
      impact: getImpactText(zoningComfortScore, 'Environment'),
      lines: [
        describeScore(
          zoningComfortScore,
          'The land-use mix looks strongly supportive for environmental comfort.',
          'The land-use mix is generally supportive for environmental comfort.',
          'The land-use mix is varied, so comfort may change across the area.',
          'The land-use mix may reduce environmental comfort in this selected range.',
        ),
        envZoneMix
          ? `The most common nearby land uses are ${envZoneMix}, which helps explain whether the area is mostly park, residential, commercial or industrial in character.`
          : 'No detailed zoning mix was returned for this area.',
      ],
      details: [
        describeFeatureConfidence(envRaw.zoningCount, 'zoning'),
        `This contributes ${zoningEnvWeight}% of the environment score.`,
        environment?.missingData?.zoning ? 'Zoning data was missing, so a neutral fallback was used.' : 'Zoning data available.',
      ],
    },
    {
      name: 'Air quality',
      score: airQualityScore,
      met: airQualityScore >= 60,
      summary: Number.isFinite(airQualityScore) ? `${airQualityScore}/100` : 'Unavailable',
      plainText: Number.isFinite(airQualityScore)
        ? `Air quality scores ${airQualityScore}/100 using the nearest available EPA air-quality signal. This helps capture current breathing comfort, which vegetation and heat data cannot fully explain.`
        : 'Air quality is unavailable for this area.',
      impact: getImpactText(airQualityScore, 'Environment'),
      lines: [
        describeScore(
          airQualityScore,
          'Air quality looks strong for daily outdoor activity.',
          'Air quality looks generally suitable for daily activity.',
          'Air quality is mixed, so sensitive users may want to check live conditions.',
          'Air quality may need more caution, especially for sensitive users.',
        ),
        envRaw.airQualitySite
          ? `The nearest air-quality reading comes from ${envRaw.airQualitySite}, so it is a nearby signal rather than a sensor on this exact street.`
          : 'Nearest air quality site was not returned.',
      ],
      details: [
        `Source: ${envRaw.airQualitySource || 'Air quality dataset'}`,
        `This contributes ${airWeight}% of the environment score.`,
        environment?.missingData?.airQuality ? 'Air-quality data was missing, so a neutral fallback was used.' : 'Air-quality data available.',
      ],
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
      scoreExplanation: `Safety combines recorded-crime context (${crimeWeight}%), street activity and passive surveillance (${activityWeight}%), noise and traffic comfort (${noiseWeight}%), public transport stop comfort (${transportWeight}%) and land-use zoning (${zoningWeight}%) in the selected ${rangeMinutes}-minute range. The mix can be reweighted automatically when a signal is unavailable.`,
    },
    environment: {
      category: 'environment',
      factors: environmentFactors,
      takeaway: summarizeCategory('environment', environmentFactors),
      scoreExplanation: `Environment combines vegetation cover (${greenWeight}%), urban heat (${heatWeight}%), air quality (${airWeight}%) and zoning comfort (${zoningEnvWeight}%) in the selected ${rangeMinutes}-minute range.`,
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
    const duration = 1800
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
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: 'Figtree, sans-serif', fontSize: size * 0.26, fontWeight: 900, fill: dark ? '#fff' : '#1a2436' }}>
        {displayed}
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

function CompareBar({ value, avg, color, label = 'Avg' }) {
  const hasAvg = Number.isFinite(Number(avg))
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'rgba(0,0,0,0.07)' }}>
        {hasAvg && (
          <div style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${avg}%`, background: 'rgba(0,0,0,0.25)', borderRadius: 1, zIndex: 2 }} />
        )}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${value ?? 0}%`, background: color, borderRadius: 5 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
        <span>This area: <span style={{ color, fontWeight: 800 }}>{value ?? '–'}</span></span>
        <span>{label}: {hasAvg ? avg : 'loading'}</span>
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
          {factor.preview ? (
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 1.35 }}>
              {factor.preview}
            </p>
          ) : null}
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

function CategoryAccordion({ groups, color, soft, border }) {
  const [openGroup, setOpenGroup] = useState(groups.length > 0 ? groups[0].title : null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {groups.map((group) => {
        const isOpen = openGroup === group.title
        return (
          <section key={group.title} aria-label={group.title}>
            <button
              onClick={() => setOpenGroup(isOpen ? null : group.title)}
              aria-expanded={isOpen}
              style={{
                all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '9px 0', cursor: 'pointer', boxSizing: 'border-box',
                borderBottom: `1px solid ${isOpen ? color : 'rgba(15,23,42,0.08)'}`,
              }}
              onFocus={e => { e.currentTarget.style.outline = `2px solid ${color}`; e.currentTarget.style.outlineOffset = '2px' }}
              onBlur={e => { e.currentTarget.style.outline = 'none' }}
            >
              <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: isOpen ? color : '#6b7280' }}>
                {group.title} <span style={{ fontWeight: 600, color: '#9ca3af', textTransform: 'none', letterSpacing: 0 }}>({group.factors.length})</span>
              </p>
              <span style={{ fontSize: 14, color: isOpen ? color : '#9ca3af' }} aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
            </button>
            {isOpen && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
                {group.factors.map((f) => (
                  <IndicatorCard key={f.name} factor={f} color={color} soft={soft} border={border} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
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

function formatSafePercent(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'Unavailable'
  return `${Math.round(n * 10) / 10}%`
}

function formatMoney(value, suffix) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Unavailable'
  return `$${Math.round(n).toLocaleString('en-AU')}${suffix}`
}

function weeklyToMonthly(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return (n * 365) / 7 / 12
}

function getIndicatorMetric(indicators, category, namePart) {
  const factor = findIndicator(indicators, category, namePart)
  if (!factor) return null

  const status = getIndicatorStatus(factor.score)
  const nearest = factor.details?.find((line) => line.startsWith('Nearest place:'))?.replace('Nearest place:', '').trim()
  const availability = factor.details?.find((line) => line.startsWith('Availability:'))?.replace('Availability:', '').trim()

  return {
    label: factor.name,
    value: status.label,
    detail: [nearest && `Nearest: ${nearest}`, availability].filter(Boolean).join(' | '),
    score: Number.isFinite(Number(factor.score)) ? `${Math.round(Number(factor.score))}/100` : 'Unavailable',
  }
}

function buildSituationEnrichment(userProfile, profile, indicators) {
  if (userProfile?.elderly) {
    return buildElderlyEnrichment(profile, indicators)
  }

  if (userProfile?.petOwner) {
    return buildPetEnrichment(profile, indicators)
  }

  if (userProfile?.familyWithChildren) {
    return buildFamilyEnrichment(profile, indicators)
  }

  return null
}

function buildFamilyEnrichment(profile, indicators) {
  const stats = [
    { label: 'Children 0-14', value: formatSafePercent(profile.age0To14Pct) },
    { label: 'Family households', value: formatSafePercent(profile.familyHouseholdsPct) },
    { label: 'One-parent families', value: formatSafePercent(profile.oneParentFamilyPct) },
    {
      label: 'Average household size',
      value: profile.averageHouseholdSize != null ? `${profile.averageHouseholdSize} people` : 'Unavailable',
    },
  ].filter((item) => item.value !== 'Unavailable')

  const nearby = [
    getIndicatorMetric(indicators, 'accessibility', 'school'),
    getIndicatorMetric(indicators, 'accessibility', 'park'),
  ].filter(Boolean)

  if (!stats.length && !nearby.length) return null

  const children = formatSafePercent(profile.age0To14Pct)
  const families = formatSafePercent(profile.familyHouseholdsPct)
  const oneParent = formatSafePercent(profile.oneParentFamilyPct)
  const summaryParts = []

  if (children !== 'Unavailable') {
    summaryParts.push(`${children} of residents are aged 0-14`)
  }
  if (families !== 'Unavailable') {
    summaryParts.push(`${families} of households are family households`)
  }
  if (oneParent !== 'Unavailable') {
    summaryParts.push(`${oneParent} are one-parent families`)
  }

  return {
    label: 'Family and children context',
    tone: {
      background: '#fff7ed',
      border: '#fed7aa',
      accent: '#ea580c',
      label: '#c2410c',
      text: '#7c2d12',
      strong: '#431407',
    },
    stats,
    nearby,
    summary: summaryParts.length
      ? `${summaryParts.join(', ')}.`
      : 'Family-related Census indicators are shown below where available.',
  }
}

function buildElderlyEnrichment(profile, indicators) {
  const stats = [
    { label: 'Residents 65+', value: formatSafePercent(profile.age65PlusPct) },
    { label: 'Need assistance', value: formatSafePercent(profile.needForAssistancePct) },
    { label: 'Lone-person households', value: formatSafePercent(profile.lonePersonHouseholdsPct) },
    { label: 'No-car households', value: formatSafePercent(profile.noCarHouseholdsPct) },
  ].filter((item) => item.value !== 'Unavailable')

  const nearby = [
    getIndicatorMetric(indicators, 'accessibility', 'hospital'),
    getIndicatorMetric(indicators, 'accessibility', 'bus'),
    getIndicatorMetric(indicators, 'accessibility', 'train'),
  ].filter(Boolean)

  if (!stats.length && !nearby.length) return null

  const olderResidents = formatSafePercent(profile.age65PlusPct)
  const assistance = formatSafePercent(profile.needForAssistancePct)
  const noCar = formatSafePercent(profile.noCarHouseholdsPct)
  const summaryParts = []

  if (olderResidents !== 'Unavailable') {
    summaryParts.push(`${olderResidents} of residents are aged 65+`)
  }
  if (assistance !== 'Unavailable') {
    summaryParts.push(`${assistance} report needing assistance`)
  }
  if (noCar !== 'Unavailable') {
    summaryParts.push(`${noCar} of households have no car`)
  }

  return {
    label: 'Older resident context',
    tone: {
      background: '#eff6ff',
      border: '#bfdbfe',
      accent: '#2563eb',
      label: '#1d4ed8',
      text: '#1e3a8a',
      strong: '#172554',
    },
    stats,
    nearby,
    summary: summaryParts.length
      ? `${summaryParts.join(', ')}.`
      : 'Older-resident Census indicators are shown below where available.',
  }
}

function buildPetEnrichment(profile, indicators) {
  const dogPark = getIndicatorMetric(indicators, 'accessibility', 'dog park')
  if (!dogPark) return null

  return {
    label: 'Pet owner context',
    tone: {
      background: '#f0fdf4',
      border: '#bbf7d0',
      accent: '#16a34a',
      label: '#15803d',
      text: '#166534',
      strong: '#14532d',
    },
    stats: [],
    nearby: [dogPark],
    summary: 'Dog park access is the clearest pet-specific signal available for this area.',
  }
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

function getInsightPriority(item, userProfile) {
  const title = String(item?.title || '').toLowerCase()

  if (userProfile?.familyWithChildren) {
    if (title.includes('household')) return 0
    if (title.includes('housing')) return 1
    if (title.includes('rental') || title.includes('ownership')) return 2
    return null
  }

  if (userProfile?.elderly) {
    if (title.includes('older')) return 0
    if (title.includes('transport')) return 1
    if (title.includes('household')) return 2
    if (title.includes('housing')) return 3
    return null
  }

  if (userProfile?.petOwner) {
    if (title.includes('housing')) return 0
    if (title.includes('rental') || title.includes('ownership')) return 1
    return null
  }

  return 0
}

function getStatPriority(stat, userProfile) {
  if (userProfile?.familyWithChildren) {
    const priority = {
      population: 0,
      medianAge: 1,
      medianRent: 2,
      medianMortgage: 3,
      renters: 4,
    }
    return priority[stat.key] ?? null
  }

  if (userProfile?.elderly) {
    const priority = {
      residents65: 0,
      medianAge: 1,
      publicTransport: 2,
      medianRent: 3,
      medianMortgage: 4,
      population: 5,
    }
    return priority[stat.key] ?? null
  }

  if (userProfile?.petOwner) {
    const priority = {
      renters: 0,
      medianRent: 1,
      medianMortgage: 2,
      population: 3,
    }
    return priority[stat.key] ?? null
  }

  return 0
}

function CensusContextSection({ data, loading, userProfile, indicators }) {
  const profile = data?.profile || {}
  const source = data?.source || {}
  const situationHighlight =
    !loading && data?.available ? getSituationCensusHighlight(userProfile, profile) : null
  const situationEnrichment =
    !loading && data?.available ? buildSituationEnrichment(userProfile, profile, indicators) : null
  const stats = [
    { key: 'population', label: 'Population', value: formatNumber(profile.totalPopulation) },
    { key: 'medianAge', label: 'Median age', value: profile.medianAge != null ? `${profile.medianAge}` : 'Unavailable' },
    { key: 'renters', label: 'Renters', value: formatPercent(profile.rentersPct) },
    { key: 'medianRent', label: 'Median rent', value: formatMoney(profile.medianRentMonthly ?? weeklyToMonthly(profile.medianRentWeekly), ' / month') },
    { key: 'medianMortgage', label: 'Median mortgage', value: formatMoney(profile.medianMortgageMonthly, ' / month') },
    { key: 'publicTransport', label: 'Public transport to work', value: formatPercent(profile.publicTransportToWorkPct) },
    { key: 'residents65', label: 'Residents 65+', value: formatPercent(profile.age65PlusPct) },
  ].map((stat, index) => ({ ...stat, index, priority: getStatPriority(stat, userProfile) }))
    .filter((stat) => !userProfile || stat.priority !== null)
    .sort((a, b) => (a.priority - b.priority) || (a.index - b.index))
  const orderedInsights = [...(data?.insights || [])]
    .map((item, index) => ({ item, index, priority: getInsightPriority(item, userProfile) }))
    .filter((entry) => !userProfile || entry.priority !== null)
    .sort((a, b) => (a.priority - b.priority) || (a.index - b.index))
    .map((entry) => entry.item)

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

              {situationEnrichment && (
                <div style={{
                  background: situationEnrichment.tone.background,
                  border: `1px solid ${situationEnrichment.tone.border}`,
                  borderLeft: `4px solid ${situationEnrichment.tone.accent}`,
                  borderRadius: 14,
                  padding: '16px',
                  marginBottom: 18,
                }}>
                  <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: situationEnrichment.tone.label, marginBottom: 5 }}>
                    {situationEnrichment.label}
                  </p>
                  <p style={{ fontSize: 13, color: situationEnrichment.tone.text, lineHeight: 1.65, fontWeight: 650, marginBottom: 12 }}>
                    {situationEnrichment.summary}
                  </p>
                  {situationEnrichment.stats.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                      gap: 10,
                      marginBottom: situationEnrichment.nearby.length ? 12 : 0,
                    }}>
                      {situationEnrichment.stats.map((item) => (
                        <div key={item.label} style={{
                          background: '#fff',
                          border: `1px solid ${situationEnrichment.tone.border}`,
                          borderRadius: 12,
                          padding: '10px 12px',
                        }}>
                          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: situationEnrichment.tone.text, marginBottom: 4 }}>
                            {item.label}
                          </p>
                          <p style={{ fontSize: 16, fontWeight: 900, color: situationEnrichment.tone.strong }}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {situationEnrichment.nearby.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                      {situationEnrichment.nearby.map((item) => (
                        <div key={item.label} style={{
                          background: '#fff',
                          border: `1px solid ${situationEnrichment.tone.border}`,
                          borderRadius: 12,
                          padding: '11px 12px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                            <p style={{ fontSize: 12, fontWeight: 900, color: situationEnrichment.tone.text }}>{item.label}</p>
                            <p style={{ fontSize: 11, fontWeight: 900, color: situationEnrichment.tone.label }}>{item.score}</p>
                          </div>
                          <p style={{ fontSize: 12, color: situationEnrichment.tone.text, lineHeight: 1.5, fontWeight: 700 }}>{item.value}</p>
                          {item.detail && (
                            <p style={{ fontSize: 11, color: situationEnrichment.tone.text, lineHeight: 1.45, marginTop: 4 }}>{item.detail}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
                {orderedInsights.map((item) => (
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

// ── Similar Suburbs ─────────────────────────────────────────────────────────

function CouncilLinksSection({ data, loading }) {
  const links = data?.links || []

  return (
    <div style={{
      background: '#fff',
      border: '1.5px solid #e5e7eb',
      borderRadius: 20,
      overflow: 'hidden',
      marginBottom: 28,
      boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
    }} role="region" aria-label="Council plans and development sources">
      <div style={{
        background: 'linear-gradient(90deg, #12312c, #1f4e45)',
        padding: '18px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>
            Official sources
          </p>
          <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 24, fontWeight: 400, color: '#fff', margin: 0 }}>
            Council plans and development links
          </h2>
        </div>
        {data?.lgaName && (
          <span style={{
            flexShrink: 0,
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.24)',
            borderRadius: 999,
            padding: '6px 12px',
            color: '#fff',
            fontSize: 12,
            fontWeight: 800,
          }}>
            {data.lgaName}
          </span>
        )}
      </div>

      <div style={{ padding: '22px 24px' }}>
        {loading ? (
          <LinearProgress sx={{ borderRadius: 2, height: 5, bgcolor: '#ccfbf1', '& .MuiLinearProgress-bar': { bgcolor: '#0f766e' } }} />
        ) : links.length > 0 ? (
          <>
            {data?.available ? (
              <p style={{ fontSize: 15, color: '#334155', lineHeight: 1.65, marginBottom: 16 }}>
                Use these official council and Victorian Government sources to check projects, planning controls,
                permits, strategies and long-term local plans for this area.
              </p>
            ) : (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 16,
              }}>
                <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.65 }}>
                  {data?.message || 'Council-specific links are not available for this area yet. Victorian planning sources are still available below.'}
                </p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
              {links.map((item) => (
                <a
                  key={`${item.key}-${item.url}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: '16px 18px',
                    background: '#fff',
                    minHeight: 145,
                    transition: 'border-color 0.16s, box-shadow 0.16s, transform 0.16s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#0f766e'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,118,110,0.1)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 7 }}>
                    {item.source}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', lineHeight: 1.3, marginBottom: 8 }}>
                    {item.title}
                  </p>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.55, marginBottom: 12 }}>
                    {item.description}
                  </p>
                  <span style={{ fontSize: 13, color: '#0f766e', fontWeight: 900 }}>
                    Open official source
                  </span>
                </a>
              ))}
            </div>
            <p style={{ marginTop: 16, fontSize: 13, color: '#64748b', lineHeight: 1.55 }}>
              These links are curated source pages, not a prediction or summary of future developments.
              Confirm property-specific details through official planning registers.
            </p>
          </>
        ) : (
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e5e7eb',
            borderRadius: 14,
            padding: '16px 18px',
          }}>
            <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.65 }}>
              {data?.message || 'Council-specific links are not available for this area yet.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}



const SIM_DISTANCE_FILTERS = [5, 10, 15]



function SimilarSuburbs({
  recommendations,
  loading,
  error,
  rangeMinutes,
  profile,
  selectedLocation,
  returnContext,
}) {
  const navigate = useNavigate()
  const [recReplaceModal, setRecReplaceModal] = useState(null)
  const [compareHint, setCompareHint] = useState(null)

  const [compareList, setCompareList] = useState(() => loadCompareList())

  useEffect(() => {
    const refresh = () => setCompareList(loadCompareList())
    window.addEventListener(getCompareUpdatedEventName(), refresh)
    return () => window.removeEventListener(getCompareUpdatedEventName(), refresh)
  }, [])

  const compareNames = useMemo(
    () =>
      new Set(
        compareList.map((x) =>
          String(x.locationName || x.displayName || x.name || '').toLowerCase()
        )
      ),
    [compareList]
  )

  const visibleSuburbs = useMemo(() => {
    return (recommendations || []).slice(0, 3).map((item) => {
      const name =
        item.suburbLabel ||
        item.suburbName ||
        item.name ||
        item.suburb ||
        item.displayName ||
        'Unknown suburb'

      const score =
        item.scores?.liveability ??
        item.liveabilityScore ??
        item.score ??
        item.overallScore ??
        item.scores?.overall ??
        null

      return {
        ...item,
        name,
        displayName: name,
        lat: Number(item.latitude ?? item.lat),
        lng: Number(item.longitude ?? item.lng),
        score: Number(score),
        match: Number(item.recommendationScore ?? item.match ?? item.matchScore ?? 0),
        dist: Number(item.distanceKm ?? item.dist ?? item.distance ?? 0),
        reason: item.reason || '',
      }
    }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
  }, [recommendations])

  function handleAddToCompare(s) {
    const item = {
      displayName: s.displayName || s.name,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      rangeMinutes,
      profile,
    }

    const result = addToCompareList(item)

    if (result?.reason === 'ALREADY_EXISTS') {
      setCompareHint('Already in compare list.')
      setTimeout(() => setCompareHint(null), 2500)
      return
    }

    if (result?.reason === 'COMPARE_FULL') {
      setRecReplaceModal({
        pendingItem: item,
        currentList: result.current,
      })
      return
    }

    setCompareHint('Added to compare.')
    setTimeout(() => setCompareHint(null), 2500)
  }

  function handleViewInsights(s) {
    const selectedRecommendedLocation = {
      name: s.name || s.suburbName,
      displayName: s.displayName || s.suburbLabel || s.name || s.suburbName,
      lat: s.lat ?? s.latitude,
      lng: s.lng ?? s.longitude,
      type: 'suburb',
      placeType: 'suburb',
    }

    const nextContext = {
      selectedLocation: selectedRecommendedLocation,
      rangeMinutes,
      profile,

      // This tells the next Insight page to go back to the current Insight page
      returnContext: {
        type: 'insight',
        selectedLocation,
        rangeMinutes,
        profile,

        // Keep the previous back path, e.g. current Insight can still go back to Map
        returnContext: returnContext || null,
      },
    }

    saveContext(nextContext)
    navigate('/insights', { state: nextContext })
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 5 }}>
          Similar Suburbs
        </p>

        <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 'clamp(18px, 2.8vw, 24px)', fontWeight: 400, color: '#1a2436', margin: '0 0 3px', lineHeight: 1.2 }}>
          Suburbs with a similar profile
        </h2>

        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
          Based on backend recommendation results
        </p>

        {compareHint && (
          <p style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#059669' }}>
            {compareHint}
          </p>
        )}
      </div>

      {loading && (
        <div style={{
          background: '#fff',
          border: '1.5px solid #e5e7eb',
          borderRadius: 16,
          padding: 18,
        }}>
          <p style={{ fontSize: 13, color: '#6b7280', fontWeight: 700 }}>
            Loading recommendations...
          </p>
        </div>
      )}

      {!loading && error && (
        <div style={{
          background: '#fff7ed',
          border: '1.5px solid #fed7aa',
          borderRadius: 16,
          padding: 18,
        }}>
          <p style={{ fontSize: 13, color: '#9a3412', fontWeight: 700 }}>
            {error}
          </p>
        </div>
      )}

      {!loading && !error && visibleSuburbs.length === 0 && (
        <div style={{
          background: '#fff',
          border: '1.5px solid #e5e7eb',
          borderRadius: 16,
          padding: 18,
        }}>
          <p style={{ fontSize: 13, color: '#6b7280', fontWeight: 700 }}>
            No recommended suburbs found for this area.
          </p>
        </div>
      )}

      {!loading && !error && visibleSuburbs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {visibleSuburbs.map((s) => {
            const sb = getScoreBand(s.score)
            const inList = compareNames.has(String(s.name).toLowerCase())

            return (
              <div
                key={`${s.name}-${s.lat}-${s.lng}`}
                style={{
                  background: '#fff',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 16,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  transition: 'box-shadow 0.2s, transform 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.transform = 'none'
                }}
              >
                <svg width="72" height="72" viewBox="0 0 72 72" style={{ flexShrink: 0 }}>
                  <circle cx="36" cy="36" r="30" fill="none" stroke="#e5e7eb" strokeWidth="5" />
                  <circle
                    cx="36"
                    cy="36"
                    r="30"
                    fill="none"
                    stroke={sb.color}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 30}
                    strokeDashoffset={
                      Number.isFinite(s.score)
                        ? 2 * Math.PI * 30 - (s.score / 100) * 2 * Math.PI * 30
                        : 2 * Math.PI * 30
                    }
                    transform="rotate(-90 36 36)"
                  />
                  <text
                    x="36"
                    y="32"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={sb.color}
                    fontSize="21"
                    fontFamily="'DM Serif Display', Georgia, serif"
                    fontWeight="400"
                  >
                    {Number.isFinite(s.score) ? Math.round(s.score) : '–'}
                  </text>
                  <text x="36" y="51" textAnchor="middle" fill="#9ca3af" fontSize="7" fontWeight="800" letterSpacing="1">
                    SCORE
                  </text>
                </svg>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <p style={{ fontWeight: 800, fontSize: 15, color: '#1a2436', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </p>

                    {Number.isFinite(s.match) && s.match > 0 && (
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', borderRadius: 999, padding: '2px 8px' }}>
                        {Math.round(s.match)}%
                      </span>
                    )}
                  </div>

                  {Number.isFinite(s.dist) && s.dist > 0 && (
                    <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                      {s.dist.toFixed(1)} km away
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => {
                        if (!inList) handleAddToCompare(s)
                      }}
                      disabled={inList}
                      style={{
                        all: 'unset',
                        cursor: inList ? 'default' : 'pointer',
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        border: inList ? '1.5px solid #a7f3d0' : '1.5px solid #e5e7eb',
                        background: inList ? '#ecfdf5' : '#fff',
                        color: inList ? '#059669' : '#374151',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {inList ? '✓ In Compare List' : 'Add to Compare'}
                    </button>

                    <button
                      onClick={() => handleViewInsights(s)}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #f59648 0%, #f47c20 100%)',
                        color: '#fff',
                      }}
                    >
                      View Insights →
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Replace modal for compare */}
      {recReplaceModal && (
        <CompareReplaceModal
          pendingItem={recReplaceModal.pendingItem}
          currentList={recReplaceModal.currentList}
          onReplace={(index) => {
            replaceCompareArea(index, recReplaceModal.pendingItem)
            setRecReplaceModal(null)
            setCompareHint('Compare area replaced.')
            setTimeout(() => setCompareHint(null), 2500)
          }}
          onClose={() => setRecReplaceModal(null)}
        />
      )}
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
  const returnContext = context?.returnContext

  const [overallScore, setOverallScore] = useState(null)
  const [scores, setScores] = useState(null)
  const [scoreWeights, setScoreWeights] = useState(null)
  const [indicators, setIndicators] = useState({})
  const [loading, setLoading] = useState(true)
  const [censusLoading, setCensusLoading] = useState(true)
  const [censusData, setCensusData] = useState(null)
  const [councilLinksLoading, setCouncilLinksLoading] = useState(true)
  const [councilLinksData, setCouncilLinksData] = useState(null)
  const [heroBarReady, setHeroBarReady] = useState(false)
  const [selectedBreakdownCategory, setSelectedBreakdownCategory] = useState(null)
  const [heroCompareAdded, setHeroCompareAdded] = useState(null) // 'added' | 'duplicate' | 'full' | null
  const [compareReplacePending, setCompareReplacePending] = useState(null) // { pendingItem, currentList }
  const [showConditionsModal, setShowConditionsModal] = useState(false)
  const [recommendations, setRecommendations] = useState([])
  const [recommendationsLoading, setRecommendationsLoading] = useState(true)
  const [recommendationsError, setRecommendationsError] = useState(null)

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
        setCouncilLinksLoading(true)
        setRecommendationsLoading(true)
        setRecommendationsError(null)
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

    const councilLinksP = getCouncilLinksForLocation(selectedLocation).catch((err) => {
      console.error('Council links load error:', err)
      return {
        available: false,
        message: 'Council planning links could not be loaded for this location.',
        links: [],
      }
    })

    const recommendationsP = getInsightRecommendations({
      lat,
      lng,
      time: rangeMinutes,
      persona: profile || 'default',
    }).catch((err) => {
      console.error('Insight recommendations load error:', err)
      setRecommendationsError('Recommendations could not be loaded.')
      return {
        recommendations: [],
      }
    })

    Promise.all([scoreP, censusP, councilLinksP, recommendationsP])
      .then(([scoreData, censusProfile, councilLinks, recommendationsData]) => {
        if (cancelled) return

        setOverallScore(scoreData.liveabilityScore)
        setScores(scoreData.scores || null)
        setScoreWeights(scoreData.weights || null)
        setIndicators(buildIndicatorMapFromBreakdown(scoreData.breakdown || {}, rangeMinutes))
        setCensusData(censusProfile)
        setCouncilLinksData(councilLinks)

        setRecommendations(
          recommendationsData?.recommendations ||
          recommendationsData?.data ||
          []
        )
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setCensusLoading(false)
          setCouncilLinksLoading(false)
          setRecommendationsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [locationName, rangeMinutes, profile, selectedLocation])

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setHeroBarReady(true), 150)
      return () => clearTimeout(t)
    }
    setHeroBarReady(false)
  }, [loading])

  useEffect(() => {
    if (!selectedBreakdownCategory) return
    const onKey = (e) => { if (e.key === 'Escape') setSelectedBreakdownCategory(null) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [selectedBreakdownCategory])

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
  const situationHighlights = buildSituationHighlights(profile, scores, indicators)
  const benchmarkScores = STATIC_SCORE_BENCHMARK.scores
  const benchmarkShortLabel = STATIC_SCORE_BENCHMARK.label
  const benchmarkTextLabel = 'supported locality average'
  const interpretationSummary = buildInterpretationSummary(scores, profileLabel, rangeMinutes, benchmarkScores)
  const breakdownCategories = selectedBreakdownCategory ? [selectedBreakdownCategory] : []

  function handleBack() {
    // Case 1: Insight → Insight
    // Example: South Wharf Insight → Melbourne 3000 Insight
    if (returnContext?.type === 'insight' && returnContext?.selectedLocation) {
      const previousContext = {
        selectedLocation: returnContext.selectedLocation,
        rangeMinutes: returnContext.rangeMinutes || rangeMinutes || 20,
        profile: returnContext.profile || profile || 'default',

        // Keep the earlier return context.
        // After going back to Melbourne 3000, Melbourne 3000 still needs to know
        // that its previous page was the Map page.
        returnContext: returnContext.returnContext || null,
      }

      saveContext(previousContext)

      navigate('/insights', {
        state: previousContext,
      })

      return
    }

    // Case 2: Map → Insight
    // Example: Melbourne 3000 Insight → Map
    if (returnContext?.type === 'map' && returnContext?.selectedLocation) {
      navigate('/map', {
        state: {
          selectedLocation: returnContext.selectedLocation,
          rangeMinutes: returnContext.rangeMinutes || rangeMinutes || 20,
          profile: returnContext.profile || profile || 'default',
        },
      })

      return
    }

    // Fallback:
    // If there is no returnContext but the current page still has a selected location,
    // go back to the Map page using the current selected location.
    if (selectedLocation) {
      navigate('/map', {
        state: {
          selectedLocation,
          rangeMinutes: rangeMinutes || 20,
          profile: profile || 'default',
        },
      })

      return
    }

    // Final fallback:
    // If there is no location or return context, go back to the Home page.
    navigate('/')
  }

  const previousLocationName =
      returnContext?.selectedLocation?.displayName ||
      returnContext?.selectedLocation?.locationName ||
      returnContext?.selectedLocation?.name ||
      null

  return (
    <div style={{ background: '#f5f0eb', minHeight: '100%', paddingBottom: 80 }}>
      <LoadingOverlay fixed={true} show={loading} label="Loading neighbourhood insights…" />

      <nav aria-label="Page navigation" style={{
        position: 'sticky', top: 64, zIndex: 50,
        background: 'rgba(245,240,235,0.95)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        padding: '12px 40px', display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button
          onClick= {handleBack}
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
          <p style={{
            fontWeight: 800,
            fontSize: 16,
            color: '#1a2436',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {locationName}
          </p>

          {previousLocationName && (
            <p style={{
              fontSize: 12,
              color: '#6b7280',
              marginTop: 4,
              fontWeight: 600
            }}>
              Back to {previousLocationName}
            </p>
          )}

          <p style={{ fontSize: 13, color: '#4b5563', marginTop: 3 }}>
            Liveability breakdown · {rangeMinutes} min range{profileLabel ? ` · ${profileLabel}` : ''}
          </p>
        </div>
        <button
          onClick={() => setShowConditionsModal(true)}
          aria-label="Change conditions"
          style={{
            all: 'unset', cursor: 'pointer', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 9,
            border: '1px solid rgba(0,0,0,0.12)', background: '#fff',
            fontSize: 13, fontWeight: 700, color: '#374151',
            transition: 'border-color 0.15s, background 0.15s',
            fontFamily: 'Figtree, sans-serif',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#f47c20'; e.currentTarget.style.background = '#fff7ed' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.background = '#fff' }}
        >
          <span aria-hidden="true">⚙</span> Change Conditions
        </button>
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

        {/* Hero score card — dark navy reference design */}
        <div style={{
          borderRadius: 24, overflow: 'hidden', marginBottom: 20,
          background: 'linear-gradient(140deg, #12122a 0%, #1a1a3e 40%, #0d2d52 100%)',
          position: 'relative',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        }}>
          {/* Subtle dot texture */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.028) 1px, transparent 1px)',
            backgroundSize: '26px 26px', pointerEvents: 'none',
          }} />
          <div style={{ bottom: 0, left: 0, right: 0, height: 60, position: 'absolute',
            background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.15))', pointerEvents: 'none' }} />

          <div style={{ padding: '22px 28px', position: 'relative' }}>
            <style>{`
              @media (max-width: 620px) {
                .nw-hero-grid-new { grid-template-columns: 1fr !important; gap: 24px !important; }
                .nw-score-big { font-size: 72px !important; }
              }
            `}</style>
            <div className="nw-hero-grid-new" style={{
              display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 28, alignItems: 'center',
            }}>

              {/* LEFT — location + animated circle gauge + metadata */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                  Liveability Insights · Melbourne
                </p>
                <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 'clamp(20px, 2.8vw, 32px)', fontWeight: 400, color: '#fff', lineHeight: 1.0, margin: '0 0 1px', letterSpacing: '-0.3px' }}>
                  {locationName.split(',')[0] || locationName}
                </h1>
                <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 'clamp(13px, 1.8vw, 18px)', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', margin: '0 0 14px' }}>
                  VIC
                </p>

                {/* Gauge + metadata side by side */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>

                  {/* Animated circle gauge */}
                  {(() => {
                    const R = 52
                    const circ = 2 * Math.PI * R
                    const offset = (heroBarReady && overallScore != null) ? circ * (1 - overallScore / 100) : circ
                    const gaugeColor = band?.color || '#f47c20'
                    return (
                      <svg width="136" height="136" viewBox="0 0 136 136" style={{ flexShrink: 0, overflow: 'visible' }} aria-hidden="true">
                        <circle cx="68" cy="68" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="9" />
                        <circle cx="68" cy="68" r={R} fill="none"
                          stroke={gaugeColor} strokeWidth="9"
                          strokeLinecap="round" opacity="0.22"
                          strokeDasharray={circ} strokeDashoffset={offset}
                          transform="rotate(-90 68 68)"
                          style={{ filter: 'blur(4px)', transition: `stroke-dashoffset 1.5s cubic-bezier(0.22, 1, 0.36, 1)` }}
                        />
                        <circle cx="68" cy="68" r={R} fill="none"
                          stroke={gaugeColor} strokeWidth="9"
                          strokeLinecap="round"
                          strokeDasharray={circ} strokeDashoffset={offset}
                          transform="rotate(-90 68 68)"
                          style={{ transition: `stroke-dashoffset 1.5s cubic-bezier(0.22, 1, 0.36, 1)` }}
                        />
                        <text x="68" y="62" textAnchor="middle" dominantBaseline="middle"
                          fill="#fff" fontSize="38"
                          fontFamily="'DM Serif Display', Georgia, serif" fontWeight="400">
                          {loading ? '—' : (overallScore ?? '–')}
                        </text>
                        <text x="68" y="84" textAnchor="middle"
                          fill="rgba(255,255,255,0.55)" fontSize="9" fontWeight="800"
                          letterSpacing="2" style={{ textTransform: 'uppercase' }}>
                          OVERALL
                        </text>
                      </svg>
                    )
                  })()}

                  {/* Right of gauge: badge + range + profile + Add to Compare */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Badge row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {band && !loading && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: band.bg, border: `1px solid ${band.border}`, borderRadius: 999, padding: '4px 11px' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: band.color }} aria-hidden="true" />
                          <span style={{ fontSize: 11, fontWeight: 800, color: band.color }}>{band.label}</span>
                        </div>
                      )}
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>·</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                        {rangeMinutes} min range
                      </span>
                      {profileLabel && (
                        <>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>·</span>
                          <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                            {profileLabel}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Add to Compare */}
                    <button
                      onClick={() => {
                        const item = {
                          displayName: locationName,
                          name: locationName,
                          lat: selectedLocation?.lat,
                          lng: selectedLocation?.lng,
                          rangeMinutes,
                          profile,
                        }
                        const result = addToCompareList(item)
                        if (result?.reason === 'ALREADY_EXISTS') {
                          setHeroCompareAdded('duplicate')
                          setTimeout(() => setHeroCompareAdded(null), 2500)
                        } else if (result?.reason === 'COMPARE_FULL') {
                          setCompareReplacePending({ pendingItem: item, currentList: result.current })
                        } else {
                          setHeroCompareAdded('added')
                          setTimeout(() => setHeroCompareAdded(null), 2500)
                        }
                      }}
                      style={{
                        all: 'unset', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '8px 18px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.25)',
                        color: '#fff', fontSize: 13, fontWeight: 700,
                        transition: 'background 0.15s', alignSelf: 'flex-start',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
                    >
                      {heroCompareAdded === 'added' ? '✓ Added to Compare' : heroCompareAdded === 'duplicate' ? '✓ Already in list' : '＋ Add to Compare'}
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT — category score rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {CATEGORIES.map((key, i) => {
                  const cfg = CATEGORY_CONFIG[key]
                  const score = loading ? null : (scores?.[key] ?? null)
                  const bench = STATIC_SCORE_BENCHMARK.scores[key]
                  const delta = score != null ? score - bench : null
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                        <span style={{ fontSize: 15 }} aria-hidden="true">{cfg.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1 }}>
                          {cfg.label}
                        </span>
                        <span style={{ fontSize: 23, fontWeight: 900, color: cfg.color, lineHeight: 1, letterSpacing: '-0.5px' }}
                          aria-label={`${cfg.label}: ${score ?? 'loading'}`}>
                          {score ?? '—'}
                        </span>
                      </div>
                      {/* Animated bar */}
                      <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 999, background: cfg.color,
                          width: (heroBarReady && score != null) ? `${score}%` : '0%',
                          transition: `width 1.3s cubic-bezier(0.22, 1, 0.36, 1) ${i * 160}ms`,
                        }} />
                      </div>
                      {delta != null && (
                        <p style={{ fontSize: 10, fontWeight: 700, marginTop: 4, color: delta >= 0 ? '#6ee7b7' : '#fca5a5' }}>
                          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs Melbourne benchmark
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        </div>

        {/* Category score cards — each contains its own expandable breakdown */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 14, marginBottom: 28 }}
          role="region" aria-label="Category scores"
        >
          {CATEGORIES.map(k => {
            const c = CATEGORY_CONFIG[k]
            const catIndicators = indicators[k]
            const catGroups = groupIndicatorFactors(catIndicators?.factors || [], profile)
            return (
              <div key={k} style={{
                background: '#fff', border: '1.5px solid #e5e7eb',
                borderRadius: 20, padding: '20px 20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                transition: 'box-shadow 0.2s, border-color 0.2s',
              }}>
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.color, marginBottom: 5 }}>
                    <span aria-hidden="true">{c.icon}</span> {c.label}
                  </p>
                  <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>{c.description}</p>
                </div>
                {!loading && catIndicators && (
                  <p style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                    {catIndicators.factors?.filter(f => f.met).length ?? 0}/{catIndicators.factors?.length ?? 0} indicators met
                  </p>
                )}

                {!loading && catIndicators && catGroups.length > 0 && (
                  <button
                    onClick={() => setSelectedBreakdownCategory(k)}
                    style={{
                      marginTop: 12, width: '100%', padding: '9px 14px',
                      background: 'transparent', border: `1px solid ${c.border}`,
                      borderRadius: 10, cursor: 'pointer',
                      fontSize: 13, fontWeight: 700, color: c.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all 0.18s', fontFamily: 'Figtree, sans-serif',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = c.soft }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    See Breakdown ↗
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Indicator breakdown moved inside each category card above ↑ */}

        <CensusContextSection data={censusData} loading={censusLoading} userProfile={profile} indicators={indicators} />

        <CouncilLinksSection data={councilLinksData} loading={councilLinksLoading} />

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
                    {categoryComparisonText(interpretationSummary.rows, benchmarkTextLabel)}
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

        {/* Similar Suburbs — above methodology */}
        {!loading && (
          <SimilarSuburbs
            recommendations={recommendations}
            loading={recommendationsLoading}
            error={recommendationsError}
            rangeMinutes={rangeMinutes}
            profile={profile}
            selectedLocation={selectedLocation}
            returnContext={returnContext}
          />
        )}

        {/* Methodology */}
        <div style={{
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 20, padding: '28px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          marginBottom: 16,
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

        <div style={{
          background: '#fff',
          border: '1.5px solid #e5e7eb',
          borderRadius: 16,
          padding: '16px 18px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.035)',
        }} role="note" aria-label="Benchmark explanation">
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 5 }}>
            Benchmark
          </p>
          <p style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.65 }}>
            {STATIC_SCORE_BENCHMARK.description} The benchmark values are accessibility {STATIC_SCORE_BENCHMARK.scores.accessibility}, safety {STATIC_SCORE_BENCHMARK.scores.safety}, environment {STATIC_SCORE_BENCHMARK.scores.environment}, and overall liveability {STATIC_SCORE_BENCHMARK.scores.liveability}. They are used only as a comparison guide.
          </p>
        </div>

      </div>

      {/* Compare replace modal — shown when list is full */}
      {compareReplacePending && (
        <CompareReplaceModal
          pendingItem={compareReplacePending.pendingItem}
          currentList={compareReplacePending.currentList}
          onReplace={(index) => {
            replaceCompareArea(index, compareReplacePending.pendingItem)
            setCompareReplacePending(null)
            setHeroCompareAdded('added')
            setTimeout(() => setHeroCompareAdded(null), 2500)
          }}
          onClose={() => setCompareReplacePending(null)}
        />
      )}

      {/* Change Conditions modal */}
      {showConditionsModal && (
        <ChangeConditionsModal
          rangeMinutes={rangeMinutes}
          profile={profile}
          onSave={({ rangeMinutes: newRange, profile: newProfile }) => {
            const newContext = { ...context, rangeMinutes: newRange, profile: newProfile }
            saveContext(newContext)
            navigate('/insights', { state: newContext, replace: true })
            setShowConditionsModal(false)
          }}
          onClose={() => setShowConditionsModal(false)}
        />
      )}

      {/* Breakdown modal */}
      {selectedBreakdownCategory && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setSelectedBreakdownCategory(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px 16px',
          }}
          role="dialog" aria-modal="true" aria-label="Score breakdown"
        >
          <div style={{
            background: '#fff', borderRadius: 20, width: '100%', maxWidth: 720,
            maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          }}>
            {/* sticky header */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 1,
              background: '#fff', borderBottom: '1.5px solid #e5e7eb',
              borderRadius: '20px 20px 0 0',
              padding: '18px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 3 }}>
                  Score Breakdown
                </p>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#101828' }}>
                  {locationName}
                </p>
              </div>
              <button
                onClick={() => setSelectedBreakdownCategory(null)}
                aria-label="Close breakdown"
                style={{
                  all: 'unset', cursor: 'pointer', width: 34, height: 34,
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#f3f4f6', fontSize: 18, color: '#4b5563',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6' }}
              >
                ×
              </button>
            </div>

            {/* body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
              {breakdownCategories.map(k => {
                const c = CATEGORY_CONFIG[k]
                const catIndicators = indicators[k]
                const catGroups = groupIndicatorFactors(catIndicators?.factors || [], profile)
                const catScore = scores?.[k]
                const band = catScore != null ? getScoreBand(catScore) : null
                return (
                  <div key={k}>
                    {/* category header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${c.border}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 32, height: 32, borderRadius: 9,
                          background: c.soft, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16,
                        }}>{c.icon}</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: c.color }}>{c.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {catScore != null && (
                          <span style={{ fontSize: 22, fontWeight: 900, color: c.color }}>{Math.round(catScore)}</span>
                        )}
                        {band && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px',
                            borderRadius: 20, background: c.soft, color: c.color,
                          }}>{band.label}</span>
                        )}
                      </div>
                    </div>
                    {/* accordion breakdown */}
                    {catGroups.length > 0
                      ? <CategoryAccordion groups={catGroups} color={c.color} soft={c.soft} border={c.border} />
                      : <p style={{ fontSize: 13, color: '#6b7280' }}>No breakdown data available.</p>
                    }
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
