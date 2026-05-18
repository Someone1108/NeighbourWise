import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import ChangeConditionsModal from '../components/ChangeConditionsModal.jsx'
import CompareReplaceModal from '../components/CompareReplaceModal.jsx'
import Toast from '../components/Toast.jsx'
import {
  getCensusProfileForLocation,
  getLiveabilityScore,
  getCompareRecommendation,
  searchAddresses,
  searchLocalities,
} from '../services/api.js'
import {
  addToCompareList,
  replaceCompareArea,
  clearCompareList,
  loadCompareList,
  removeFromCompareList,
  saveCompareList,
} from '../utils/storage.js'

const CATEGORY_KEYS = ['accessibility', 'safety', 'environment']

const CATEGORY_META = {
  accessibility: { label: 'Accessibility', icon: '🚌', tint: 'rgba(8, 145, 178, 0.12)' },
  safety: { label: 'Safety & Comfort', icon: '🛡', tint: 'rgba(244, 124, 32, 0.12)' },
  environment: { label: 'Environment', icon: '🌿', tint: 'rgba(42, 157, 143, 0.12)' },
}

const CATEGORY_COLORS = {
  accessibility: { color: '#2563eb', soft: '#eff6ff', border: '#bfdbfe' },
  safety:        { color: '#059669', soft: '#ecfdf5', border: '#a7f3d0' },
  environment:   { color: '#ea580c', soft: '#fff7ed', border: '#fed7aa' },
}

const CATEGORY_REASON_TEXT = {
  accessibility: 'Accessibility reflects everyday access to transport, services, schools, parks and other local essentials',
  safety: 'Safety & comfort reflects crime context, street activity, noise, transport-stop comfort and zoning safety',
  environment: 'Environment reflects green coverage, urban heat comfort, environmental zoning comfort and air quality',
}


function safeRangeMinutes(value) {
  const n = Number(value)
  if ([10, 20, 30].includes(n)) return n
  return 20
}

function getProfileLabel(profile) {
  if (profile?.familyWithChildren) return 'Family with children'
  if (profile?.elderly) return 'Older residents'
  if (profile?.petOwner) return 'Pet owners'
  return 'General lifestyle'
}

function getSharedRangeMinutes(firstArea, secondArea) {
  return safeRangeMinutes(firstArea?.rangeMinutes ?? secondArea?.rangeMinutes ?? 20)
}

function labelForCategory(key) {
  return CATEGORY_META[key]?.label || key
}

function reasonForCategory(key) {
  return CATEGORY_REASON_TEXT[key] || `${labelForCategory(key)} reflects the selected score category`
}

function buildOverallVerdict({ area1, area2, overall1, overall2, scores, deltas }) {
  const overallGap = Math.abs(overall1 - overall2)
  const sortedDeltas = [...deltas].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const topDelta = sortedDeltas[0]
  const closeCategories = sortedDeltas
    .filter((item) => Math.abs(item.delta) <= 3)
    .map((item) => labelForCategory(item.key).toLowerCase())
  const secondaryDifferences = sortedDeltas
    .filter((item) => item !== topDelta && Math.abs(item.delta) > 3)
    .map((item) => {
      const leader = item.delta > 0 ? area1 : area2
      const score = item.delta > 0 ? scores[item.key][0] : scores[item.key][1]
      const trailingScore = item.delta > 0 ? scores[item.key][1] : scores[item.key][0]
      return `${leader} is also ahead in ${labelForCategory(item.key).toLowerCase()} (${score} vs ${trailingScore})`
    })

  if (overallGap <= 2) {
    const topLeader = topDelta?.delta > 0 ? area1 : area2
    const topScore = topDelta?.delta > 0 ? scores[topDelta.key][0] : scores[topDelta.key][1]
    const topTrailingScore = topDelta?.delta > 0 ? scores[topDelta.key][1] : scores[topDelta.key][0]

    return topDelta && Math.abs(topDelta.delta) > 3
      ? `Overall, these areas are closely matched (${overall1} vs ${overall2}). The clearest difference is ${labelForCategory(topDelta.key).toLowerCase()}, where ${topLeader} scores ${topScore} compared with ${topTrailingScore}, so use that category as the main tie-breaker.`
      : `Overall, these areas are closely matched (${overall1} vs ${overall2}), and the category scores are mostly similar. This is more of a lifestyle trade-off than a clear winner.`
  }

  const winner = overall1 > overall2 ? area1 : area2
  const loser = overall1 > overall2 ? area2 : area1
  const winnerScore = overall1 > overall2 ? overall1 : overall2
  const loserScore = overall1 > overall2 ? overall2 : overall1
  const topLeader = topDelta.delta > 0 ? area1 : area2
  const topScore = topDelta.delta > 0 ? scores[topDelta.key][0] : scores[topDelta.key][1]
  const topTrailingScore = topDelta.delta > 0 ? scores[topDelta.key][1] : scores[topDelta.key][0]
  const closeText = closeCategories.length
    ? ` ${closeCategories.map((label) => `${label}`).join(' and ')} stay close, so they are less decisive in this comparison.`
    : ''
  const secondaryText = secondaryDifferences.length
    ? ` ${secondaryDifferences.join('. ')}.`
    : ''

  return `${winner} looks stronger overall (${winnerScore} vs ${loserScore}), with a ${overallGap}-point lead over ${loser}. The biggest difference is ${labelForCategory(topDelta.key).toLowerCase()}: ${topLeader} scores ${topScore} compared with ${topTrailingScore}.${secondaryText}${closeText}`
}

function hasSituationProfile(profile) {
  return Boolean(profile?.familyWithChildren || profile?.elderly || profile?.petOwner)
}

function getSharedCompareProfile(firstArea, secondArea) {
  if (hasSituationProfile(firstArea?.profile)) return firstArea.profile
  if (hasSituationProfile(secondArea?.profile)) return secondArea.profile
  return firstArea?.profile || secondArea?.profile || {}
}

const ACCESSIBILITY_FACTOR_LABELS = {
  bus_stop: 'Bus stop coverage',
  train_station: 'Train station access',
  supermarket: 'Supermarket access',
  hospital: 'Hospital access',
  school: 'School access',
  park: 'Park access',
}

const SAFETY_FACTOR_LABELS = {
  crime: 'Crime context',
  activity: 'Street activity',
  noise: 'Noise and traffic comfort',
  transportComfort: 'Public transport stop comfort',
  zoning: 'Zoning safety',
}

const ENVIRONMENT_FACTOR_LABELS = {
  green: 'Green coverage',
  heat: 'Urban heat comfort',
  zoning: 'Environmental zoning comfort',
  airQuality: 'Air quality',
}

function formatCompareNumber(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Unavailable'
  return Math.round(n).toLocaleString('en-AU')
}

function formatComparePercent(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Unavailable'
  return `${Math.round(n * 10) / 10}%`
}

function weeklyToMonthly(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n * 52 / 12
}

function formatCompareMoney(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Unavailable'
  return `$${Math.round(n).toLocaleString('en-AU')}${suffix}`
}

function buildScoreFactors(scoreData) {
  const breakdown = scoreData?.breakdown || {}
  const accessibilityBreakdown = breakdown.accessibility?.breakdown || {}
  const safetyScores = breakdown.safety?.scores || {}
  const environmentScores = breakdown.environment?.scores || {}

  const accessibility = Object.entries(accessibilityBreakdown).map(([key, item]) => ({
    category: 'Accessibility',
    key,
    name: ACCESSIBILITY_FACTOR_LABELS[key] || key.replaceAll('_', ' '),
    score: Number(item?.score),
    nearestPoi: item?.nearestPoi || null,
  }))

  const safety = Object.entries(SAFETY_FACTOR_LABELS).map(([key, name]) => ({
    category: 'Safety & Comfort',
    name,
    score: Number(safetyScores[key]),
  }))

  const environment = Object.entries(ENVIRONMENT_FACTOR_LABELS).map(([key, name]) => ({
    category: 'Environment',
    name,
    score: Number(environmentScores[key]),
  }))

  return [...accessibility, ...safety, ...environment]
    .filter((factor) => Number.isFinite(factor.score))
    .map((factor) => ({ ...factor, score: Math.round(factor.score) }))
}

