const pool = require('../utils/db');
const { createTtlCache } = require('../utils/cache');

const INSIGHT_SEARCH_RADII_KM = [5, 8, 15, 25];
const COMPARE_SEARCH_RADII_KM = [15, 25, 40, 60, 100];
const COMPARE_MATCH_TIERS = [
  { tolerance: 5, label: 'balanced' },
  { tolerance: 10, label: 'flexible' },
  { tolerance: 15, label: 'wide' },
  { tolerance: null, label: 'category-first' }
];
const MAX_INSIGHT_SCORE_GAP = 10;
const RECOMMENDATION_VERSION = 'recommendation-v2';
const CATEGORY_LABELS = {
  accessibility: 'accessibility',
  safety: 'safety',
  environment: 'environment',
  liveability: 'liveability'
};
const BASE_PROFILE_WEIGHTS = {
  default: {
    accessibility: 0.35,
    safety: 0.35,
    environment: 0.25,
    liveability: 0.05
  },
  family: {
    accessibility: 0.28,
    safety: 0.42,
    environment: 0.22,
    liveability: 0.08
  },
  elderly: {
    accessibility: 0.42,
    safety: 0.38,
    environment: 0.15,
    liveability: 0.05
  },
  pet: {
    accessibility: 0.28,
    safety: 0.24,
    environment: 0.40,
    liveability: 0.08
  }
};
const INSIGHT_SCORE_FLOORS = {
  accessibility: 35,
  safety: 45,
  environment: 40,
  liveability: 45
};
const recommendationCache = createTtlCache({
  ttlMs: Number(process.env.RECOMMENDATION_CACHE_TTL_MS) || 10 * 60 * 1000,
  maxEntries: 300,
});
const suburbScoreRowsCache = createTtlCache({
  ttlMs: Number(process.env.SUBURB_SCORE_ROWS_CACHE_TTL_MS) || 10 * 60 * 1000,
  maxEntries: 1,
});

/**
 * Calculate distance between two coordinates in km
 */
function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

/**
 * Convert value safely
 */
function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Score similarity
 * Smaller difference = higher similarity
 */
function calculateScoreSimilarity(currentScore, candidateScore) {
  const diff = Math.abs(currentScore - candidateScore);

  return Math.max(0, 100 - diff);
}

/**
 * Distance closeness
 * Closer suburb = higher score
 */
