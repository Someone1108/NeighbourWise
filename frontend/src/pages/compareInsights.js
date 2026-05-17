import {
  formatMoney,
  formatNumber,
  formatPercent,
  weeklyToMonthly,
} from '../utils/formatters.js'

const CATEGORY_KEYS = ['accessibility', 'safety', 'environment']

const CATEGORY_META = {
  accessibility: { label: 'Accessibility' },
  safety: { label: 'Safety & Comfort' },
  environment: { label: 'Environment' },
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

function labelForCategory(key) {
  return CATEGORY_META[key]?.label || key
}

function buildScoreFactors(scoreData) {
  const breakdown = scoreData?.breakdown || {}
  const accessibilityBreakdown = breakdown.accessibility?.breakdown || {}
  const safetyScores = breakdown.safety?.scores || {}
  const environmentScores = breakdown.environment?.scores || {}

  const accessibility = Object.entries(accessibilityBreakdown).map(([key, item]) => ({
    category: 'Accessibility',
    name: ACCESSIBILITY_FACTOR_LABELS[key] || key.replaceAll('_', ' '),
    score: Number(item?.score),
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
    const text = `For a family household, the useful checks are ${describeFactor(findScoreFactor(scoreData, 'school'), 'school access')}, ${describeFactor(findScoreFactor(scoreData, 'park'), 'park access')} and ${describeFactor(findScoreFactor(scoreData, 'crime'), 'crime context')}. Census context adds that ${formatPercent(censusProfile.familyHouseholdsPct)} of households are family households, ${formatPercent(censusProfile.age0To14Pct)} of residents are aged 0-14 and the average household size is ${censusProfile.averageHouseholdSize ?? 'Unavailable'}.`
    return {
      label: 'Relevant for families',
      text,
      panelTitle: 'Family context',
      panelText: `${formatPercent(censusProfile.familyHouseholdsPct)} of households are family households, ${formatPercent(censusProfile.age0To14Pct)} of residents are aged 0-14 and average household size is ${censusProfile.averageHouseholdSize ?? 'Unavailable'}.`,
      stats: [
        { label: 'Family households', value: formatPercent(censusProfile.familyHouseholdsPct) },
        { label: 'Children 0-14', value: formatPercent(censusProfile.age0To14Pct) },
        { label: 'Household size', value: censusProfile.averageHouseholdSize ?? 'Unavailable' },
      ],
      scoreCards: [
        buildSituationScoreCard(findScoreFactor(scoreData, 'school'), 'School access'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'park'), 'Park access'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'crime'), 'Crime context'),
      ],
    }
  }

  if (profile?.elderly) {
    const text = `For an older resident, the useful checks are ${describeFactor(findScoreFactor(scoreData, 'hospital'), 'hospital access')}, ${describeFactor(findScoreFactor(scoreData, 'bus stop'), 'bus stop coverage')} and ${describeFactor(findScoreFactor(scoreData, 'train'), 'train station access')}. Census context adds that ${formatPercent(censusProfile.age65PlusPct)} of residents are aged 65+, ${formatPercent(censusProfile.needForAssistancePct)} report needing assistance, ${formatPercent(censusProfile.lonePersonHouseholdsPct)} of households are lone-person households and ${formatPercent(censusProfile.noCarHouseholdsPct)} have no car.`
    return {
      label: 'Relevant for older residents',
      text,
      panelTitle: 'Older resident context',
      panelText: `${formatPercent(censusProfile.age65PlusPct)} of residents are aged 65+, ${formatPercent(censusProfile.needForAssistancePct)} report needing assistance and ${formatPercent(censusProfile.noCarHouseholdsPct)} of households have no car.`,
      stats: [
        { label: 'Residents 65+', value: formatPercent(censusProfile.age65PlusPct) },
        { label: 'Need assistance', value: formatPercent(censusProfile.needForAssistancePct) },
        { label: 'Lone-person households', value: formatPercent(censusProfile.lonePersonHouseholdsPct) },
        { label: 'No-car households', value: formatPercent(censusProfile.noCarHouseholdsPct) },
      ],
      scoreCards: [
        buildSituationScoreCard(findScoreFactor(scoreData, 'hospital'), 'Hospital access'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'bus stop'), 'Bus stop coverage'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'train'), 'Train station access'),
      ],
    }
  }

  if (profile?.petOwner) {
    const hasHousingContext = censusData?.available && (
      censusProfile.rentersPct != null ||
      censusProfile.ownerOccupiedPct != null ||
      censusProfile.averageHouseholdSize != null
    )
    const text = hasHousingContext
      ? `For a pet owner, the useful checks are ${describeFactor(findScoreFactor(scoreData, 'park'), 'park access')}, ${describeFactor(findScoreFactor(scoreData, 'green'), 'green coverage')} and local housing flexibility. Census context adds that ${formatPercent(censusProfile.rentersPct)} of households rent, ${formatPercent(censusProfile.ownerOccupiedPct)} are owner-occupied and the average household size is ${censusProfile.averageHouseholdSize ?? 'Unavailable'}.`
      : `For a pet owner, the useful checks are ${describeFactor(findScoreFactor(scoreData, 'park'), 'park access')}, ${describeFactor(findScoreFactor(scoreData, 'green'), 'green coverage')} and local housing flexibility. Census housing context is unavailable for this location.`
    return {
      label: 'Relevant for pet owners',
      text,
      panelTitle: 'Pet owner context',
      panelText: hasHousingContext
        ? `${formatPercent(censusProfile.rentersPct)} of households rent, ${formatPercent(censusProfile.ownerOccupiedPct)} are owner-occupied and average household size is ${censusProfile.averageHouseholdSize ?? 'Unavailable'}.`
        : 'Census housing context is unavailable for this location.',
      stats: [
        { label: 'Renters', value: formatPercent(censusProfile.rentersPct) },
        { label: 'Owner-occupied', value: formatPercent(censusProfile.ownerOccupiedPct) },
        { label: 'Household size', value: censusProfile.averageHouseholdSize ?? 'Unavailable' },
      ],
      scoreCards: [
        buildSituationScoreCard(findScoreFactor(scoreData, 'park'), 'Park access'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'green'), 'Green coverage'),
        buildSituationScoreCard(findScoreFactor(scoreData, 'supermarket'), 'Supermarket access'),
      ],
    }
  }

  const strongestCategory = CATEGORY_KEYS
    .map((categoryKey) => ({ label: labelForCategory(categoryKey), score: Number(scoreData?.scores?.[categoryKey]) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)[0]

  const text = `For a general lifestyle comparison, ${strongestCategory ? `${strongestCategory.label.toLowerCase()} is the strongest score signal (${Math.round(strongestCategory.score)}/100). ` : ''}The Census context is also important: median age is ${censusProfile.medianAge ?? 'Unavailable'}, ${formatPercent(censusProfile.rentersPct)} of households rent and ${formatPercent(censusProfile.publicTransportToWorkPct)} of workers use public transport to work.`
  return {
    label: 'Lifestyle context',
    text,
    panelTitle: 'General context',
    panelText: `Median age is ${censusProfile.medianAge ?? 'Unavailable'}, ${formatPercent(censusProfile.rentersPct)} of households rent and ${formatPercent(censusProfile.publicTransportToWorkPct)} of workers use public transport to work.`,
    stats: [
      { label: 'Median age', value: censusProfile.medianAge ?? 'Unavailable' },
      { label: 'Renters', value: formatPercent(censusProfile.rentersPct) },
      { label: 'Public transport to work', value: formatPercent(censusProfile.publicTransportToWorkPct) },
    ],
    scoreCards: [
      buildSituationScoreCard(findScoreFactor(scoreData, 'bus stop'), 'Bus stop coverage'),
      buildSituationScoreCard(findScoreFactor(scoreData, 'crime'), 'Crime context'),
      buildSituationScoreCard(findScoreFactor(scoreData, 'air quality'), 'Air quality'),
    ],
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
  const rentMonthly = profile.medianRentMonthly ?? weeklyToMonthly(profile.medianRentWeekly, 52)

  return {
    snapshot: `The Census profile shows a population of ${formatNumber(profile.totalPopulation)}, a median age of ${profile.medianAge ?? 'Unavailable'}, ${formatPercent(profile.familyHouseholdsPct)} family households and ${formatPercent(profile.age65PlusPct)} residents aged 65 or over.`,
    housing: `${formatPercent(profile.rentersPct)} of households rent. Median rent is ${formatMoney(rentMonthly, ' / month')}, while the median mortgage repayment is ${formatMoney(profile.medianMortgageMonthly, ' / month')}.`,
    transport: `${formatPercent(profile.publicTransportToWorkPct)} of workers use public transport to work, ${formatPercent(profile.carToWorkPct)} travel by car and ${formatPercent(profile.noCarHouseholdsPct)} of households have no car.`,
    stats: [
      { label: 'Population', value: formatNumber(profile.totalPopulation) },
      { label: 'Median age', value: profile.medianAge ?? 'Unavailable' },
      { label: 'Renters', value: formatPercent(profile.rentersPct) },
      { label: 'Median rent', value: formatMoney(rentMonthly, ' / month') },
      { label: 'Median mortgage', value: formatMoney(profile.medianMortgageMonthly, ' / month') },
      { label: 'Public transport', value: formatPercent(profile.publicTransportToWorkPct) },
    ],
  }
}

export function buildCompareInsights({ scoreData, censusData, profile }) {
  return {
    situation: buildSituationInsightSummary({ scoreData, censusData, profile }),
    census: buildCensusInsightSummary(censusData),
  }
}
