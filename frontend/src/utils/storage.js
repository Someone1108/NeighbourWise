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
  const key = locationName.toLowerCase()

  if (!key) return current

  const selectedLocation = item?.selectedLocation || null

  const next = current.filter(
    (x) => String(x?.locationName || '').trim().toLowerCase() !== key
  )

  next.push({
    locationName,
    displayName: String(item?.displayName || locationName).trim(),
    fullAddress: String(item?.fullAddress || '').trim(),
    name: String(item?.name || selectedLocation?.name || '').trim(),
    type: item?.type || selectedLocation?.type || 'suburb',
    lat: item?.lat ?? selectedLocation?.lat ?? null,
    lng: item?.lng ?? selectedLocation?.lng ?? null,
    profile: item?.profile || {},
    rangeMinutes: normalizeRangeMinutes(item?.rangeMinutes),
    selectedLocation: selectedLocation || {
      displayName: item?.displayName || '',
      fullAddress: item?.fullAddress || '',
      name: item?.name || '',
      type: item?.type || 'suburb',
      lat: item?.lat ?? null,
      lng: item?.lng ?? null,
    },
    addedAt: Date.now(),
  })

  const capped = next.slice(-2)
  saveCompareList(capped)
  return capped
}

export function clearCompareList() {
  saveCompareList([])
}

export function removeFromCompareList(locationName) {
  const key = String(locationName || '').trim().toLowerCase()
  if (!key) return loadCompareList()

  const current = loadCompareList()
  const next = current.filter(
    (x) => String(x?.locationName || '').trim().toLowerCase() !== key
  )

  saveCompareList(next)
  return next
}