// (B) Safety score
// Safety = Crime × 0.57 + Zoning × 0.43

const pool = require('../utils/db');
const { MAX_DISTANCE_MAP } = require('../utils/distanceConfig');

function clampScore(score) {
  return Math.max(0, Math.min(100, score));
}

// ---------- Zoning mapping ----------
function getZoningSafetyScore(zoneCode = '', zoneDesc = '') {
  const code = String(zoneCode).toUpperCase();
  const desc = String(zoneDesc).toUpperCase();

  if (code.includes('C1Z') || code.includes('C2Z') || desc.includes('COMMERCIAL')) return 75;
  if (code.includes('MUZ') || desc.includes('MIXED')) return 70;

  if (
    code.includes('GRZ') ||
    code.includes('NRZ') ||
    code.includes('RGZ') ||
    desc.includes('RESIDENTIAL')
  ) return 80;

  if (code.includes('IN') || desc.includes('INDUSTRIAL')) return 45;

  if (
    code.includes('PPRZ') ||
    code.includes('PCRZ') ||
    desc.includes('PARK') ||
    desc.includes('RECREATION')
  ) return 65;

  return 60;
}

// ---------- Crime ----------
async function getCrimeScoreWithinRadius({ lat, lng, radiusMeters }) {
  const sql = `
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
    ),

    nearby_suburbs AS (
      SELECT
        p."LOCALITY" AS suburb_name
      FROM public.locality_polygon p
      JOIN buffer_area b
        ON ST_Intersects(p.geom, b.geom)
    ),

    crime_join AS (
      SELECT
        c.crime_context_score
      FROM nearby_suburbs n
      JOIN public.crime_suburb_summary c
        ON LOWER(n.suburb_name) = LOWER(c.suburb_name)
      WHERE c.year = (
        SELECT MAX(year)
        FROM public.crime_suburb_summary
      )
    )

    SELECT
      AVG(crime_context_score) AS avg_crime_score,
      COUNT(*) AS suburb_count
    FROM crime_join;
  `;

  const result = await pool.query(sql, [lng, lat, radiusMeters]);
  const row = result.rows[0];

  const avgCrime = row.avg_crime_score
    ? Number(row.avg_crime_score)
    : null;

  // ✅ 新：壓縮 crime 分數（解決 urban vs rural 問題）
  const adjustedCrime =
    avgCrime != null
      ? 65 + avgCrime * 0.35
      : null;

  return {
    crimeScore: adjustedCrime != null
      ? Number(clampScore(adjustedCrime).toFixed(2))
      : null,

    crimeAvgScore: avgCrime != null
      ? Number(avgCrime.toFixed(2))
      : null,

    suburbCount: Number(row.suburb_count || 0)
  };
}

// ---------- Zoning ----------
async function getZoningScoreWithinRadius({ lat, lng, radiusMeters }) {
  const sql = `
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
      z.zone_code,
      z.zone_desc,
      ST_Distance(
        ST_Centroid(z.geom)::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      ) AS distance_m
    FROM public.zoning_features z
    JOIN buffer_area b
      ON ST_Intersects(z.geom, b.geom);
  `;

  const result = await pool.query(sql, [lng, lat, radiusMeters]);
  const zones = result.rows;

  if (zones.length === 0) {
    return {
      zoningScore: null,
      zoneCount: 0
    };
  }

  let weightedTotal = 0;
  let weightTotal = 0;

  zones.forEach((zone) => {
    const distance = Number(zone.distance_m);
    const weight = Math.max(0.01, 1 - distance / radiusMeters);

    const score = getZoningSafetyScore(zone.zone_code, zone.zone_desc);

    weightedTotal += score * weight;
    weightTotal += weight;
  });

  const zoningScore = weightedTotal / weightTotal;

  return {
    zoningScore: Number(zoningScore.toFixed(2)),
    zoneCount: zones.length
  };
}

// ---------- Main ----------
async function getSafetyScore({ lat, lng, time = 20, persona = 'default' }) {
  if (!lat || !lng) {
    throw new Error('lat and lng are required');
  }

  const radiusMeters = MAX_DISTANCE_MAP[time];
  if (!radiusMeters) {
    throw new Error('Invalid time');
  }

  const crimeResult = await getCrimeScoreWithinRadius({ lat, lng, radiusMeters });
  const zoningResult = await getZoningScoreWithinRadius({ lat, lng, radiusMeters });

  if (crimeResult.crimeScore == null && zoningResult.zoningScore == null) {
    return {
      safetyScore: null,
      time,
      persona,
      radiusMeters,
      message: 'No data found'
    };
  }

  const crimeScore = crimeResult.crimeScore ?? zoningResult.zoningScore;
  const zoningScore = zoningResult.zoningScore ?? crimeResult.crimeScore;

  const rawSafetyScore = crimeScore * 0.57 + zoningScore * 0.43;
  const safetyScore = clampScore(rawSafetyScore);

  return {
    safetyScore: Math.round(safetyScore),
    time,
    persona,
    radiusMeters,

    scores: {
      crime: Number(crimeScore.toFixed(2)),
      zoning: Number(zoningScore.toFixed(2)),
      rawSafety: Number(rawSafetyScore.toFixed(2))
    },

    crimeDetails: {
      averageInRadius: crimeResult.crimeAvgScore,
      suburbCount: crimeResult.suburbCount
    },

    zoningDetails: {
      zoneCount: zoningResult.zoneCount
    },

    missingData: {
      crime: crimeResult.crimeScore == null,
      zoning: zoningResult.zoningScore == null
    },

    weights: {
      crime: 0.57,
      zoning: 0.43
    }
  };
}

module.exports = {
  getSafetyScore
};