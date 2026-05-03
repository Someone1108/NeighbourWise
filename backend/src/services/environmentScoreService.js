// (C) Environment score
// - green + heat + zoning
// Environment = Green × 0.45 + Heat × 0.35 + Zoning × 0.20

const pool = require('../utils/db');
const { MAX_DISTANCE_MAP } = require('../utils/distanceConfig');
const { getAqiForLocation } = require('./aqiService');

const ENVIRONMENT_WEIGHTS = {
  green: 0.35,
  heat: 0.30,
  zoning: 0.15,
  airQuality: 0.20
};

const HEAT_MIN = -8.6;
const HEAT_MAX = 16.9;

const round2 = (value) => Math.round(value * 100) / 100;

const clamp = (value, min, max) => {
  return Math.max(min, Math.min(value, max));
};

// avgHeat 越高 → 越熱 → 分數越低
// uhi18_m 原始資料範圍大約是 -8.6 ~ 16.9
const calculateHeatScore = (avgHeat) => {
  if (avgHeat === null || avgHeat === undefined) return null;

  const heatValue = Number(avgHeat);
  if (!Number.isFinite(heatValue)) return null;

  const normalized = (heatValue - HEAT_MIN) / (HEAT_MAX - HEAT_MIN);
  const score = 100 - normalized * 100;

  return round2(clamp(score, 0, 100));
};

// avgGreen 越高 → 越綠 → 分數越高
const calculateGreenScore = (avgGreen) => {
  if (avgGreen === null || avgGreen === undefined) return null;

  const greenValue = Number(avgGreen);
  if (!Number.isFinite(greenValue)) return null;

  const score = Math.min((greenValue / 40) * 100, 100);
  return round2(clamp(score, 0, 100));
};

// 把 zoning 類別轉成「環境舒適度分數」
const getZoningComfortScore = (zoneCode = '', zoneDesc = '') => {
  const code = String(zoneCode || '').toUpperCase();
  const desc = String(zoneDesc || '').toUpperCase();

  if (code.includes('PPRZ') || desc.includes('PUBLIC PARK')) return 90;

  if (
    code.includes('GRZ') ||
    code.includes('NRZ') ||
    code.includes('RGZ') ||
    desc.includes('RESIDENTIAL')
  ) {
    return 80;
  }

  if (code.includes('MUZ') || desc.includes('MIXED USE')) return 65;

  if (
    code.includes('C1Z') ||
    code.includes('C2Z') ||
    desc.includes('COMMERCIAL')
  ) {
    return 55;
  }

  if (
    code.includes('IN1Z') ||
    code.includes('IN2Z') ||
    code.includes('IN3Z') ||
    desc.includes('INDUSTRIAL')
  ) {
    return 35;
  }

  if (code.includes('UGZ') || desc.includes('URBAN GROWTH')) return 60;

  return 60;
};

const calculateAverage = (numbers) => {
  if (!numbers.length) return null;

  const total = numbers.reduce((sum, num) => sum + num, 0);
  return round2(total / numbers.length);
};

