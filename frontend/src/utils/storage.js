const KEY = 'neighbourwise_context_v1'
const COMPARE_KEY = 'neighbourwise_compare_list_v1'
const COMPARE_UPDATED_EVENT = 'neighbourwise-compare-updated'

function normalizeRangeMinutes(value) {
  const n = Number(value)
  if ([10, 20, 30].includes(n)) return n
  return 20
}

// The core purpose of these three functions is:
// Because different pages and APIs may return data in different formats,
// the system first standardizes the data structure to prevent errors in the Compare feature.
function getSafeLocationName(item) {
  return String(
    item?.locationName ||
      item?.displayName ||
      item?.fullAddress ||
      item?.name ||
      item?.selectedLocation?.displayName ||
      item?.selectedLocation?.fullAddress ||
      item?.selectedLocation?.name ||
      ''
  ).trim()
}

function normalizeCompareName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function getSafeLocationId(item) {
  return String(
    item?.id ||
      item?.selectedLocation?.id ||
      ''
  ).trim()
}

function getSafeCompareKey(item) {
  const id = getSafeLocationId(item)
  if (id) return `id:${id}`

  const name = normalizeCompareName(getSafeLocationName(item))
  if (name) return `name:${name}`

  return ''
}

export function isSameCompareArea(a, b) {
  const keyA = getSafeCompareKey(a)
  const keyB = getSafeCompareKey(b)

  if (keyA && keyB && keyA === keyB) return true

  const nameA = normalizeCompareName(getSafeLocationName(a))
  const nameB = normalizeCompareName(getSafeLocationName(b))

  if (nameA && nameB && nameA === nameB) return true

  const latA = Number(a?.lat ?? a?.selectedLocation?.lat)
  const lngA = Number(a?.lng ?? a?.selectedLocation?.lng)
  const latB = Number(b?.lat ?? b?.selectedLocation?.lat)
  const lngB = Number(b?.lng ?? b?.selectedLocation?.lng)

  return (
    Number.isFinite(latA) &&
    Number.isFinite(lngA) &&
    Number.isFinite(latB) &&
    Number.isFinite(lngB) &&
    Math.abs(latA - latB) < 0.00001 &&
    Math.abs(lngA - lngB) < 0.00001
  )
}

function normalizeSelectedLocation(item) {
  const selectedLocation = item?.selectedLocation || item || {}

  return {
    id: selectedLocation?.id || item?.id || '',
    displayName: String(
      selectedLocation?.displayName ||
        selectedLocation?.fullAddress ||
        selectedLocation?.name ||
        item?.displayName ||
        item?.fullAddress ||
        item?.name ||
        ''
    ).trim(),
    fullAddress: String(
      selectedLocation?.fullAddress ||
        item?.fullAddress ||
        ''
    ).trim(),
    name: String(
      selectedLocation?.name ||
        item?.name ||
        ''
    ).trim(),
    type: selectedLocation?.type || selectedLocation?.placeType || item?.type || item?.placeType || 'suburb',
    placeType:
      selectedLocation?.placeType || item?.placeType || selectedLocation?.type || item?.type || 'suburb',
    postcode:
      selectedLocation?.postcode || item?.postcode || null,
    lat: selectedLocation?.lat ?? item?.lat ?? null,
    lng: selectedLocation?.lng ?? item?.lng ?? null,
    source: selectedLocation?.source || item?.source || '',
  }
}

export function saveContext(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore storage errors
  }
}

export function loadContext() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearContext() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

// Trigger a custom event to notify the system that the Compare List has been updated.
function emitCompareUpdated() {
  try {
    window.dispatchEvent(new Event(COMPARE_UPDATED_EVENT))
  } catch {
    // ignore
  }
}

export function getCompareUpdatedEventName() {
  return COMPARE_UPDATED_EVENT
}

