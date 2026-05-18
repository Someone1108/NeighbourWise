export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 'Unavailable'
  return Math.round(numericValue).toLocaleString('en-AU')
}

export function formatPercent(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 'Unavailable'
  return `${Math.round(numericValue * 10) / 10}%`
}

export function formatSafePercent(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) return 'Unavailable'
  return `${Math.round(numericValue * 10) / 10}%`
}

export function formatMoney(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 'Unavailable'
  return `$${Math.round(numericValue).toLocaleString('en-AU')}${suffix}`
}

export function weeklyToMonthly(value, weeksPerYear = 365 / 7) {
  if (value === null || value === undefined || value === '') return null
  const weeklyValue = Number(value)
  if (!Number.isFinite(weeklyValue)) return null
  return (weeklyValue * weeksPerYear) / 12
}