const getEnvironmentScore = async ({
  lat,
  lng,
  time = 20,
  persona = 'default'
}) => {
  const safeLat = Number(lat);
  const safeLng = Number(lng);
  const selectedTime = Number(time) || 20;
  const radiusMeters = MAX_DISTANCE_MAP[selectedTime] || MAX_DISTANCE_MAP[20];

  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) {
    throw new Error('Valid lat and lng are required');
  }

  // 1. Green score
  const greenQuery = `
    WITH buffer_area AS (
      SELECT ST_Transform(
        ST_Buffer(
          ST_Transform(
            ST_SetSRID(ST_MakePoint($1, $2), 4326),
            3857
          ),
          $3
        ),
        4326
      ) AS geom
    )
    SELECT
      AVG(v.peranyveg) AS avg_green,
      MIN(v.peranyveg) AS min_green,
      MAX(v.peranyveg) AS max_green,
      COUNT(*) AS vegetation_count
    FROM public.vegetation_features v
    JOIN buffer_area b
      ON ST_Intersects(v.geom, b.geom)
    WHERE NOT ST_IsEmpty(ST_Intersection(v.geom, b.geom));
  `;

  const greenResult = await pool.query(greenQuery, [
    safeLng,
    safeLat,
    radiusMeters
  ]);

  const greenStats = await pool.query(`
  SELECT
    MIN(peranyveg) AS min_green,
    MAX(peranyveg) AS max_green,
    AVG(peranyveg) AS avg_green,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY peranyveg) AS p25,
    PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY peranyveg) AS median,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY peranyveg) AS p75
  FROM public.vegetation_features;
  `);


  const avgGreen = greenResult.rows[0]?.avg_green;
  const greenScore = calculateGreenScore(avgGreen);

  // 2. Heat score
  const heatQuery = `
    WITH buffer_area AS (
      SELECT ST_Transform(
        ST_Buffer(
          ST_Transform(
            ST_SetSRID(ST_MakePoint($1, $2), 4326),
            3857
          ),
          $3
        ),
        4326
      ) AS geom
    )
    SELECT
      AVG(h."uhi18_m") AS avg_heat,
      MIN(h."uhi18_m") AS min_heat,
      MAX(h."uhi18_m") AS max_heat,
      COUNT(*) AS heat_count
    FROM public.heat_features h
    JOIN buffer_area b
      ON ST_Intersects(h.geom, b.geom)
    WHERE NOT ST_IsEmpty(ST_Intersection(h.geom, b.geom));
  `;

  const heatResult = await pool.query(heatQuery, [
    safeLng,
    safeLat,
    radiusMeters
  ]);

  const avgHeat = heatResult.rows[0]?.avg_heat;
  const heatScore = calculateHeatScore(avgHeat);

  // 3. Zoning score
  const zoningQuery = `
    WITH buffer_area AS (
      SELECT ST_Transform(
        ST_Buffer(
          ST_Transform(
            ST_SetSRID(ST_MakePoint($1, $2), 4326),
            3857
          ),
          $3
        ),
        4326
      ) AS geom
    )
    SELECT z.zone_code, z.zone_desc
    FROM public.zoning_features z
    JOIN buffer_area b
      ON ST_Intersects(z.geom, b.geom)
    WHERE NOT ST_IsEmpty(ST_Intersection(z.geom, b.geom));
  `;

  const zoningResult = await pool.query(zoningQuery, [
    safeLng,
    safeLat,
    radiusMeters
  ]);

  const zoningScores = zoningResult.rows.map((row) =>
    getZoningComfortScore(row.zone_code, row.zone_desc)
  );

  const zoningScore = calculateAverage(zoningScores);
  const zoningCounts = new Map();
  zoningResult.rows.forEach((row) => {
    const label = row.zone_desc || row.zone_code || 'Unknown zoning';
    zoningCounts.set(label, (zoningCounts.get(label) || 0) + 1);
  });
  const zoneMix = [...zoningCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // 4. Air quality score
  let airQualityResult = null;
  let airQualityScore = null;

  try {
    airQualityResult = await getAqiForLocation({
      lat: safeLat,
      lng: safeLng
    });

    airQualityScore = airQualityResult.available
      ? airQualityResult.score
      : null;
  } catch (err) {
    console.error('Air quality API error:', err.message);
    airQualityScore = null;
  }

  // 5. Missing data fallback
  const missingData = {
  green: greenScore === null,
  heat: heatScore === null,
  zoning: zoningScore === null,
  airQuality: airQualityScore === null
  };

  const finalGreenScore = greenScore ?? 50;
  const finalHeatScore = heatScore ?? 50;
  const finalZoningScore = zoningScore ?? 60;
  const finalAirQualityScore = airQualityScore ?? 50;
  
  // 5. Final Environment score
  const rawEnvironmentScore =
    finalGreenScore * ENVIRONMENT_WEIGHTS.green +
    finalHeatScore * ENVIRONMENT_WEIGHTS.heat +
    finalZoningScore * ENVIRONMENT_WEIGHTS.zoning +
    finalAirQualityScore * ENVIRONMENT_WEIGHTS.airQuality;


  function calibrateEnvironmentScore(score) {
    return 25 + score * 0.75;
  }

  const environmentScore = calibrateEnvironmentScore(rawEnvironmentScore);

  return {
    environmentScore: Math.round(environmentScore),
    time: selectedTime,
    persona,
    radiusMeters,
    scores: {
      green: finalGreenScore,
      heat: finalHeatScore,
      zoning: finalZoningScore,
      airQuality: finalAirQualityScore
    },
    rawData: {
      avgGreen: avgGreen !== null && avgGreen !== undefined ? Number(avgGreen) : null,
      minGreen: greenResult.rows[0]?.min_green !== null && greenResult.rows[0]?.min_green !== undefined ? Number(greenResult.rows[0].min_green) : null,
      maxGreen: greenResult.rows[0]?.max_green !== null && greenResult.rows[0]?.max_green !== undefined ? Number(greenResult.rows[0].max_green) : null,
      vegetationCount: Number(greenResult.rows[0]?.vegetation_count || 0),
      avgHeat: avgHeat !== null && avgHeat !== undefined ? Number(avgHeat) : null,
      minHeat: heatResult.rows[0]?.min_heat !== null && heatResult.rows[0]?.min_heat !== undefined ? Number(heatResult.rows[0].min_heat) : null,
      maxHeat: heatResult.rows[0]?.max_heat !== null && heatResult.rows[0]?.max_heat !== undefined ? Number(heatResult.rows[0].max_heat) : null,
      heatCount: Number(heatResult.rows[0]?.heat_count || 0),
      zoningCount: zoningResult.rows.length,
      zoneMix,
      airQualitySite: airQualityResult?.site || null,
      airQualitySource: airQualityResult?.source || null
    },
    missingData,
    weights: ENVIRONMENT_WEIGHTS
  };
};

module.exports = {
  getEnvironmentScore
};