export function loadCompareList() {
  try {
    const raw = localStorage.getItem(COMPARE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return dedupeCompareList(parsed)
  } catch {
    return []
  }
}

function dedupeCompareList(list) {
  const safe = Array.isArray(list) ? list : []
  const next = []

  for (const item of safe) {
    if (!item) continue
    if (next.some((existing) => isSameCompareArea(existing, item))) continue
    next.push(item)
    if (next.length >= 2) break
  }

  return next
}

export function saveCompareList(list) {
  try {
    const safe = dedupeCompareList(list)
    localStorage.setItem(COMPARE_KEY, JSON.stringify(safe))
    emitCompareUpdated()
  } catch {
    // ignore
  }
}

export function addToCompareList(item) {
  const current = loadCompareList()
  const locationName = getSafeLocationName(item)
  const compareKey = getSafeCompareKey(item)

  if (!compareKey || !locationName) {
    return {
      success: false,
      reason: 'INVALID_AREA',
      current
    }
  }

  // If the same area already exists, do not add it again.
  // Cross-check by name as well to catch cases where one item has an id and
  // the other was built without one (e.g. added from MapPage vs InsightsPage).
  const alreadyExists = current.some((x) => {
    return isSameCompareArea(x, item)
  })

  if (alreadyExists) {
    return {
      success: true,
      reason: 'ALREADY_EXISTS',
      list: current
    }
  }

  // If both Area1 and Area2 already exist, do not add the new area directly
  // Let the frontend show Replace Area1 / Replace Area2 / Cancel instead
  if (current.length >= 2) {
    return {
      success: false,
      reason: 'COMPARE_FULL',
      current,
      pendingItem: item
    }
  }

  const normalizedSelectedLocation = normalizeSelectedLocation(item)

  const newArea = {
    compareKey,
    id: normalizedSelectedLocation.id,
    locationName,
    displayName: String(
      item?.displayName ||
        normalizedSelectedLocation.displayName ||
        locationName
    ).trim(),
    fullAddress: String(
      item?.fullAddress ||
        normalizedSelectedLocation.fullAddress ||
        ''
    ).trim(),
    name: String(
      item?.name ||
        normalizedSelectedLocation.name ||
        ''
    ).trim(),
    type: item?.type || item?.placeType || normalizedSelectedLocation.type || 'suburb',
    placeType:
      item?.placeType || normalizedSelectedLocation.placeType || item?.type || 'suburb',
    postcode:
      item?.postcode || normalizedSelectedLocation.postcode || null,
    lat: item?.lat ?? normalizedSelectedLocation.lat ?? null,
    lng: item?.lng ?? normalizedSelectedLocation.lng ?? null,
    source: item?.source || normalizedSelectedLocation.source || '',
    profile: item?.profile || {},
    rangeMinutes: normalizeRangeMinutes(item?.rangeMinutes),
    selectedLocation: normalizedSelectedLocation,
    addedAt: Date.now(),
  }

  const next = [...current, newArea]

  saveCompareList(next)

  return {
    success: true,
    reason: 'ADDED',
    list: next
  }
}

// Replace one compare area in the Compare Page, either Area1 or Area2
export function replaceCompareArea(index, item) {
  const current = loadCompareList()

  if (![0, 1].includes(index)) {
    return current
  }

  const locationName = getSafeLocationName(item)
  const compareKey = getSafeCompareKey(item)

  if (!compareKey || !locationName) {
    return current
  }

  const normalizedSelectedLocation = normalizeSelectedLocation(item)

  const newArea = {
    compareKey,
    id: normalizedSelectedLocation.id,
    locationName,
    displayName: String(
      item?.displayName ||
        normalizedSelectedLocation.displayName ||
        locationName
    ).trim(),
    fullAddress: String(
      item?.fullAddress ||
        normalizedSelectedLocation.fullAddress ||
        ''
    ).trim(),
    name: String(
      item?.name ||
        normalizedSelectedLocation.name ||
        ''
    ).trim(),
    type:
      item?.type ||
      item?.placeType ||
      normalizedSelectedLocation.type ||
      'suburb',
    placeType:
      item?.placeType ||
      normalizedSelectedLocation.placeType ||
      item?.type ||
      'suburb',
    postcode:
      item?.postcode ||
      normalizedSelectedLocation.postcode ||
      null,
    lat: item?.lat ?? normalizedSelectedLocation.lat ?? null,
    lng: item?.lng ?? normalizedSelectedLocation.lng ?? null,
    source:
      item?.source ||
      normalizedSelectedLocation.source ||
      '',
    profile: item?.profile || {},
    rangeMinutes: normalizeRangeMinutes(item?.rangeMinutes),
    selectedLocation: normalizedSelectedLocation,
    addedAt: Date.now(),
  }

  const next = [...current]
  const duplicateOtherArea = next.some((existing, existingIndex) => {
    return existingIndex !== index && isSameCompareArea(existing, item)
  })

  if (duplicateOtherArea) {
    return current
  }

  next[index] = newArea

  saveCompareList(next)

  return next
}

export function clearCompareList() {
  saveCompareList([])
}

export function removeFromCompareList(locationNameOrItem) {
  const key =
    typeof locationNameOrItem === 'object'
      ? getSafeCompareKey(locationNameOrItem)
      : `name:${normalizeCompareName(locationNameOrItem)}`

  if (!key || key === 'name:') return loadCompareList()

  const current = loadCompareList()
  const next = current.filter((x) => {
    const existingKey = getSafeCompareKey(x)
    return existingKey !== key
  })

  saveCompareList(next)
  return next
}