function factorPhrase(factor) {
  return `${factor.name} (${factor.score}/100)`
}

function findScoreFactor(scoreData, namePart) {
  const needle = String(namePart).toLowerCase()
  return buildScoreFactors(scoreData).find((factor) =>
    String(factor.name || '').toLowerCase().includes(needle)
  )
}

function getNearestAccessibilityPoi(scoreData, type) {
  return scoreData?.breakdown?.accessibility?.breakdown?.[type]?.nearestPoi || null
}

function validPoiName(poi) {
  const name = String(poi?.name || '').trim()
  if (!name || name.toLowerCase() === 'unknown') return ''
  return name
}

function formatDistanceKm(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (n < 1) return `${Math.round(n * 1000)} m`
  return `${Math.round(n * 10) / 10} km`
}

function nearestPoiPhrase(scoreData, type) {
  const poi = getNearestAccessibilityPoi(scoreData, type)
  const name = validPoiName(poi)
  if (!name) return ''

  const distance = formatDistanceKm(poi.distanceKm)
  return distance ? `${name} about ${distance} away` : name
}

function nearestParkPhrase(scoreData) {
  return nearestPoiPhrase(scoreData, 'park') || 'nearby park options'
}

function parkFocusPhrase(scoreData) {
  const nearestPark = getNearestAccessibilityPoi(scoreData, 'park')
  const name = validPoiName(nearestPark)
  if (!name) return 'nearby parks'
  return name
}

function poiCardDetail(factor) {
  const name = validPoiName(factor?.nearestPoi)
  if (!name) return ''

  const distance = formatDistanceKm(factor.nearestPoi.distanceKm)
  return distance ? `${name} - ${distance} away` : name
}

function joinTextParts(parts) {
  const clean = parts.filter(Boolean)
  if (clean.length <= 1) return clean[0] || ''
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
}

function nearbySignalsSentence(scoreData, items) {
  const phrases = items
    .map(({ type, label }) => {
      const phrase = nearestPoiPhrase(scoreData, type)
      return phrase ? `${label}: ${phrase}` : ''
    })
    .filter(Boolean)

  if (!phrases.length) return ''
  return ` Nearby named options include ${joinTextParts(phrases)}.`
}

function describeFactor(factor, fallbackLabel) {
  if (!factor) return `${fallbackLabel} unavailable`
  return factorPhrase(factor)
}

function scoreStatus(score) {
  const value = Number(score)
  if (!Number.isFinite(value)) return 'Unavailable'
  if (value >= 75) return 'Strong'
  if (value >= 60) return 'Good'
  if (value >= 45) return 'Mixed'
  return 'Limited'
}

function buildSituationScoreCard(factor, fallbackLabel) {
  return {
    label: factor?.name || fallbackLabel,
    value: Number.isFinite(Number(factor?.score)) ? `${Math.round(Number(factor.score))}/100` : 'Unavailable',
    status: scoreStatus(factor?.score),
    detail: poiCardDetail(factor),
  }
}

