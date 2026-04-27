// (C) Environment score
// - green + heat + zoning
// Environment = Green × 0.45 + Heat × 0.35 + Zoning × 0.20

const pool = require('../utils/db');
const { MAX_DISTANCE_MAP } = require('../utils/distanceConfig');

const ENVIRONMENT_WEIGHTS = {
  green: 0.45,
  heat: 0.35,
  zoning: 0.20
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
    SELECT AVG(v.peranyveg) AS avg_green
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
    SELECT AVG(h."uhi18_m") AS avg_heat
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

  // 4. Missing data fallback
  const missingData = {
    green: greenScore === null,
    heat: heatScore === null,
    zoning: zoningScore === null
  };

  const finalGreenScore = greenScore ?? 50;
  const finalHeatScore = heatScore ?? 50;
  const finalZoningScore = zoningScore ?? 60;

  // 5. Final Environment score
  const rawEnvironmentScore =
    finalGreenScore * ENVIRONMENT_WEIGHTS.green +
    finalHeatScore * ENVIRONMENT_WEIGHTS.heat +
    finalZoningScore * ENVIRONMENT_WEIGHTS.zoning;

  function calibrateEnvironmentScore(score) {
    return 25 + score * 0.75;
  }

  const environmentScore = calibrateEnvironmentScore(rawEnvironmentScore);

  return {
    environmentScore: round2(environmentScore),
    time: selectedTime,
    persona,
    radiusMeters,
    scores: {
      green: finalGreenScore,
      heat: finalHeatScore,
      zoning: finalZoningScore
    },
    rawData: {
      avgGreen: avgGreen !== null && avgGreen !== undefined ? Number(avgGreen) : null,
      avgHeat: avgHeat !== null && avgHeat !== undefined ? Number(avgHeat) : null,
      zoningCount: zoningResult.rows.length
    },
    missingData,
    weights: ENVIRONMENT_WEIGHTS
  };
};

module.exports = {
  getEnvironmentScore
};