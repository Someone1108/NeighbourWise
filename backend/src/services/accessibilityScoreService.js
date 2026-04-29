//(A) Accessibility score
const { fetchPoiInsights } = require('./insightService');
const { MAX_DISTANCE_MAP } = require('../utils/distanceConfig');

// 🎯 每種 POI 的理想數量
const TARGET_COUNT_MAP = {
  bus_stop: 8,
  train_station: 1,
  supermarket: 3,
  hospital: 2,
  school: 3,
  park: 5,
  dog_park: 3
};

// 🎯 distance vs count 權重
const INDICATOR_WEIGHT_CONFIG = {
  bus_stop: { distance: 0.3, count: 0.7 },
  train_station: { distance: 0.8, count: 0.2 },
  supermarket: { distance: 0.5, count: 0.5 },
  hospital: { distance: 0.7, count: 0.3 },
  school: { distance: 0.6, count: 0.4 },
  park: { distance: 0.5, count: 0.5 },
  dog_park: { distance: 0.5, count: 0.5 }
};

// 🎯 persona 權重（Accessibility內）
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

  pet_owner: {
    bus_stop: 0.15,
    train_station: 0.15,
    supermarket: 0.15,
    hospital: 0.1,
    school: 0.05,
    park: 0.25,
    dog_park: 0.15
  }
};

// ---------- 基本計算 ----------

// 距離分數（越近越高）
function calculateDistanceScore(nearestDistanceKm, maxDistanceKm) {
  if (nearestDistanceKm == null || nearestDistanceKm > maxDistanceKm) return 0;
  return 100 * (1 - nearestDistanceKm / maxDistanceKm);
}

// 數量分數（達標就滿分）
function calculateCountScore(count, target) {
  return 100 * Math.min(count / target, 1);
}

// 單一指標分數
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

// ---------- 主功能 ----------

const getAccessibilityScore = async ({
  lat,
  lng,
  time = 20,
  persona = 'default'
}) => {
  // 🔥 注意：這裡要轉成 km（因為你的 insight 是 distanceKm）
  const maxDistanceMeters = MAX_DISTANCE_MAP[time];
  const maxDistanceKm = maxDistanceMeters / 1000;

  const weights =
    ACCESSIBILITY_WEIGHTS[persona] || ACCESSIBILITY_WEIGHTS.default;

  let totalScore = 0;
  const breakdown = {};

  // 🔥 一次拿全部 POI（你現在的架構）
  const response = await fetchPoiInsights({ lat, lng, time });
  const allPois = response.results || [];

  const indicators = Object.keys(weights);

  for (const type of indicators) {
    const pois = allPois.filter((p) => p.type === type);

    const count = pois.length;

    const nearestDistanceKm =
      pois.length > 0
        ? Math.min(...pois.map((p) => p.distanceKm))
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
      nearestDistanceKm
    };
  }

  return {
    accessibilityScore: Math.round(totalScore),
    time,
    persona,
    breakdown
  };
};

module.exports = {
  getAccessibilityScore
};