function buildSituationInsightSummary({ scoreData, censusData, profile }) {
  const censusProfile = censusData?.profile || {}
  const factors = buildScoreFactors(scoreData)
  if (!factors.length) {
    return {
      label: 'Situation context',
      text: 'Situation-specific score signals are unavailable for this area, so use the Census context below as the main comparison guide.',
      panelTitle: 'Local context',
      panelText: 'Detailed score signals are unavailable.',
      stats: [],
      scoreCards: [],
    }
  }

  if (profile?.familyWithChildren) {
    const nearbyText = nearbySignalsSentence(scoreData, [
      { type: 'school', label: 'school' },
      { type: 'bus_stop', label: 'bus stop' },
      { type: 'train_station', label: 'train station' },
    ])
    const text = `For a family household, the useful local checks are ${describeFactor(findScoreFactor(scoreData, 'school'), 'school access')}, ${describeFactor(findScoreFactor(scoreData, 'bus stop'), 'bus stop coverage')} and ${describeFactor(findScoreFactor(scoreData, 'train'), 'train station access')}.${nearbyText} Census context adds that ${formatComparePercent(censusProfile.familyHouseholdsPct)} of households are family households, ${formatComparePercent(censusProfile.age0To14Pct)} of residents are aged 0-14 and the average household size is ${censusProfile.averageHouseholdSize ?? 'Unavailable'}.`
    return {
      label: 'Relevant for families',
      text,
      panelTitle: 'Family context',
      panelText: `${formatComparePercent(censusProfile.familyHouseholdsPct)} of households are family households, ${formatComparePercent(censusProfile.age0To14Pct)} of residents are aged 0-14 and average household size is ${censusProfile.averageHouseholdSize ?? 'Unavailable'}.`,
      stats: [
        { label: 'Family households', value: formatComparePercent(censusProfile.familyHouseholdsPct) },
        { label: 'Children 0-14', value: formatComparePercent(censusProfile.age0To14Pct) },
        { label: 'Household size', value: censusProfile.averageHouseholdSize ?? 'Unavailable' },
      ],
      scoreCards: [
        buildSituationScoreCard(findScoreFactor(scoreData, 'school'), 'School access'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'bus stop'), 'Bus stop coverage'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'train'), 'Train station access'),
      ],
    }
  }

  if (profile?.elderly) {
    const nearbyText = nearbySignalsSentence(scoreData, [
      { type: 'hospital', label: 'hospital' },
      { type: 'bus_stop', label: 'bus stop' },
      { type: 'train_station', label: 'train station' },
    ])
    const text = `For an older resident, the useful checks are ${describeFactor(findScoreFactor(scoreData, 'hospital'), 'hospital access')}, ${describeFactor(findScoreFactor(scoreData, 'bus stop'), 'bus stop coverage')} and ${describeFactor(findScoreFactor(scoreData, 'train'), 'train station access')}.${nearbyText} Census context adds that ${formatComparePercent(censusProfile.age65PlusPct)} of residents are aged 65+, ${formatComparePercent(censusProfile.needForAssistancePct)} report needing assistance, ${formatComparePercent(censusProfile.lonePersonHouseholdsPct)} of households are lone-person households and ${formatComparePercent(censusProfile.noCarHouseholdsPct)} have no car.`
    return {
      label: 'Relevant for older residents',
      text,
      panelTitle: 'Older resident context',
      panelText: `${formatComparePercent(censusProfile.age65PlusPct)} of residents are aged 65+, ${formatComparePercent(censusProfile.needForAssistancePct)} report needing assistance and ${formatComparePercent(censusProfile.noCarHouseholdsPct)} of households have no car.`,
      stats: [
        { label: 'Residents 65+', value: formatComparePercent(censusProfile.age65PlusPct) },
        { label: 'Need assistance', value: formatComparePercent(censusProfile.needForAssistancePct) },
        { label: 'Lone-person households', value: formatComparePercent(censusProfile.lonePersonHouseholdsPct) },
        { label: 'No-car households', value: formatComparePercent(censusProfile.noCarHouseholdsPct) },
      ],
      scoreCards: [
        buildSituationScoreCard(findScoreFactor(scoreData, 'hospital'), 'Hospital access'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'bus stop'), 'Bus stop coverage'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'train'), 'Train station access'),
      ],
    }
  }

  if (profile?.petOwner) {
    const text = `For a pet owner, the useful checks are ${describeFactor(findScoreFactor(scoreData, 'park'), 'park access')} and ${describeFactor(findScoreFactor(scoreData, 'bus stop'), 'public transport access')}. The closest park signal is ${nearestParkPhrase(scoreData)}. Housing and ownership context stays in the Census cards below.`
    return {
      label: 'Relevant for pet owners',
      text,
      panelTitle: 'Pet owner context',
      panelText: `Focus on parks like ${parkFocusPhrase(scoreData)} and practical everyday access when comparing pet-friendly routines.`,
      stats: [],
      scoreCards: [
        buildSituationScoreCard(findScoreFactor(scoreData, 'park'), 'Park access'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'bus stop'), 'Public transport access'),
      ],
    }
  }

  const strongestCategory = CATEGORY_KEYS
    .map((key) => ({ label: labelForCategory(key), score: Number(scoreData?.scores?.[key]) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)[0]

  const text = strongestCategory
    ? `For a general lifestyle comparison, ${strongestCategory.label.toLowerCase()} is the strongest score signal (${Math.round(strongestCategory.score)}/100). Use the Census snapshot below for age, housing and transport context.`
    : 'For a general lifestyle comparison, use the Census snapshot below for age, housing and transport context.'
  return {
    label: 'Lifestyle context',
    text,
    panelTitle: '',
    panelText: '',
    stats: [],
    scoreCards: [],
  }
}

function buildCensusInsightSummary(censusData) {
  if (!censusData?.available) {
    return {
      snapshot: 'Census profile unavailable for this location.',
      housing: 'Housing and ownership context unavailable.',
      transport: 'Transport behaviour unavailable.',
      stats: [],
    }
  }

  const profile = censusData.profile || {}
  const rentMonthly = profile.medianRentMonthly ?? weeklyToMonthly(profile.medianRentWeekly)

  return {
    snapshot: `The Census profile shows a population of ${formatCompareNumber(profile.totalPopulation)}, a median age of ${profile.medianAge ?? 'Unavailable'}, ${formatComparePercent(profile.familyHouseholdsPct)} family households and ${formatComparePercent(profile.age65PlusPct)} residents aged 65 or over.`,
    housing: `${formatComparePercent(profile.rentersPct)} of households rent. Median rent is ${formatCompareMoney(rentMonthly, ' / month')}, while the median mortgage repayment is ${formatCompareMoney(profile.medianMortgageMonthly, ' / month')}.`,
    transport: `${formatComparePercent(profile.publicTransportToWorkPct)} of workers use public transport to work, ${formatComparePercent(profile.carToWorkPct)} travel by car and ${formatComparePercent(profile.noCarHouseholdsPct)} of households have no car.`,
    stats: [
      { label: 'Population', value: formatCompareNumber(profile.totalPopulation) },
      { label: 'Median age', value: profile.medianAge ?? 'Unavailable' },
      { label: 'Renters', value: formatComparePercent(profile.rentersPct) },
      { label: 'Median rent', value: formatCompareMoney(rentMonthly, ' / month') },
      { label: 'Median mortgage', value: formatCompareMoney(profile.medianMortgageMonthly, ' / month') },
      { label: 'Public transport', value: formatComparePercent(profile.publicTransportToWorkPct) },
    ],
  }
}

function buildCompareInsights({ scoreData, censusData, profile }) {
  return {
    situation: buildSituationInsightSummary({ scoreData, censusData, profile }),
    census: buildCensusInsightSummary(censusData),
  }
}

function getLocationLabel(item) {
  return (
    item?.displayName ||
    item?.fullAddress ||
    item?.locationName ||
    item?.name ||
    ''
  )
}

function inferCompareSuburbFromAddress(value) {
  const text = String(value || '').trim()
  if (!text) return ''

  const commaMatch = text.match(/,\s*([^,]+?)\s+(?:VIC|Victoria)\s+\d{4}\b/i)
  if (commaMatch?.[1]) return commaMatch[1].trim()

  const streetTypes = [
    'avenue',
    'ave',
    'boulevard',
    'blvd',
    'court',
    'ct',
    'drive',
    'dr',
    'lane',
    'ln',
    'parade',
    'pde',
    'place',
    'pl',
    'road',
    'rd',
    'street',
    'st',
    'terrace',
    'tce',
    'way',
  ].join('|')
  const streetMatch = text.match(new RegExp(`\\b(?:${streetTypes})\\b\\s+(.+?)\\s+(?:VIC|Victoria)\\s+\\d{4}\\b`, 'i'))
  if (!streetMatch?.[1]) return ''

  return streetMatch[1].trim()
}

function getCensusLookupLocation(area) {
  const selected = area?.selectedLocation || {}
  const displayName = selected.displayName || area?.displayName || area?.locationName || area?.name
  const fullAddress = selected.fullAddress || area?.fullAddress || ''
  const placeType = selected.placeType || selected.type || area?.placeType || area?.type || 'suburb'
  const inferredSuburb =
    selected.suburb ||
    selected.locality ||
    area?.suburb ||
    area?.locality ||
    inferCompareSuburbFromAddress(fullAddress || displayName)

  if (!['suburb', 'locality', 'postcode'].includes(placeType) && inferredSuburb) {
    return {
      name: inferredSuburb,
      displayName: inferredSuburb,
      placeType: 'suburb',
      type: 'suburb',
      postcode: selected.postcode || area?.postcode || null,
      lat: selected.lat ?? area?.lat,
      lng: selected.lng ?? area?.lng,
    }
  }

  return {
    ...selected,
    ...area,
    name: selected.name || area?.name || area?.locationName || area?.displayName,
    displayName,
    fullAddress,
    suburb: inferredSuburb || selected.suburb || area?.suburb || '',
    locality: inferredSuburb || selected.locality || area?.locality || '',
    placeType,
    type: selected.type || selected.placeType || area?.type || area?.placeType || 'suburb',
    postcode: selected.postcode || area?.postcode || null,
    lat: selected.lat ?? area?.lat,
    lng: selected.lng ?? area?.lng,
  }
}

function isPostcodeQuery(value) {
  return /^\d{4}$/.test(String(value || '').trim())
}

function getSearchResultKey(item) {
  return String(item?.displayName || item?.fullAddress || item?.name || '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function miniProgress(score, outOf = 100, ready = true, side = 'left') {
  const s = Number.isFinite(score) ? score : 0
  const o = Number.isFinite(outOf) && outOf > 0 ? outOf : 100
  const percent = Math.max(0, Math.min(100, (s / o) * 100))

  // Left column bars grow from right→left; right column bars grow left→right
  const isLeft = side === 'left'
  return (
    <div className="nwProgressOuter nwMiniProgressOuter" style={{ overflow: 'hidden' }}>
      <div
        className="nwProgressInner"
        style={{
          height: '100%',
          width: `${percent}%`,
          marginLeft: isLeft ? 'auto' : 0,
          transform: ready ? 'scaleX(1)' : 'scaleX(0)',
          transformOrigin: isLeft ? 'right center' : 'left center',
          transition: 'transform 1s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  )
}

function CompareInsightParagraph({ children }) {
  return (
    <p style={{ fontSize: 13, lineHeight: 1.55, color: '#334155', margin: 0 }}>
      {children}
    </p>
  )
}

function CompareStatGrid({ stats, columns = 'repeat(auto-fit, minmax(130px, 1fr))' }) {
  if (!stats?.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 8, marginTop: 10 }}>
      {stats.map((stat) => (
        <div key={stat.label} style={{
          background: '#fff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          padding: '10px 12px',
          minHeight: 66,
        }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1e40af', marginBottom: 6 }}>
            {stat.label}
          </p>
          <p style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function CompareScoreCardGrid({ cards }) {
  if (!cards?.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
      {cards.map((card) => (
        <div key={card.label} style={{
          background: '#fff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 900, color: '#1e3a8a', lineHeight: 1.25 }}>
              {card.label}
            </p>
            <p style={{ fontSize: 11, fontWeight: 900, color: '#2563eb', whiteSpace: 'nowrap' }}>
              {card.value}
            </p>
          </div>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#1e40af' }}>
            {card.status}
          </p>
          {card.detail && (
            <p style={{ fontSize: 11, fontWeight: 700, color: '#475569', lineHeight: 1.35, marginTop: 5 }}>
              {card.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function CompareContextCard({ title, children }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      <p style={{ fontSize: 14, fontWeight: 900, color: '#047857', marginBottom: 8 }}>
        {title}
      </p>
      <CompareInsightParagraph>{children}</CompareInsightParagraph>
    </div>
  )
}

function CompareInsightCell({ insight }) {
  if (!insight) {
    return (
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
        Insight context is unavailable.
      </p>
    )
  }

  const hasSituationPanel = Boolean(
    insight.situation?.panelTitle ||
    insight.situation?.panelText ||
    insight.situation?.stats?.length ||
    insight.situation?.scoreCards?.length
  )

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{
        background: '#ecfdf5',
        border: '1px solid #a7f3d0',
        borderLeft: '4px solid #0f766e',
        borderRadius: 12,
        padding: '14px 16px',
      }}>
        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#047857', marginBottom: 8 }}>
          {insight.situation.label}
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#064e3b', margin: 0, fontWeight: 650 }}>
          {insight.situation.text}
        </p>
      </div>

      {hasSituationPanel && (
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderLeft: '4px solid #2563eb',
          borderRadius: 12,
          padding: '14px 16px',
        }}>
          {insight.situation.panelTitle && (
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1d4ed8', marginBottom: 8 }}>
              {insight.situation.panelTitle}
            </p>
          )}
          {insight.situation.panelText && (
            <p style={{ fontSize: 13, lineHeight: 1.55, color: '#1e3a8a', margin: 0, fontWeight: 700 }}>
              {insight.situation.panelText}
            </p>
          )}
          <CompareStatGrid stats={insight.situation.stats} />
          <CompareScoreCardGrid cards={insight.situation.scoreCards} />
        </div>
      )}

      <CompareStatGrid stats={insight.census.stats} columns="repeat(auto-fit, minmax(120px, 1fr))" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        <CompareContextCard title="Census snapshot">
          {insight.census.snapshot}
        </CompareContextCard>
        <CompareContextCard title="Housing">
          {insight.census.housing}
        </CompareContextCard>
        <CompareContextCard title="Transport behaviour">
          {insight.census.transport}
        </CompareContextCard>
      </div>
    </div>
  )
}

function CompareInsightsTable({ data }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ marginBottom: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>
          Key comparison insights
        </p>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
          Situation-specific context and Census signals from each area, side by side.
        </p>
      </div>

      <table className="nwCompareTable" aria-label="Key comparison insights" style={{ marginTop: 0 }}>
        <thead>
          <tr>
            <th style={{ width: '50%' }} title={data.area1}>{data.area1}</th>
            <th style={{ width: '50%' }} title={data.area2}>{data.area2}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top', padding: '18px 20px' }}>
              <CompareInsightCell insight={data.insights?.[0]} />
            </td>
            <td style={{ verticalAlign: 'top', padding: '18px 20px' }}>
              <CompareInsightCell insight={data.insights?.[1]} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function ComparePage() {
  const navigate = useNavigate()

  const [compareList, setCompareList] = useState(() => loadCompareList())
  const [searchTerm, setSearchTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [suburbResults, setSuburbResults] = useState([])
  const [addressResults, setAddressResults] = useState([])
  const [addingIndex, setAddingIndex] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [data, setData] = useState(null)

  // Recommendation feature state
  const [recCategory, setRecCategory] = useState(null)
  const [recBaseline, setRecBaseline] = useState(null)
  const [recResult, setRecResult] = useState(null)
  const recButtonRef = useRef(null)
  const recResultRef = useRef(null)
  const [recToastMsg, setRecToastMsg] = useState(null)
  const [recToastAction, setRecToastAction] = useState(null)
  const [recReplaceModal, setRecReplaceModal] = useState(null) // { pendingItem, currentList }
  const [recFinding, setRecFinding] = useState(false)

  const [showConditionsModal, setShowConditionsModal] = useState(false)

  // Table animation state — triggers bar animations after data loads
  const [tableReady, setTableReady] = useState(false)
  useEffect(() => {
    if (data) {
      const t = setTimeout(() => setTableReady(true), 120)
      return () => clearTimeout(t)
    }
    setTableReady(false)
  }, [data])

  // Gauge animation for recommendation card
  const [recGaugeReady, setRecGaugeReady] = useState(false)
  useEffect(() => {
    if (recResult && !recResult.noMatch) {
      setRecGaugeReady(false)
      const t = setTimeout(() => setRecGaugeReady(true), 200)
      return () => clearTimeout(t)
    }
    setRecGaugeReady(false)
  }, [recResult])

  // Auto-scroll to recommend button when baseline area is selected
  useEffect(() => {
    if (!recBaseline || !recButtonRef.current) return
    const t = setTimeout(() => {
      recButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    return () => clearTimeout(t)
  }, [recBaseline])

  // Auto-scroll to result card after recommendation loads
  useEffect(() => {
    if (!recResult || !recResultRef.current) return
    const t = setTimeout(() => {
      recResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => clearTimeout(t)
  }, [recResult])

  const firstArea = compareList[0] || null
  const secondArea = compareList[1] || null

  const area1Label =
  firstArea?.displayName ||
  firstArea?.locationName ||
  firstArea?.fullAddress ||
  firstArea?.name ||
  'Area 1'

  const mapButtonTitle = firstArea
  ? `View ${area1Label} Map`
  : 'Back to Home'

  const activeSecondArea = secondArea

  const hasResults = suburbResults.length > 0 || addressResults.length > 0
  const postcodeSearch = isPostcodeQuery(searchTerm)


  useEffect(() => {
    const query = searchTerm.trim()

    if (addingIndex === null) {
      setSuburbResults([])
      setAddressResults([])
      setSearching(false)
      return
    }

    if (!postcodeSearch && query.length < 3) {
      setSuburbResults([])
      setAddressResults([])
      setSearching(false)
      return
    }

    const words = query.toLowerCase().split(/\s+/).filter(Boolean)

    function dedupeAndFilter(arr, seen = new Set()) {
      return arr.filter((item) => {
        const label = getSearchResultKey(item)
        const key = label
        if (seen.has(key)) return false
        seen.add(key)
        return words.every((w) => label.includes(w))
      })
    }

    let cancelled = false
    setSearching(true)

    const timer = setTimeout(() => {
      if (postcodeSearch) {
        searchAddresses(query)
          .then((rows) => {
            if (cancelled) return
            const list = Array.isArray(rows) ? rows : []
            setSuburbResults(dedupeAndFilter(list))
            setAddressResults([])
          })
          .catch((err) => {
            console.error('Compare search failed:', err)
            if (!cancelled) {
              setSuburbResults([])
              setAddressResults([])
            }
          })
          .finally(() => {
            if (cancelled) return
            setSearching(false)
          })
        return
      }

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

          const seen = new Set()
          const filteredLocalities = dedupeAndFilter(localities, seen)
          const filteredAddresses = dedupeAndFilter(addresses, seen)

          setSuburbResults(filteredLocalities)
          setAddressResults(filteredAddresses)
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
  }, [searchTerm, addingIndex, postcodeSearch])

  useEffect(() => {
    if (!firstArea) {
      setHint('No area has been saved yet. Add one area from the map page first.')
      setError('')
      setData(null)
      setLoading(false)
      return
    }

    if (!activeSecondArea) {
      setHint('Search and select a second suburb, postcode, or address to compare.')
      setError('')
      setData(null)
      setLoading(false)
      return
    }

    const firstLat = Number(firstArea.lat ?? firstArea.selectedLocation?.lat)
    const firstLng = Number(firstArea.lng ?? firstArea.selectedLocation?.lng)
    const secondLat = Number(activeSecondArea.lat ?? activeSecondArea.selectedLocation?.lat)
    const secondLng = Number(activeSecondArea.lng ?? activeSecondArea.selectedLocation?.lng)

    if (!Number.isFinite(firstLat) || !Number.isFinite(firstLng)) {
      setError('Missing coordinates for the first area. Please re-add it from the map.')
      setLoading(false)
      return
    }

    if (!Number.isFinite(secondLat) || !Number.isFinite(secondLng)) {
      setError('Missing coordinates for the second area. Please select a different location.')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setHint('')

    const firstTime = safeRangeMinutes(firstArea.rangeMinutes)
    const secondTime = safeRangeMinutes(activeSecondArea.rangeMinutes ?? firstArea.rangeMinutes)
    const comparisonProfile = getSharedCompareProfile(firstArea, activeSecondArea)

    const firstScoreRequest = getLiveabilityScore({
      lat: firstLat,
      lng: firstLng,
      time: firstTime,
      persona: comparisonProfile || 'default',
    })

    const secondScoreRequest = getLiveabilityScore({
      lat: secondLat,
      lng: secondLng,
      time: secondTime,
      persona: comparisonProfile || 'default',
    })

    const firstCensusRequest = getCensusProfileForLocation(getCensusLookupLocation(firstArea)).catch((err) => {
      console.error('Compare first Census load failed:', err)
      return null
    })

    const secondCensusRequest = getCensusProfileForLocation(getCensusLookupLocation(activeSecondArea)).catch((err) => {
      console.error('Compare second Census load failed:', err)
      return null
    })

    Promise.all([firstScoreRequest, secondScoreRequest, firstCensusRequest, secondCensusRequest])
      .then(([r1, r2, census1, census2]) => {
        if (cancelled) return

        const scores = {
          accessibility: [
            Math.round(r1.scores?.accessibility ?? 0),
            Math.round(r2.scores?.accessibility ?? 0),
          ],
          safety: [
            Math.round(r1.scores?.safety ?? 0),
            Math.round(r2.scores?.safety ?? 0),
          ],
          environment: [
            Math.round(r1.scores?.environment ?? 0),
            Math.round(r2.scores?.environment ?? 0),
          ],
        }

        const overall1 = Math.round(r1.liveabilityScore ?? 0)
        const overall2 = Math.round(r2.liveabilityScore ?? 0)

        const deltas = [
          { key: 'accessibility', delta: scores.accessibility[0] - scores.accessibility[1] },
          { key: 'safety', delta: scores.safety[0] - scores.safety[1] },
          { key: 'environment', delta: scores.environment[0] - scores.environment[1] },
        ]

        const area1Name = firstArea.locationName
        const area2Name = getLocationLabel(activeSecondArea)
        const recommendation = buildOverallVerdict({
          area1: area1Name,
          area2: area2Name,
          overall1,
          overall2,
          scores,
          deltas,
        })

        setData({
          area1: area1Name,
          area2: area2Name,
          range1: firstTime,
          range2: secondTime,
          overall1,
          overall2,
          scores,
          insights: [
            buildCompareInsights({ scoreData: r1, censusData: census1, profile: comparisonProfile }),
            buildCompareInsights({ scoreData: r2, censusData: census2, profile: comparisonProfile }),
          ],
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
  }, [firstArea, activeSecondArea])

  function onSelectArea(location) {
    if (addingIndex === null) return

    setError('')

    const newArea = {
      ...location,
      locationName: getLocationLabel(location),
      displayName: location.displayName || getLocationLabel(location),
      fullAddress: location.fullAddress || '',
      name: location.name || '',
      type: location.type || location.placeType || 'suburb',
      placeType: location.placeType || location.type || 'suburb',
      postcode: location.postcode || null,
      lat: location.lat,
      lng: location.lng,
      source: location.source || '',
      profile: firstArea?.profile || {},
      rangeMinutes: firstArea?.rangeMinutes || 20,
      selectedLocation: location,
    }

    const updated = [...compareList]
    updated[addingIndex] = newArea

    const compacted = updated.filter(Boolean)

    saveCompareList(compacted)
    setCompareList(compacted)

    setAddingIndex(null)
    setSearchTerm('')
    setSuburbResults([])
    setAddressResults([])
  }

  function removeSavedArea(areaItem) {
    const next = removeFromCompareList(areaItem)
    setCompareList(next)
  }

  function navigateToInsights(area) {
    navigate('/insights', {
      state: {
        selectedLocation: area.selectedLocation || {
          lat: area.lat,
          lng: area.lng,
          displayName: area.locationName || area.displayName || area.name,
          name: area.name,
          fullAddress: area.fullAddress,
        },
        profile: area.profile,
        rangeMinutes: area.rangeMinutes || 20,
      },
    })
  }

async function handleFindRecommendation() {
  if (!recCategory || !recBaseline || !data) return

  setRecResult(null)
  setRecFinding(true)

  const benchmarkArea = recBaseline === 1 ? firstArea : secondArea
  const baselineName = recBaseline === 1 ? data.area1 : data.area2

  const area1Lat = Number(firstArea?.lat ?? firstArea?.selectedLocation?.lat)
  const area1Lng = Number(firstArea?.lng ?? firstArea?.selectedLocation?.lng)

  const area2Lat = Number(secondArea?.lat ?? secondArea?.selectedLocation?.lat)
  const area2Lng = Number(secondArea?.lng ?? secondArea?.selectedLocation?.lng)

  if (
    !Number.isFinite(area1Lat) ||
    !Number.isFinite(area1Lng) ||
    !Number.isFinite(area2Lat) ||
    !Number.isFinite(area2Lng)
  ) {
    setRecResult({ noMatch: true })
    return
  }

  try {
    const result = await getCompareRecommendation({
      benchmarkArea: recBaseline === 1 ? 'area1' : 'area2',
      category: recCategory,
      time: safeRangeMinutes(benchmarkArea?.rangeMinutes ?? 20),
      persona: getSharedCompareProfile(firstArea, activeSecondArea),

      area1: {
        name: data.area1,
        lat: area1Lat,
        lng: area1Lng,
        scores: {
          accessibility: data.scores.accessibility[0],
          safety: data.scores.safety[0],
          environment: data.scores.environment[0],
          liveability: data.overall1,
        },
      },

      area2: {
        name: data.area2,
        lat: area2Lat,
        lng: area2Lng,
        scores: {
          accessibility: data.scores.accessibility[1],
          safety: data.scores.safety[1],
          environment: data.scores.environment[1],
          liveability: data.overall2,
        },
      },
    })

    const recommendations = result?.recommendations || []

    if (!recommendations.length) {
      setRecResult({ noMatch: true })
      return
    }

    const top = recommendations[0]

    setRecResult({
      name: top.suburbLabel || top.suburbName,
      lat: top.latitude,
      lng: top.longitude,
      dist: top.distanceKm,
      scores: {
        accessibility: Math.round(top.scores?.accessibility ?? 0),
        safety: Math.round(top.scores?.safety ?? 0),
        environment: Math.round(top.scores?.environment ?? 0),
        overall: Math.round(top.scores?.liveability ?? top.scores?.overall ?? 0),
      },
      baselineName,
      gain: Math.round(top.improvement ?? 0),
      baselineCategoryScore: result?.benchmarkSuburb?.scores?.[recCategory],
      reason:
        top.reason ||
        `${top.suburbLabel || top.suburbName} is recommended because it performs better in ${CATEGORY_META[recCategory]?.label.toLowerCase()} while keeping other scores comparable.`,
    })
  } catch (err) {
    console.error('Compare recommendation failed:', err)
    setRecResult({ noMatch: true })
  } finally {
    setRecFinding(false)
  }
}


  const compareSubtitle = useMemo(() => {
    if (loading) return 'Loading comparison...'
    if (data) {
      return `${data.area1} (${data.range1} min) vs ${data.area2} (${data.range2} min)`
    }
    return 'Compare two shortlisted areas side by side'
  }, [loading, data])

  function shortLabel(str, max = 28) {
    if (!str) return ''
    return str.length > max ? str.slice(0, max - 1) + '…' : str
  }

  const winner = data
    ? data.overall1 > data.overall2
      ? 1
      : data.overall2 > data.overall1
        ? 2
        : 0
    : 0
  const sharedCompareProfile = getSharedCompareProfile(firstArea, activeSecondArea)
  const sharedRangeMinutes = safeRangeMinutes(firstArea?.rangeMinutes ?? activeSecondArea?.rangeMinutes ?? 20)

  const handleViewArea1Map = () => {
    if (!firstArea) {
      navigate('/')
      return
    }

    navigate('/map', {
      state: {
        selectedLocation: firstArea.selectedLocation || {
          lat: firstArea.lat,
          lng: firstArea.lng,
          displayName:
            firstArea.displayName ||
            firstArea.locationName ||
            firstArea.fullAddress ||
            firstArea.name,
          name: firstArea.name,
          fullAddress: firstArea.fullAddress,
        },
        profile: firstArea.profile || sharedCompareProfile || 'default',
        rangeMinutes: firstArea.rangeMinutes || 20,
      },
    })
  }

  function renderAreaPanel(area, index) {
    const isAdding = addingIndex === index
    const areaLabel = `Area ${index + 1}`

    return (
      <div
        className={`nwCard nwComparePanel nwComparePanel--area${index + 1}`}
        role="region"
        aria-label={areaLabel}
      >
        <div className="nwCompareLabel" aria-hidden="true">{areaLabel}</div>

        {/* Scrollable content — grows to fill space, button stays at bottom */}
        <div className="nwComparePanelContent">
          {area ? (
            <>
              <h2 className="nwCompareAreaTitle" title={getLocationLabel(area)}>
                {shortLabel(getLocationLabel(area))}
              </h2>
              <div
                className="nwCompareAreaMeta"
                style={{
                  display: 'grid',
                  gap: 3,
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 10,
                  lineHeight: 1.35,
                }}
              >
                <p style={{ margin: 0, color: '#ffffff' }}>
                  Travel range: {sharedRangeMinutes} minutes
                </p>
                <p style={{ margin: 0, color: '#ffffff' }}>
                  Situation: {getProfileLabel(sharedCompareProfile)}
                </p>
              </div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>
                ✓ Area selected
              </p>
            </>
          ) : (
            <>
              <p className="nwCompareEmptyText">No area selected yet.</p>
              {isAdding && (
                <div className="nwSearchBlock">
                  <div className="nwSearchControls">
                    <input
                      className="nwInput nwSearchInput"
                      placeholder="Search suburb, postcode or address"
                      aria-label={`Search location for ${areaLabel}`}
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value)
                        setError('')
                      }}
                      autoComplete="off"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      style={{ borderColor: 'transparent', boxShadow: 'none', outline: 'none' }}
                    />
                    <button
                      type="button"
                      className="nwSearchCancelButton"
                      onClick={() => {
                        setAddingIndex(null)
                        setSearchTerm('')
                        setSuburbResults([])
                        setAddressResults([])
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {searching ? (
                    <div className="nwSearchStatus" aria-live="polite" aria-atomic="true">Searching…</div>
                  ) : null}
                  {!searching && hasResults ? (
                    <div className="nwSearchResults" role="listbox" aria-label={`Search results for ${areaLabel}`}>
                      {suburbResults.map((result, i) => (
                        <button
                          key={`area-${index}-suburb-${result.id}-${i}`}
                          type="button"
                          role="option"
                          aria-selected="false"
                          className="nwSearchResultItem"
                          onClick={() => onSelectArea(result)}
                        >
                          <div className="nwSearchResultName">
                            {result.displayName || result.name}
                          </div>
                          <div className="nwSearchResultMeta">
                            {result.state || result.placeType || 'Suburb'}
                          </div>
                        </button>
                      ))}
                      {addressResults.map((result, i) => (
                        <button
                          key={`area-${index}-address-${result.id || result.displayName}-${i}`}
                          type="button"
                          role="option"
                          aria-selected="false"
                          className="nwSearchResultItem"
                          onClick={() => onSelectArea(result)}
                        >
                          <div className="nwSearchResultName">
                            {result.displayName || result.fullAddress || result.name}
                          </div>
                          <div className="nwSearchResultMeta">
                            {result.suburb
                              ? `${result.suburb}${result.postcode ? `, ${result.postcode}` : ''}`
                              : result.placeType || 'Address'}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* Button row — always at the bottom of the card regardless of content state */}
        {(!isAdding || area) && (
        <div className="nwBtnRow" style={{ flexWrap: 'wrap', gap: 8 }}>
          {area ? (
            <>
              <Button variant="secondary" onClick={() => navigateToInsights(area)}>
                📊 Detailed Insights
              </Button>
              <Button variant="secondary" onClick={() => removeSavedArea(area)}>
                Remove
              </Button>
            </>
          ) : !isAdding ? (
            <Button
              variant="primary"
              onClick={() => {
                setAddingIndex(index)
                setSearchTerm('')
                setSuburbResults([])
                setAddressResults([])
              }}
            >
              Add Area
            </Button>
          ) : null}
        </div>
        )}
      </div>
    )
  }
  return (
    <div style={{ background: '#f5f0eb', minHeight: '100%', paddingBottom: 56 }}>
      <Toast
        message={recToastMsg}
        action={recToastAction}
        duration={recToastAction ? 0 : 2500}
        onClose={() => { setRecToastMsg(null); setRecToastAction(null) }}
      />

      {/* Sticky back-to-map nav — full viewport width, mirrors InsightsPage exactly */}
      <nav aria-label="Page navigation" style={{
        position: 'sticky', top: 64, zIndex: 50,
        background: 'rgba(245,240,235,0.95)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        padding: '12px 40px', display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button
          onClick={handleViewArea1Map}
          aria-label="Go back to Area 1 map"
          style={{
            width: 38, height: 38, borderRadius: 9,
            border: '1px solid rgba(0,0,0,0.12)', background: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: '#374151', fontSize: 18, fontWeight: 700,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
          onFocus={e => { e.currentTarget.style.outline = '2px solid #2563eb'; e.currentTarget.style.outlineOffset = '2px' }}
          onBlur={e => { e.currentTarget.style.outline = 'none' }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#1a2436', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {mapButtonTitle}
          </p>
          <p style={{ fontSize: 13, color: '#4b5563', marginTop: 3 }}>
            {data ? `${shortLabel(data.area1, 24)} vs ${shortLabel(data.area2, 24)}` : 'Compare two areas side by side'}
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
      </nav>

      <div className="nwPage" style={{ paddingTop: 24 }}>

      <div className="nwCompareTopGrid" role="group" aria-label="Select areas to compare">
        {renderAreaPanel(firstArea, 0)}
        {renderAreaPanel(secondArea, 1)}
      </div>

      <div className="nwCard nwCompareResultsCard" style={{ position: 'relative', minHeight: 120 }}>
        <LoadingOverlay show={loading} label="Loading comparison…" />

        <div aria-live="polite" aria-atomic="true" style={{ minHeight: 24 }}>
          {hint && !loading ? (
            <div style={{ color: 'var(--muted-dark)', fontSize: 15, lineHeight: 1.6, padding: '8px 0' }}>
              {hint}
            </div>
          ) : null}
        </div>

        {!loading && error ? (
          <div className="nwError" role="alert" aria-live="assertive">{error}</div>
        ) : null}

        {!loading && data ? (
          <>
            <div className="nwCompareScoreSummary">
              <div
                className="nwCompareScoreBox"
                style={{ textAlign: 'right', ...(winner === 1 ? { borderColor: 'var(--accent-2)', background: 'var(--teal-bg)' } : {}) }}
              >
                {winner === 1 && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                    ★ Higher Score
                  </div>
                )}
                <div className="nwCompareScoreLabel" title={data.area1}>{shortLabel(data.area1)}</div>
                <div className="nwCompareScoreValue">{data.overall1}<span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted-dark)' }}> / 100</span></div>
              </div>

              <div className="nwCompareScoreDivider">vs</div>

              <div
                className="nwCompareScoreBox"
                style={winner === 2 ? { borderColor: 'var(--accent-2)', background: 'var(--teal-bg)' } : {}}
              >
                {winner === 2 && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                    ★ Higher Score
                  </div>
                )}
                <div className="nwCompareScoreLabel" title={data.area2}>{shortLabel(data.area2)}</div>
                <div className="nwCompareScoreValue">{data.overall2}<span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted-dark)' }}> / 100</span></div>
              </div>
            </div>

            <table className="nwCompareTable" aria-label="Comparison table">
              <thead>
                <tr>
                  <th style={{ width: '42%', textAlign: 'right' }} title={data.area1}>{shortLabel(data.area1, 22)}</th>
                  <th style={{ width: '16%', textAlign: 'center' }}>Category</th>
                  <th style={{ width: '42%', textAlign: 'left' }} title={data.area2}>{shortLabel(data.area2, 22)}</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_KEYS.map((key) => {
                  const s1 = data.scores[key][0]
                  const s2 = data.scores[key][1]
                  const meta = CATEGORY_META[key] || {}
                  const cc = CATEGORY_COLORS[key] || {}
                  return (
                    <tr key={key}>
                      {/* LEFT — right-aligned, bar grows right→left */}
                      <td style={{ textAlign: 'right', ...(s1 > s2 ? { background: 'rgba(42,157,143,0.06)' } : {}) }}>
                        <div className="nwCompareCellScore" style={s1 > s2 ? { color: 'var(--accent-2)' } : {}}>
                          {s1} / 100
                        </div>
                        {miniProgress(s1, 100, tableReady, 'left')}
                      </td>
                      {/* CENTRE — icon left + bold label right, horizontal */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '14px 6px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 32, height: 32, borderRadius: 9,
                            background: meta.tint,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, flexShrink: 0,
                          }} aria-hidden="true">
                            {meta.icon}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#1a2436', whiteSpace: 'nowrap' }}>
                            {labelForCategory(key)}
                          </span>
                        </div>
                      </td>
                      {/* RIGHT — left-aligned, bar grows left→right */}
                      <td style={{ textAlign: 'left', ...(s2 > s1 ? { background: 'rgba(42,157,143,0.06)' } : {}) }}>
                        <div className="nwCompareCellScore" style={s2 > s1 ? { color: 'var(--accent-2)' } : {}}>
                          {s2} / 100
                        </div>
                        {miniProgress(s2, 100, tableReady, 'right')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <CompareInsightsTable data={data} />

            <div
              className="nwCompareRecommendation"
              style={{ borderLeftWidth: 4, borderLeftColor: 'var(--accent-2)', borderLeftStyle: 'solid', background: 'var(--teal-bg)' }}
            >
              <div className="nwCompareRecommendationTitle" style={{ color: 'var(--accent-2)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Overall Verdict
              </div>
              <p className="nwCompareRecommendationText" style={{ color: 'var(--text-dark)', fontWeight: 600, fontSize: 16, lineHeight: 1.6 }}>
                {data.recommendation}
              </p>
            </div>

            {/* Find a Better Area */}
            <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1.5px solid #e5e7eb', textAlign: 'center' }}>
              <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 }}>
                Find a Better Match
              </p>
              <h3 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 400, color: '#1a2436', margin: '0 0 8px', lineHeight: 1.15 }}>
                Not satisfied? Find a suburb that does better.
              </h3>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 6, lineHeight: 1.6 }}>
                Pick a score category below, then choose which area to use as a starting point. We'll find a nearby suburb that scores higher in that category while keeping its other scores comparable.
              </p>

              {/* Step 1: Category */}
              <p style={{ fontSize: 11, fontWeight: 800, color: '#374151', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Step 1: Choose a priority
              </p>

              {/* Category buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: recCategory ? 18 : 0, justifyContent: 'center' }}>
                {CATEGORY_KEYS.map((key) => {
                  const meta = CATEGORY_META[key]
                  const cc = CATEGORY_COLORS[key]
                  const active = recCategory === key
                  return (
                    <button
                      key={key}
                      onClick={() => { setRecCategory(key); setRecBaseline(null); setRecResult(null) }}
                      style={{
                        all: 'unset', cursor: 'pointer',
                        padding: '9px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                        border: active ? `2px solid ${cc.color}` : '1.5px solid #e5e7eb',
                        background: active ? cc.soft : '#fff',
                        color: active ? cc.color : '#374151',
                        transition: 'all 0.15s',
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        boxShadow: active ? `0 2px 10px ${cc.color}28` : 'none',
                      }}
                    >
                      <span>{meta.icon}</span> {meta.label}
                    </button>
                  )
                })}
              </div>

              {/* Baseline picker */}
              {recCategory && (
                <div style={{
                  background: '#f8fafc', border: '1.5px solid #e5e7eb',
                  borderRadius: 12, padding: '14px 16px', marginBottom: 16,
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#374151', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Step 2: Which area should we improve on?
                  </p>
                  <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                    We'll search near the area you pick.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {[
                      { n: 1, label: data.area1, color: '#2a9d8f', soft: '#e8f7f5', border: '#9dd6cf' },
                      { n: 2, label: data.area2, color: '#f47c20', soft: '#fff3e7', border: '#ffc896' },
                    ].map(({ n, label, color, soft, border }) => {
                      const active = recBaseline === n
                      return (
                        <button
                          key={n}
                          onClick={() => { setRecBaseline(n); setRecResult(null) }}
                          style={{
                            all: 'unset', cursor: 'pointer',
                            padding: '9px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                            border: active ? `2px solid ${color}` : '1.5px solid #e5e7eb',
                            background: active ? soft : '#fff',
                            color: active ? color : '#374151',
                            transition: 'all 0.15s',
                            display: 'inline-flex', alignItems: 'center', gap: 7,
                            boxShadow: active ? `0 2px 10px ${color}28` : 'none',
                          }}
                        >
                          <span style={{ fontSize: 11, opacity: 0.55 }}>Area {n}</span>
                          {shortLabel(label, 20)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Recommend button + result — constrained width, centred */}
              <div ref={recButtonRef} style={{ maxWidth: 960, margin: '0 auto', width: '100%' }}>
                {recCategory && recBaseline && !recResult && !recFinding && (
                  <button
                    onClick={handleFindRecommendation}
                    style={{
                      all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      padding: '14px 20px', borderRadius: 12,
                      background: 'linear-gradient(135deg, #f59648 0%, #f47c20 52%, #e06818 100%)',
                      color: '#fff', fontSize: 16, fontWeight: 800,
                      letterSpacing: '0.01em',
                      boxShadow: '0 4px 18px rgba(244,124,32,0.38)',
                      transition: 'opacity 0.15s, transform 0.15s',
                      marginBottom: 4,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
                  >
                    Recommend another suburb
                  </button>
                )}

                {/* Loading state while searching */}
                {recFinding && (
                  <div style={{
                    width: '100%', boxSizing: 'border-box', padding: '14px 20px', borderRadius: 12,
                    background: 'rgba(244,124,32,0.08)', border: '1.5px solid #fed7aa',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                    marginBottom: 4,
                  }}>
                    <span style={{
                      display: 'inline-block', width: 18, height: 18, flexShrink: 0,
                      border: '2.5px solid rgba(244,124,32,0.25)', borderTopColor: '#f47c20',
                      borderRadius: '50%', animation: 'nwSpin 0.7s linear infinite',
                    }} aria-hidden="true" />
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#f47c20' }}>
                      Searching for a better suburb…
                    </span>
                  </div>
                )}

                {/* Result card */}
                {recResult && <div ref={recResultRef} />}
                {recResult && (
                  recResult.noMatch ? (
                    <div style={{ marginTop: 14, padding: '14px 16px', background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 14, textAlign: 'center' }}>
                      <p style={{ fontSize: 14, color: '#92400e', fontWeight: 600 }}>
                        No nearby area found that scores higher in {CATEGORY_META[recCategory]?.label.toLowerCase()} while keeping other categories comparable. Try a different category.
                      </p>
                    </div>
                  ) : (
                    <div style={{
                      marginTop: 14,
                      background: '#fff',
                      border: '1.5px solid #e5e7eb',
                      borderRadius: 16, overflow: 'hidden',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                      animation: 'nwRecFadeIn 0.35s ease both',
                    }}>
                      <style>{`@keyframes nwRecFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }`}</style>

                      {/* Header strip — left: name, right: animated circle gauge */}
                      <div style={{ background: 'linear-gradient(105deg, #1a1a2e 0%, #0f3460 100%)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                        {/* Left: label + name */}
                        <div style={{ textAlign: 'left' }}>
                          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                            Recommended Area
                          </p>
                          <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', color: '#fff', fontWeight: 400, lineHeight: 1.05 }}>
                            {recResult.name}
                          </p>
                          {recResult.dist != null && (
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginTop: 8 }}>
                              {recResult.dist.toFixed(1)} km from {recResult.baselineName}
                            </p>
                          )}
                        </div>
                        {/* Right: animated circle gauge */}
                        {(() => {
                          const R = 40, circ = 2 * Math.PI * R
                          const offset = recGaugeReady ? circ * (1 - recResult.scores.overall / 100) : circ
                          return (
                            <svg width="108" height="108" viewBox="0 0 108 108" style={{ flexShrink: 0, overflow: 'visible' }} aria-hidden="true">
                              <circle cx="54" cy="54" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
                              <circle cx="54" cy="54" r={R} fill="none"
                                stroke="#f47c20" strokeWidth="5" strokeLinecap="round"
                                strokeDasharray={circ} strokeDashoffset={offset}
                                transform="rotate(-90 54 54)"
                                style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)' }}
                              />
                              <text x="54" y="50" textAnchor="middle" dominantBaseline="middle"
                                fill="#fff" fontSize="30"
                                fontFamily="'DM Serif Display', Georgia, serif">
                                {recResult.scores.overall}
                              </text>
                              <text x="54" y="70" textAnchor="middle"
                                fill="rgba(255,255,255,0.4)" fontSize="8" fontWeight="800" letterSpacing="1.5">
                                OVERALL
                              </text>
                            </svg>
                          )
                        })()}
                      </div>

                      <div style={{ padding: '18px 20px', textAlign: 'center' }}>
                        {/* All 3 categories in one row — featured is bigger */}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'flex-end', marginBottom: 10 }}>
                          {CATEGORY_KEYS.map(k => {
                            const cc = CATEGORY_COLORS[k]
                            const isFeatured = k === recCategory
                            return (
                              <div key={k} style={{
                                flex: 1, minWidth: 0,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                                background: cc.soft, border: `1.5px solid ${isFeatured ? cc.color : cc.border}`,
                                borderRadius: 14, padding: isFeatured ? '16px 12px' : '12px 12px',
                                transition: 'all 0.2s',
                                boxShadow: isFeatured ? `0 4px 16px ${cc.color}30` : 'none',
                              }}>
                                <span style={{ fontSize: isFeatured ? 18 : 14 }}>{CATEGORY_META[k].icon}</span>
                                <span style={{ fontSize: isFeatured ? 18 : 15, fontWeight: 800, color: cc.color, textAlign: 'center' }}>
                                  {CATEGORY_META[k].label}
                                </span>
                                <span style={{ fontSize: isFeatured ? 26 : 20, fontWeight: 900, color: cc.color, lineHeight: 1 }}>
                                  {recResult.scores[k]}
                                </span>
                                {isFeatured && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '2px 8px', marginTop: 2 }}>
                                    +{recResult.gain} pts
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, marginBottom: 16 }}>
                          {recResult.reason}
                        </p>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <button
                            onClick={() => navigate('/insights', {
                              state: {
                                selectedLocation: { lat: recResult.lat, lng: recResult.lng, displayName: recResult.name, name: recResult.name },
                                profile: firstArea?.profile,
                                rangeMinutes: firstArea?.rangeMinutes || 20,
                              }
                            })}
                            style={{
                              all: 'unset', cursor: 'pointer',
                              padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                              background: 'linear-gradient(135deg, #f59648 0%, #f47c20 100%)',
                              color: '#fff',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              boxShadow: '0 2px 10px rgba(244,124,32,0.32)',
                              transition: 'opacity 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                          >
                            📊 See Detailed Insights
                          </button>
                          <button
                            onClick={() => {
                              const item = { displayName: recResult.name, name: recResult.name, lat: recResult.lat, lng: recResult.lng, rangeMinutes: 20 }
                              const result = addToCompareList(item)
                              if (result?.reason === 'ALREADY_EXISTS') {
                                setRecToastMsg('Already in your compare list.')
                                setRecToastAction(null)
                              } else if (result?.reason === 'COMPARE_FULL') {
                                setRecReplaceModal({ pendingItem: item, currentList: result.current })
                              } else {
                                setRecToastMsg('Added to compare list.')
                                setRecToastAction(null)
                              }
                            }}
                            style={{
                              all: 'unset', cursor: 'pointer',
                              padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                              background: '#fff', color: '#374151',
                              border: '1.5px solid #e5e7eb',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              transition: 'border-color 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb' }}
                          >
                            ＋ Add to Compare
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        ) : null}

        {/* Clear All — available while no comparison is loaded yet */}
        {!data && !loading && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => {
                clearCompareList()
                setCompareList([])
                setAddingIndex(null)
                setSearchTerm('')
                setData(null)
              }}
              style={{
                all: 'unset', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: '#9ca3af',
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      </div>

      {/* Replace modal for rec card */}
      {recReplaceModal && (
        <CompareReplaceModal
          pendingItem={recReplaceModal.pendingItem}
          currentList={recReplaceModal.currentList}
          onReplace={(index) => {
            replaceCompareArea(index, recReplaceModal.pendingItem)

            const updated = loadCompareList()
            setCompareList(updated)

            setRecReplaceModal(null)
            setRecToastMsg('Compare area replaced.')
            setRecToastAction(null)

            setRecResult(null)
            setRecCategory(null)
            setRecBaseline(null)
          }}
          onClose={() => setRecReplaceModal(null)}
        />
      )}

      {/* Change Conditions modal */}
      {showConditionsModal && (
        <ChangeConditionsModal
          rangeMinutes={firstArea?.rangeMinutes ?? 20}
          profile={sharedCompareProfile}
          onSave={({ rangeMinutes: newRange, profile: newProfile }) => {
            // Apply the new range and profile to all compare list items
            const updated = compareList.map(item => ({
              ...item,
              rangeMinutes: newRange,
              profile: newProfile,
            }))
            saveCompareList(updated)
            setCompareList(updated)
            setShowConditionsModal(false)

            // Clear old recommendation because the scoring conditions changed
            setRecResult(null)
            setRecCategory(null)
            setRecBaseline(null)
          }}
          onClose={() => setShowConditionsModal(false)}
        />
      )}

    </div>
  )
}
