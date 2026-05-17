const MELBOURNE_SUBURB_POOL = [
  { name: 'Fitzroy', baseDist: 1.2, lat: -37.7963, lng: 144.9778 },
  { name: 'Collingwood', baseDist: 1.5, lat: -37.8041, lng: 144.9848 },
  { name: 'Abbotsford', baseDist: 2.0, lat: -37.8044, lng: 144.9935 },
  { name: 'South Yarra', baseDist: 2.4, lat: -37.8390, lng: 144.9947 },
  { name: 'Prahran', baseDist: 2.9, lat: -37.8497, lng: 144.9904 },
  { name: 'Hawthorn', baseDist: 3.6, lat: -37.8218, lng: 145.0266 },
  { name: 'Kew', baseDist: 4.3, lat: -37.8024, lng: 145.0313 },
  { name: 'Carlton', baseDist: 0.9, lat: -37.7983, lng: 144.9665 },
  { name: 'Brunswick', baseDist: 2.7, lat: -37.7671, lng: 144.9643 },
  { name: 'Northcote', baseDist: 3.9, lat: -37.7735, lng: 145.0098 },
  { name: 'Cremorne', baseDist: 1.8, lat: -37.8282, lng: 144.9969 },
  { name: 'East Melbourne', baseDist: 1.1, lat: -37.8149, lng: 144.9847 },
]

export function generateSimilarSuburbs(overallScore, scores) {
  if (!overallScore || !scores) return []
  const clampScore = (score, min, max) => Math.round(Math.max(min, Math.min(max, score)))
  return MELBOURNE_SUBURB_POOL.map((suburb, index) => {
    const variedScore = (baseScore) => clampScore(baseScore + Math.sin(index * 2.37 + 1.1) * 9, 35, 94)
    return {
      name: suburb.name,
      lat: suburb.lat,
      lng: suburb.lng,
      score: variedScore(overallScore),
      match: Math.max(72, Math.round(96 - index * 2.8)),
      distanceKm: suburb.baseDist,
      accessibilityScore: variedScore(scores.accessibility ?? 60),
      safetyScore: variedScore(scores.safety ?? 60),
      environmentScore: variedScore(scores.environment ?? 60),
    }
  })
}
