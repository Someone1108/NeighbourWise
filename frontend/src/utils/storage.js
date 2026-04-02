const KEY = 'neighbourwise_context_v1'
const COMPARE_KEY = 'neighbourwise_compare_list_v1'
const COMPARE_UPDATED_EVENT = 'neighbourwise-compare-updated'

function normalizeRangeMinutes(value) {
  const n = Number(value)
  if ([10, 20, 30].includes(n)) return n
  return 20
}

export function saveContext(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Ignore storage errors (private mode / blocked)
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
  const key = String(item?.locationName || '').trim().toLowerCase()
  if (!key) return current

  const next = current.filter(
    (x) => String(x?.locationName || '').trim().toLowerCase() !== key
  )

  next.push({
    locationName: String(item.locationName).trim(),
    profile: item.profile || {},
    rangeMinutes: normalizeRangeMinutes(item.rangeMinutes),
    addedAt: Date.now(),
  })

  // Keep only the last 2 selections for compare.
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

