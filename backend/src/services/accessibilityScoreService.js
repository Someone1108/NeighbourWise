// (A) Accessibility score
const { fetchPoiInsights } = require('./insightService');
const { MAX_DISTANCE_MAP } = require('../utils/distanceConfig');

// Ideal target count for each POI type
const TARGET_COUNT_MAP = {
  bus_stop: 8,
  train_station: 1,
  supermarket: 3,
  hospital: 2,
  school: 3,
  park: 5,
  dog_park: 1
};

// Distance vs count weights
const INDICATOR_WEIGHT_CONFIG = {
  bus_stop: { distance: 0.3, count: 0.7 },
  train_station: { distance: 0.8, count: 0.2 },
  supermarket: { distance: 0.5, count: 0.5 },
  hospital: { distance: 0.7, count: 0.3 },
  school: { distance: 0.6, count: 0.4 },
  park: { distance: 0.5, count: 0.5 },
  dog_park: { distance: 0.3, count: 0.7 }
};

// Persona-based weights within Accessibility
const ACCESSIBILITY_WEIGHTS = {
  default: {
    bus_stop: 0.2,
    train_station: 0.2,
    supermarket: 0.2,
    hospital: 0.15,
    school: 0.15,
    park: 0.1
  },

  family: {
    bus_stop: 0.15,
    train_station: 0.15,
    supermarket: 0.2,
    hospital: 0.15,
    school: 0.25,
    park: 0.1
  },

  elderly: {
    bus_stop: 0.25,
    train_station: 0.2,
    supermarket: 0.2,
    hospital: 0.25,
    school: 0.02,
    park: 0.08
  },

  pet: {
    bus_stop: 0.15,
    train_station: 0.15,
    supermarket: 0.15,
    hospital: 0.1,
    school: 0.05,
    park: 0.25,
    dog_park: 0.15
  }
};

// ---------- Basic calculations ----------

// Distance score: closer POIs receive higher scores
function calculateDistanceScore(nearestDistanceKm, maxDistanceKm) {
  if (nearestDistanceKm == null || nearestDistanceKm > maxDistanceKm) return 0;
  return 100 * (1 - nearestDistanceKm / maxDistanceKm);
}

// Count score: full score is given once the target count is reached
function calculateCountScore(count, target) {
  return 100 * Math.min(count / target, 1);
}

// Build the nearest POI object for a single indicator
function buildNearestPoi(pois) {
  const nearest = pois
    .filter((poi) => Number.isFinite(Number(poi.distanceKm)))
    .sort((a, b) => Number(a.distanceKm) - Number(b.distanceKm))[0];

  if (!nearest) return null;

  return {
    name: nearest.name || null,
    address: nearest.address || '',
    distanceKm: Number(Number(nearest.distanceKm).toFixed(2)),
    type: nearest.type || null
  };
}

function calculateIndicatorScore({
  nearestDistanceKm,
  count,
  maxDistanceKm,
  target,
  distanceWeight,
  countWeight
}) {
  const distanceScore = calculateDistanceScore(
    nearestDistanceKm,
    maxDistanceKm
  );
  const countScore = calculateCountScore(count, target);

  return distanceScore * distanceWeight + countScore * countWeight;
}

// ---------- Main function ----------

function calculateAccessibilityFromPois({ allPois, time, persona }) {
  // Convert meters to kilometers because POI insights use distanceKm
  const maxDistanceMeters = MAX_DISTANCE_MAP[time];
  const maxDistanceKm = maxDistanceMeters / 1000;

  const weights =
    ACCESSIBILITY_WEIGHTS[persona] || ACCESSIBILITY_WEIGHTS.default;

  let totalScore = 0;
  const breakdown = {};

  const indicators = Object.keys(weights);

  for (const type of indicators) {
    const pois = allPois.filter((p) => p.type === type);

    const count = pois.length;
    const nearestPoi = buildNearestPoi(pois);

    const nearestDistanceKm =
      nearestPoi
        ? nearestPoi.distanceKm
        : null;

    const target = TARGET_COUNT_MAP[type] || 3;

    const { distance, count: countWeight } =
      INDICATOR_WEIGHT_CONFIG[type];

    const score = calculateIndicatorScore({
      nearestDistanceKm,
      count,
      maxDistanceKm,
      target,
      distanceWeight: distance,
      countWeight
    });

    totalScore += score * weights[type];

    breakdown[type] = {
      score: Number(score.toFixed(2)),
      count,
      nearestDistanceKm,
      nearestPoi
    };
  }

  return {
    accessibilityScore: Math.round(totalScore),
    time,
    persona,
    pois: allPois,
    breakdown
  };
}

const getAccessibilityScore = async ({
  lat,
  lng,
  time = 20,
  persona = 'default',
  sequentialPois = false,
  requestDelayMs = 0
}) => {
  // Fetch all POIs in one request based on the current architecture
  const response = await fetchPoiInsights({
    lat,
    lng,
    time,
    sequential: sequentialPois,
    requestDelayMs
  });

  return calculateAccessibilityFromPois({
    allPois: response.results || [],
    time,
    persona
  });
};

const getAccessibilityScoresForPersonas = async ({
  lat,
  lng,
  time = 20,
  personas = ['default'],
  sequentialPois = false,
  requestDelayMs = 0
}) => {
  const response = await fetchPoiInsights({
    lat,
    lng,
    time,
    sequential: sequentialPois,
    requestDelayMs
  });
  const allPois = response.results || [];

  return Object.fromEntries(
    personas.map((persona) => [
      persona,
      calculateAccessibilityFromPois({ allPois, time, persona })
    ])
  );
};

module.exports = {
  getAccessibilityScore,
  getAccessibilityScoresForPersonas
};
