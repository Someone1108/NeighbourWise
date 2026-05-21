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

  if (lat === null || lng === null) {
    throw new Error('lat and lng are required');
  }

  const cacheKey = `insight:${persona}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
  return recommendationCache.getOrSet(cacheKey, async () => {

  // Step 1
  // Find current suburb
  const currentSuburb = await findCurrentSuburbByCoordinates(lat, lng, persona);

  if (!currentSuburb) {
    return {
      type: 'insight',
      input,
      currentSuburb: null,
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
      const candidateScore = Number(
        candidate.liveability_score
      );

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

      // 70% score similarity
      // 30% distance closeness
      const recommendationScore =
        scoreSimilarity * 0.7 +
        distanceCloseness * 0.3;

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

        scoreDifference: Number(
          scoreDifference.toFixed(2)
        ),

        scores: {
          accessibility: Number(
            candidate.accessibility_score
          ),
          safety: Number(
            candidate.safety_score
          ),
          environment: Number(
            candidate.environment_score
          ),
          liveability: candidateScore
        },
        persona: candidate.persona || persona,

        reason:
          `Similar ${persona} liveability score and ` +
          `${candidate.distanceKm.toFixed(1)} km away`
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

      // Final recommendation score
      const recommendationScore =
        improvement * 0.45 +
        stabilityScore * 0.25 +
        distanceCloseness * 0.30;

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