function calculateDistanceCloseness(distanceKm, maxDistanceKm) {
  return Math.max(0, 100 - (distanceKm / maxDistanceKm) * 100);
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function normalizeWeights(weights) {
  const entries = Object.entries(weights)
    .filter(([, value]) => Number.isFinite(value) && value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (!total) {
    return { ...BASE_PROFILE_WEIGHTS.default };
  }

  return entries.reduce((normalized, [key, value]) => {
    normalized[key] = value / total;
    return normalized;
  }, {});
}

function buildPreferenceSignature(preferences = {}) {
  return Object.keys(preferences)
    .sort()
    .map((key) => `${key}:${Number(preferences[key]).toFixed(2)}`)
    .join('|') || 'none';
}

function buildRecommendationWeights(persona = 'default', preferences = {}) {
  const baseWeights =
    BASE_PROFILE_WEIGHTS[persona] ||
    BASE_PROFILE_WEIGHTS.default;
  const blendedWeights = { ...baseWeights };

  for (const [key, rawValue] of Object.entries(preferences || {})) {
    if (!Object.prototype.hasOwnProperty.call(blendedWeights, key)) {
      continue;
    }

    const value = clamp(Number(rawValue), 0, 5);
    blendedWeights[key] += value * 0.08;
  }

  return normalizeWeights(blendedWeights);
}

function getCandidateScores(candidate) {
  return {
    accessibility: Number(candidate.accessibility_score),
    safety: Number(candidate.safety_score),
    environment: Number(candidate.environment_score),
    liveability: Number(candidate.liveability_score)
  };
}

function calculateWeightedProfileScore(scores, weights) {
  let total = 0;
  let weightTotal = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const score = scores[key];

    if (Number.isFinite(score)) {
      total += score * weight;
      weightTotal += weight;
    }
  }

  if (!weightTotal) {
    return 0;
  }

  return total / weightTotal;
}

function calculatePreferenceFit(scores, weights) {
  const misses = [];
  let floorPenalty = 0;

  for (const [key, floor] of Object.entries(INSIGHT_SCORE_FLOORS)) {
    const score = scores[key];

    if (Number.isFinite(score) && score < floor) {
      const weight = weights[key] || 0.1;
      floorPenalty += (floor - score) * weight;
      misses.push(key);
    }
  }

  return {
    score: clamp(100 - floorPenalty * 1.4),
    misses
  };
}

function getTopWeightedCategories(weights, limit = 2) {
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function buildInsightReason(candidate, weights, preferenceFit, persona) {
  const topCategories = getTopWeightedCategories(weights);
  const categoryText = topCategories
    .map((category) => CATEGORY_LABELS[category] || category)
    .join(' and ');

  const distanceText = `${candidate.distanceKm.toFixed(1)} km away`;

  if (preferenceFit.misses.length) {
    return `Good ${persona} match on ${categoryText}, with some trade-offs, ${distanceText}`;
  }

  return `Strong ${persona} match on ${categoryText}, ${distanceText}`;
}

function normalizeSuburbName(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function getAreaSuburbName(area) {
  return normalizeSuburbName(
    area?.suburb ||
      area?.suburbName ||
      area?.suburbLabel ||
      area?.displayName ||
      area?.name
  );
}

/**
 * Find current suburb based on coordinates
 */
async function findCurrentSuburbByCoordinates(lat, lng, persona = 'default') {
  const rows = await getCompletedSuburbScoreRows(persona);

  return rows
    .map((row) => ({
      ...row,
      distanceKm: calculateDistanceKm(
        lat,
        lng,
        Number(row.latitude),
        Number(row.longitude)
      )
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

/**
 * Find nearby candidate suburbs
 */
async function getCompletedSuburbScoreRows(persona = 'default') {
  const query = `
    SELECT
      suburb_name,
      suburb_label,
      postcode,
      latitude,
      longitude,
      accessibility_score,
      safety_score,
      environment_score,
      liveability_score,
      status,
      persona
    FROM latest_suburb_scores
    WHERE status = 'completed'
      AND persona = $1
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND liveability_score IS NOT NULL;
  `;

  return suburbScoreRowsCache.getOrSet(`completed-suburb-scores:${persona}`, async () => {
    const result = await pool.query(query, [persona]);
    return result.rows;
  });
}

async function findNearbyCandidateSuburbs(lat, lng, radiusKm, persona = 'default') {
  const rows = await getCompletedSuburbScoreRows(persona);

  return rows
    .map((row) => {
      const distanceKm = calculateDistanceKm(
        lat,
        lng,
        Number(row.latitude),
        Number(row.longitude)
      );

      return {
        ...row,
        distanceKm
      };
    })
    .filter((row) => row.distanceKm <= radiusKm);
}

/**
 * Insight Recommendation
 * Recommend nearby suburbs with similar liveability scores
 */
async function findInsightRecommendations(input) {
  const lat = toNumber(input.lat);
  const lng = toNumber(input.lng);
  const persona = input.profile || input.persona || 'default';
  const preferences = input.preferences || {};
  const recommendationWeights = buildRecommendationWeights(persona, preferences);

  if (lat === null || lng === null) {
    throw new Error('lat and lng are required');
  }

  const preferenceSignature = buildPreferenceSignature(preferences);
  const cacheKey = [
    'insight',
    RECOMMENDATION_VERSION,
    persona,
    preferenceSignature,
    lat.toFixed(5),
    lng.toFixed(5)
  ].join(':');
  return recommendationCache.getOrSet(cacheKey, async () => {

  // Step 1
  // Find current suburb
  const currentSuburb = await findCurrentSuburbByCoordinates(lat, lng, persona);

  if (!currentSuburb) {
    return {
      type: 'insight',
      input,
      currentSuburb: null,
      recommendationVersion: RECOMMENDATION_VERSION,
      recommendationWeights,
      recommendations: []
    };
  }

  const currentScore = Number(currentSuburb.liveability_score);

  // Step 2
  // Prefer genuinely similar liveability scores. Expand the search radius
  // before accepting suburbs that are much lower than the current area.
  let radiusKm = INSIGHT_SEARCH_RADII_KM[0];
  let candidates = [];

  for (const nextRadiusKm of INSIGHT_SEARCH_RADII_KM) {
    const nearbyCandidates = await findNearbyCandidateSuburbs(
      lat,
      lng,
      nextRadiusKm,
      persona
    );

    const similarCandidates = nearbyCandidates
      .filter(
        (candidate) =>
          candidate.suburb_name !== currentSuburb.suburb_name
      )
      .filter((candidate) => {
        const candidateScore = Number(candidate.liveability_score);
        return (
          Number.isFinite(candidateScore) &&
          Math.abs(currentScore - candidateScore) <=
            MAX_INSIGHT_SCORE_GAP
        );
      });

    radiusKm = nextRadiusKm;
    candidates = similarCandidates;

    if (candidates.length >= 3) {
      break;
    }
  }

  // Step 4
  // Calculate recommendation score
  const recommendations = candidates
    .map((candidate) => {
      const candidateScores = getCandidateScores(candidate);
      const candidateScore = candidateScores.liveability;

      const scoreDifference = Math.abs(
        currentScore - candidateScore
      );

      const scoreSimilarity =
        calculateScoreSimilarity(
          currentScore,
          candidateScore
        );

      const distanceCloseness =
        calculateDistanceCloseness(
          candidate.distanceKm,
          radiusKm
        );

      const profileScore = calculateWeightedProfileScore(
        candidateScores,
        recommendationWeights
      );
      const preferenceFit = calculatePreferenceFit(
        candidateScores,
        recommendationWeights
      );

      // v2 is a hybrid recommender: profile fit drives ranking, while
      // liveability similarity and distance keep suggestions familiar.
      const recommendationScore =
        profileScore * 0.45 +
        preferenceFit.score * 0.20 +
        scoreSimilarity * 0.20 +
        distanceCloseness * 0.15;

      return {
        suburbName: candidate.suburb_name,
        suburbLabel: candidate.suburb_label,
        postcode: candidate.postcode,

        latitude: Number(candidate.latitude),
        longitude: Number(candidate.longitude),

        distanceKm: Number(
          candidate.distanceKm.toFixed(2)
        ),

        recommendationScore: Number(
          recommendationScore.toFixed(2)
        ),
        profileScore: Number(profileScore.toFixed(2)),
        preferenceFitScore: Number(preferenceFit.score.toFixed(2)),

        scoreDifference: Number(
          scoreDifference.toFixed(2)
        ),

        scores: {
          accessibility: candidateScores.accessibility,
          safety: candidateScores.safety,
          environment: candidateScores.environment,
          liveability: candidateScore
        },
        persona: candidate.persona || persona,
        recommendationVersion: RECOMMENDATION_VERSION,
        recommendationWeights,
        tradeOffs: preferenceFit.misses,

        reason: buildInsightReason(
          candidate,
          recommendationWeights,
          preferenceFit,
          persona
        )
      };
    })
    .sort(
      (a, b) =>
        b.recommendationScore -
        a.recommendationScore
    )
    .slice(0, 3);

  return {
    type: 'insight',

    input,

    currentSuburb: {
      suburbName: currentSuburb.suburb_name,
      suburbLabel: currentSuburb.suburb_label,
      postcode: currentSuburb.postcode,

      latitude: Number(currentSuburb.latitude),
      longitude: Number(currentSuburb.longitude),

      liveabilityScore: currentScore
    },
    persona,
    recommendationVersion: RECOMMENDATION_VERSION,
    recommendationWeights,
    preferences,

    searchRadiusKm: radiusKm,

    recommendations
  };
  });
}

/**
 * Compare Recommendation
 * Upgrade recommendation
 */
async function findCompareRecommendations(input) {
  const {
    area1,
    area2,
    benchmarkArea,
    category
  } = input;
  const persona = input.persona || input.profile || 'default';
  const preferences = input.preferences || {};
  const recommendationWeights = buildRecommendationWeights(persona, {
    ...preferences,
    [category]: Math.max(Number(preferences[category]) || 0, 3)
  });

  // Step 1
  // Determine benchmark area
  const benchmark =
    benchmarkArea === 'area2'
      ? area2
      : area1;

  if (!benchmark) {
    throw new Error('Benchmark area is required');
  }

  const lat = toNumber(benchmark.lat);
  const lng = toNumber(benchmark.lng);

  if (lat === null || lng === null) {
    throw new Error('Benchmark lat/lng required');
  }

  const cacheKey = [
    'compare',
    benchmarkArea,
    category,
    RECOMMENDATION_VERSION,
    buildPreferenceSignature(preferences),
    persona,
    getAreaSuburbName(area1),
    getAreaSuburbName(area2),
    lat.toFixed(5),
    lng.toFixed(5)
  ].join(':');

  return recommendationCache.getOrSet(cacheKey, async () => {

  // Step 2
  // Find benchmark suburb from coordinates
  const benchmarkSuburb =
    await findCurrentSuburbByCoordinates(
      lat,
      lng,
      persona
    );

  if (!benchmarkSuburb) {
      return {
        type: 'compare',
        benchmarkArea,
        category,
        recommendationVersion: RECOMMENDATION_VERSION,
        recommendationWeights,
        recommendations: []
      };
  }

  const selectedSuburbs = new Set([
    getAreaSuburbName(area1),
    getAreaSuburbName(area2),
    normalizeSuburbName(benchmarkSuburb.suburb_name),
    normalizeSuburbName(benchmarkSuburb.suburb_label)
  ].filter(Boolean));

  // Benchmark scores
  const benchmarkScores = {
    accessibility: Number(
      benchmarkSuburb.accessibility_score
    ),
    safety: Number(
      benchmarkSuburb.safety_score
    ),
    environment: Number(
      benchmarkSuburb.environment_score
    )
  };

  let radiusKm = COMPARE_SEARCH_RADII_KM[0];
  let candidates = [];
  let matchTier = COMPARE_MATCH_TIERS[0];

  for (const tier of COMPARE_MATCH_TIERS) {
    for (const nextRadiusKm of COMPARE_SEARCH_RADII_KM) {
      const nearbyCandidates = await findNearbyCandidateSuburbs(
        lat,
        lng,
        nextRadiusKm,
        persona
      );

      const filteredCandidates = nearbyCandidates
        .filter((candidate) => {
          const candidateNames = [
            normalizeSuburbName(candidate.suburb_name),
            normalizeSuburbName(candidate.suburb_label)
          ].filter(Boolean);

          return !candidateNames.some((name) => selectedSuburbs.has(name));
        })
        .filter((candidate) => {
          const candidateScores = {
            accessibility: Number(candidate.accessibility_score),
            safety: Number(candidate.safety_score),
            environment: Number(candidate.environment_score)
          };

          if (
            !Number.isFinite(candidateScores.accessibility) ||
            !Number.isFinite(candidateScores.safety) ||
            !Number.isFinite(candidateScores.environment) ||
            !Number.isFinite(benchmarkScores[category])
          ) {
            return false;
          }

          if (candidateScores[category] <= benchmarkScores[category]) {
            return false;
          }

          if (tier.tolerance === null) {
            return true;
          }

          const otherCategories = [
            'accessibility',
            'safety',
            'environment'
          ].filter((categoryKey) => categoryKey !== category);

          for (const otherCategory of otherCategories) {
            if (
              candidateScores[otherCategory] <
              benchmarkScores[otherCategory] - tier.tolerance
            ) {
              return false;
            }
          }

          return true;
        });

      radiusKm = nextRadiusKm;
      candidates = filteredCandidates;
      matchTier = tier;

      if (candidates.length > 0) {
        break;
      }
    }

    if (candidates.length > 0) {
      break;
    }
  }

  // Step 5
  // Calculate recommendation score
  const recommendations = candidates
    .map((candidate) => {
      const candidateScores = {
        accessibility: Number(
          candidate.accessibility_score
        ),
        safety: Number(
          candidate.safety_score
        ),
        environment: Number(
          candidate.environment_score
        )
      };

      // Improvement amount
      const improvement =
        candidateScores[category] -
        benchmarkScores[category];

      // Stability score
      const otherCategories = [
        'accessibility',
        'safety',
        'environment'
      ].filter((categoryKey) => categoryKey !== category);

      let stabilityTotal = 0;

      for (const otherCategory of otherCategories) {
        const scoreDifference =
          Math.abs(
            candidateScores[otherCategory] -
            benchmarkScores[otherCategory]
          );

        stabilityTotal +=
          Math.max(0, 100 - scoreDifference);
      }

      const stabilityScore =
        stabilityTotal /
        otherCategories.length;

      // Distance score
      const distanceCloseness =
        calculateDistanceCloseness(
          candidate.distanceKm,
          radiusKm
        );
      const profileScore = calculateWeightedProfileScore(
        {
          ...candidateScores,
          liveability: Number(candidate.liveability_score)
        },
        recommendationWeights
      );

      // Final recommendation score
      const recommendationScore =
        improvement * 0.45 +
        stabilityScore * 0.20 +
        distanceCloseness * 0.20 +
        profileScore * 0.15;

      return {
        suburbName: candidate.suburb_name,
        suburbLabel: candidate.suburb_label,
        postcode: candidate.postcode,

        latitude: Number(candidate.latitude),
        longitude: Number(candidate.longitude),

        distanceKm: Number(
          candidate.distanceKm.toFixed(2)
        ),

        improvement: Number(
          improvement.toFixed(2)
        ),

        stabilityScore: Number(
          stabilityScore.toFixed(2)
        ),

        recommendationScore: Number(
          recommendationScore.toFixed(2)
        ),
        profileScore: Number(profileScore.toFixed(2)),

        scores: {
          accessibility:
            candidateScores.accessibility,
          safety:
            candidateScores.safety,
          environment:
            candidateScores.environment,
          liveability: Number(
            candidate.liveability_score
          )
        },
        persona: candidate.persona || persona,
        recommendationVersion: RECOMMENDATION_VERSION,
        recommendationWeights,

        reason:
          matchTier.tolerance === null
            ? `${category} score improved by ` +
              `${improvement.toFixed(1)} points ` +
              `outside the selected areas`
            : `${category} score improved by ` +
              `${improvement.toFixed(1)} points ` +
              `while keeping other scores within ` +
              `${matchTier.tolerance} points`
      };
    })
    .sort(
      (a, b) =>
        b.recommendationScore -
        a.recommendationScore
    )
    .slice(0, 1);

  return {
    type: 'compare',

    benchmarkArea,

    category,
    persona,
    recommendationVersion: RECOMMENDATION_VERSION,
    recommendationWeights,
    preferences,

    benchmarkSuburb: {
      suburbName:
        benchmarkSuburb.suburb_name,

      scores: benchmarkScores,
      persona
    },

    searchRadiusKm: radiusKm,
    matchTier: matchTier.label,
    comparisonTolerance: matchTier.tolerance,

    recommendations
  };
  });
}

module.exports = {
  findInsightRecommendations,
  findCompareRecommendations
};
