export function inferSuburbFromAddress(value) {
  const text = String(value || '').trim()
  if (!text) return ''

  const commaMatch = text.match(/,\s*([^,]+?)\s+(?:VIC|Victoria)\s+\d{4}\b/i)
  if (commaMatch?.[1]) {
    return cleanSuburbName(commaMatch[1])
  }

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

  return cleanSuburbName(streetMatch[1])
}

function cleanSuburbName(value) {
  return String(value || '')
    .replace(/\bVIC\b|\bVictoria\b|\bAustralia\b/gi, '')
    .replace(/\b\d{4}\b/g, '')
    .trim()
}

export function normalizeRangeMinutes(value) {
  const minutes = Number(value)
  if ([10, 20, 30].includes(minutes)) return minutes
  return 20
}
