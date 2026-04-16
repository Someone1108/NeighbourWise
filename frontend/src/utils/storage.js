const KEY = 'neighbourwise_context_v1'
const COMPARE_KEY = 'neighbourwise_compare_list_v1'
const COMPARE_UPDATED_EVENT = 'neighbourwise-compare-updated'

function normalizeRangeMinutes(value) {
  const n = Number(value)
  if ([10, 20, 30].includes(n)) return n
  return 20
}

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

  const name = getSafeLocationName(item).toLowerCase()
  if (name) return `name:${name}`

  return ''
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
    return parsed
  } catch {
    return []
  }
}

export function saveCompareList(list) {
  try {
    const safe = Array.isArray(list) ? list : []
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

  if (!compareKey || !locationName) return current

  const normalizedSelectedLocation = normalizeSelectedLocation(item)

  const next = current.filter((x) => {
    const existingKey = getSafeCompareKey(x)
    return existingKey !== compareKey
  })

  next.push({
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
  })

  const capped = next.slice(-2)
  saveCompareList(capped)
  return capped
}

export function clearCompareList() {
  saveCompareList([])
}

export function removeFromCompareList(locationNameOrItem) {
  const key =
    typeof locationNameOrItem === 'object'
      ? getSafeCompareKey(locationNameOrItem)
      : `name:${String(locationNameOrItem || '').trim().toLowerCase()}`

  if (!key || key === 'name:') return loadCompareList()

  const current = loadCompareList()
  const next = current.filter((x) => {
    const existingKey = getSafeCompareKey(x)
    return existingKey !== key
  })

  saveCompareList(next)
  return next
}