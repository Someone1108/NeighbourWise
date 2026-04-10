const CATEGORY_LABELS = {
  accessibility: 'Accessibility',
  safety: 'Safety',
  environment: 'Environment',
}

const DEFAULT_RANGE_RADIUS_METERS = {
  10: 1200,
  20: 2200,
  30: 3200,
}

const API_BASE_URL = 'http://localhost:5050'

// A tiny deterministic hash so mock data is stable per input.
function hashString(input) {
  const str = String(input)
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function stableScore(seed, offset, min = 35, max = 95) {
  // Simple deterministic mapping (mock backend), not front-end business logic.
  const h = hashString(`${seed}:${offset}`)
  return min + (h % (max - min + 1))
}

function geocodeMock(locationName) {
  const key = String(locationName).trim().toLowerCase()
  const known = {
    clayton: { lat: -37.918, lng: 145.139 },
    caulfield: { lat: -37.882, lng: 145.026 },
    'caulfield north': { lat: -37.89, lng: 145.04 },
    'monash university': { lat: -37.911, lng: 145.135 },
    carnegie: { lat: -37.901, lng: 145.042 },
    footscray: { lat: -37.804, lng: 144.9 },
    'melbourne cbd': { lat: -37.8136, lng: 144.9631 },
  }

  if (known[key]) return known[key]
  return known['melbourne cbd']
}

function formatAreaName(locationName) {
  const s = String(locationName).trim()
  if (!s) return 'Selected Area'
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function profileSignature(profile) {
  const p = profile || {}
  const parts = [
    p.familyWithChildren ? 'family' : '',
    p.elderly ? 'elderly' : '',
    p.petOwner ? 'pet' : '',
  ].filter(Boolean)

  return parts.length ? parts.sort().join('-') : 'general'
}

async function fetchJson(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.json()
}

/**
 * REAL BACKEND SEARCH
 * Returns suburb/locality matches from your backend locality point dataset.
 */
export async function searchLocalities(query) {
  const q = String(query || '').trim()

  if (!q) return []

  const results = await fetchJson(
    `${API_BASE_URL}/api/search/localities?q=${encodeURIComponent(q)}`
  )

  return results.map((item) => ({
    ...item,
    type: 'suburb',
    displayName: item.name,
  }))
}

/**
 * REAL BACKEND ADDRESS SEARCH
 * Returns address matches from backend Mapbox endpoint.
 */
export async function searchAddresses(query) {
  const q = String(query || '').trim()

  if (!q) return []

  const results = await fetchJson(
    `${API_BASE_URL}/api/search/address?q=${encodeURIComponent(q)}`
  )

  return results.map((item) => ({
    ...item,
    type: 'address',
    displayName: item.fullAddress || item.name,
  }))
}

/**
 * REAL BACKEND POLYGON
 * Returns selected suburb polygon from your backend locality polygon dataset.
 */
export async function getLocalityPolygon(name) {
  const suburbName = String(name || '').trim()

  if (!suburbName) {
    throw new Error('Suburb name is required')
  }

  return fetchJson(
    `${API_BASE_URL}/api/locality/${encodeURIComponent(suburbName)}/polygon`
  )
}

/**
 * PROTOTYPE MAP CONTEXT
 * Still mock for now.
 * Later this should be replaced by a real backend endpoint.
 */
export async function getMapContext({ locationName, rangeMinutes, profile }) {
  const range = Number(rangeMinutes)
  const safeRange = [10, 20, 30].includes(range) ? range : 20

  const coords = geocodeMock(locationName)
  const seed = `${locationName}:${safeRange}:${profileSignature(profile)}`

  const accessibility = stableScore(seed, 'a', 40, 95)
  const safety = stableScore(seed, 's', 35, 92)
  const environment = stableScore(seed, 'e', 38, 94)

  const overallScore = Math.round((accessibility + safety + environment) / 3)
  const radiusMeters = DEFAULT_RANGE_RADIUS_METERS[safeRange] || 2200

  const h = hashString(seed)
  const offset1 = (h % 1000) / 100000
  const offset2 = (Math.floor(h / 7) % 1000) / 100000
  const baseLat = coords.lat
  const baseLng = coords.lng

  // Mock POIs near the selected point. These should be backend-provided in the real app.
  const pointsOfInterest = [
    {
      type: 'School',
      name: 'Nearby Primary School',
      lat: baseLat + offset1,
      lng: baseLng - offset2,
    },
    {
      type: 'Hospital',
      name: 'Local Hospital',
      lat: baseLat - offset2,
      lng: baseLng - offset1,
    },
    {
      type: 'Bus stop',
      name: 'Bus Stop',
      lat: baseLat + offset2,
      lng: baseLng + offset1,
    },
    {
      type: 'Pet-friendly park',
      name: 'Pet-friendly Park',
      lat: baseLat - offset1,
      lng: baseLng + offset2,
    },
  ]

  return {
    coordinates: coords,
    radiusMeters,
    overallScore,
    scores: {
      accessibility,
      safety,
      environment,
    },
    pointsOfInterest,
  }
}

/**
 * PROTOTYPE INSIGHTS
 * Still mock for now.
 * Later this should be backend-driven.
 */
export async function getInsights({ locationName, rangeMinutes, profile, category }) {
  const range = Number(rangeMinutes)
  const safeRange = [10, 20, 30].includes(range) ? range : 20
  const cat = String(category)

  const seed = `${locationName}:${safeRange}:${profileSignature(profile)}:${cat}`
  const h = hashString(seed)

  const templates = {
    accessibility: [
      'Train station within 15 mins',
      'Supermarket within 10 mins',
      'Bus connections to the CBD',
      'Step-free access at key locations',
    ],
    safety: [
      'Low incident risk in the area',
      'Well-lit streets after dark',
      'Safe crossings near schools',
      'Active community presence',
    ],
    environment: [
      'Nearby park and green space',
      'Air quality indicators',
      'Low noise exposure near major roads',
      'Recreational amenities within reach',
    ],
  }

  const list = templates[cat] || templates.accessibility
  const factors = list.map((name, idx) => {
    const met = (h + idx * 17) % 3 !== 0
    return { name, met }
  })

  return {
    category: cat,
    factors,
    scoreExplanation: `Mock breakdown for ${
      CATEGORY_LABELS[cat] || cat
    }. In the real project, the backend will provide which factors are met/not met based on open datasets.`,
  }
}

function adjacentAreaName(locationName) {
  const key = String(locationName).trim().toLowerCase()
  const map = {
    clayton: 'Caulfield',
    caulfield: 'Clayton',
    'caulfield north': 'Clayton',
    carnegie: 'Caulfield',
    footscray: 'Carnegie',
  }

  if (map[key]) return map[key]
  return 'Neighbouring Area'
}

/**
 * PROTOTYPE COMPARE
 * Still mock for now.
 * Later this should be backend-driven.
 */
export async function getCompareData({ locationName, rangeMinutes, profile }) {
  const range = Number(rangeMinutes)
  const safeRange = [10, 20, 30].includes(range) ? range : 20

  const area1 = formatAreaName(locationName)
  const area2 = adjacentAreaName(locationName)

  const seed = `${locationName}:${safeRange}:${profileSignature(profile)}:compare`
  const a1Seed = `${seed}:${area1}`
  const a2Seed = `${seed}:${area2}`

  const accessibility = [
    stableScore(a1Seed, 'a', 35, 95),
    stableScore(a2Seed, 'a', 35, 95),
  ]
  const safety = [
    stableScore(a1Seed, 's', 35, 95),
    stableScore(a2Seed, 's', 35, 95),
  ]
  const environment = [
    stableScore(a1Seed, 'e', 35, 95),
    stableScore(a2Seed, 'e', 35, 95),
  ]

  const deltas = [
    { key: 'accessibility', delta: accessibility[0] - accessibility[1] },
    { key: 'safety', delta: safety[0] - safety[1] },
    { key: 'environment', delta: environment[0] - environment[1] },
  ]

  deltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  const best = deltas[0]

  let recommendation = `Recommendation is based on ${CATEGORY_LABELS[best.key]}.`
  if (best.delta > 0) {
    recommendation = `${area1} is better for ${CATEGORY_LABELS[
      best.key
    ].toLowerCase()}`
  } else if (best.delta < 0) {
    recommendation = `${area2} is better for ${CATEGORY_LABELS[
      best.key
    ].toLowerCase()}`
  }

  return {
    area1,
    area2,
    scores: {
      accessibility,
      safety,
      environment,
    },
    recommendation,
  }
}

export function validateSearchInput(input) {
  const s = String(input || '').trim()

  if (!s) {
    return { ok: false, message: 'Please enter a suburb or address.' }
  }

  if (s.length < 3) {
    return { ok: false, message: 'Input is too short. Please be more specific.' }
  }

  return { ok: true, message: '' }
}

export async function getTestLayerData() {
  return fetchJson(`${API_BASE_URL}/api/layers/test/epping`)
}