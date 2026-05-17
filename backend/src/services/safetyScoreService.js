// (B) Safety & Comfort score
// Safety & Comfort =
// Crime 45% + Activity 10% + Noise/traffic comfort 15%
// + Transport stop comfort 10% + Zoning 20%

const pool = require('../utils/db');
const { MAX_DISTANCE_MAP } = require('../utils/distanceConfig');

const SAFETY_WEIGHTS = {
  crime: 0.45,
  activity: 0.1,
  noise: 0.15,
  transportComfort: 0.1,
  zoning: 0.2
};

function clampScore(score) {
  return Math.max(0, Math.min(100, score));
}

function round2(value) {
  return Number(value.toFixed(2));
}

function round3(value) {
  return Number(value.toFixed(3));
}

function calibrateSparseSupportScore(score, baseline = 40, scale = 0.6) {
  if (score === null || score === undefined) return null;
  return round2(clampScore(baseline + Number(score) * scale));
}

function isMissingTableError(error) {
  return error && error.code === '42P01';
}

function calculateEffectiveWeights(components) {
  const availableWeight = Object.entries(components).reduce(
    (total, [key, component]) =>
      component.available ? total + SAFETY_WEIGHTS[key] : total,
    0
  );

  return Object.fromEntries(
    Object.entries(components).map(([key, component]) => [
      key,
      component.available && availableWeight > 0
        ? round3(SAFETY_WEIGHTS[key] / availableWeight)
        : 0
    ])
  );
}

function getCoverageConfidence(availableSignals, totalSignals) {
  const ratio = availableSignals / totalSignals;
  if (ratio >= 0.8) return 'high';
  if (ratio >= 0.6) return 'medium';
  if (ratio > 0) return 'low';
  return 'none';
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
        n.suburb_name,
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
      COUNT(*) AS suburb_count,
      ARRAY_AGG(DISTINCT suburb_name ORDER BY suburb_name) AS suburb_names
    FROM crime_join;
  `;

  const result = await pool.query(sql, [lng, lat, radiusMeters]);
  const row = result.rows[0];

  const avgCrime = row.avg_crime_score
    ? Number(row.avg_crime_score)
    : null;

  const adjustedCrime =
    avgCrime != null
      ? 65 + avgCrime * 0.35
      : null;

  return {
    crimeScore: adjustedCrime != null
      ? round2(clampScore(adjustedCrime))
      : null,

    crimeAvgScore: avgCrime != null
      ? round2(avgCrime)
      : null,

    suburbCount: Number(row.suburb_count || 0),
    suburbNames: row.suburb_names || []
  };
}

// ---------- Activity / passive safety ----------
async function getActivityScoreWithinRadius({ lat, lng, radiusMeters }) {
  const sql = `
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom
    ),

    nearby_activity AS (
      SELECT
        a.category,
        COALESCE(a.activity_weight, 1) AS activity_weight,
        ST_Distance(a.geom::geography, o.geom::geography) AS distance_m
      FROM public.osm_activity_scoring a
      CROSS JOIN origin o
      WHERE ST_DWithin(a.geom::geography, o.geom::geography, $3)
    )

    SELECT
      COUNT(*)::int AS feature_count,
      COALESCE(
        SUM(activity_weight * GREATEST(0.15, 1 - distance_m / $3)),
        0
      ) AS weighted_activity,
      AVG(activity_weight) AS avg_activity_weight,
      ARRAY_AGG(DISTINCT category ORDER BY category) FILTER (WHERE category IS NOT NULL) AS categories
    FROM nearby_activity;
  `;

  try {
    const result = await pool.query(sql, [lng, lat, radiusMeters]);
    const row = result.rows[0];
    const weightedActivity = Number(row.weighted_activity || 0);
    const areaKm2 = Math.PI * Math.pow(radiusMeters / 1000, 2);
    const weightedDensity = areaKm2 > 0 ? weightedActivity / areaKm2 : 0;

    // Saturating curve: mapped active places are a proxy for passive surveillance,
    // but dense centres should not overwhelm the whole safety score.
    const activityScore = 100 * (1 - Math.exp(-weightedDensity / 18));

    return {
      available: true,
      activityScore: round2(clampScore(activityScore)),
      featureCount: Number(row.feature_count || 0),
      weightedActivity: round2(weightedActivity),
      weightedDensity: round2(weightedDensity),
      averageWeight: row.avg_activity_weight != null
        ? round2(Number(row.avg_activity_weight))
        : null,
      categories: (row.categories || []).slice(0, 10)
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        available: false,
        activityScore: null,
        featureCount: 0,
        weightedActivity: null,
        weightedDensity: null,
        averageWeight: null,
        categories: [],
        message: 'Activity scoring table unavailable'
      };
    }

    throw error;
  }
}

// ---------- Noise / traffic comfort ----------
async function getNoiseComfortScoreWithinRadius({ lat, lng, radiusMeters }) {
  const sql = `
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom
    ),

    buffer_area AS (
      SELECT ST_Transform(
        ST_Buffer(ST_Transform(geom, 3857), $3),
        4326
      ) AS geom
      FROM origin
    ),

    nearby_noise AS (
      SELECT
        n.feature_type,
        n.lit,
        COALESCE(n.noise_weight, 1) AS noise_weight,
        ST_Length(
          ST_Transform(ST_Intersection(n.geom, b.geom), 3857)
        ) / 1000 AS segment_km
      FROM public.osm_noise_scoring n
      JOIN buffer_area b
        ON ST_Intersects(n.geom, b.geom)
    )

    SELECT
      COUNT(*)::int AS feature_count,
      COALESCE(SUM(segment_km), 0) AS total_segment_km,
      COALESCE(SUM(segment_km * noise_weight), 0) AS weighted_noise,
      AVG(noise_weight) AS avg_noise_weight,
      AVG(CASE WHEN lit = 'yes' THEN 1.0 WHEN lit = 'no' THEN 0.0 ELSE NULL END) AS lit_share,
      ARRAY_AGG(DISTINCT feature_type ORDER BY feature_type) FILTER (WHERE feature_type IS NOT NULL) AS feature_types
    FROM nearby_noise;
  `;

  try {
    const result = await pool.query(sql, [lng, lat, radiusMeters]);
    const row = result.rows[0];
    const weightedNoise = Number(row.weighted_noise || 0);
    const areaKm2 = Math.PI * Math.pow(radiusMeters / 1000, 2);
    const noisePressure = areaKm2 > 0 ? weightedNoise / areaKm2 : 0;
    const litShare = row.lit_share != null ? Number(row.lit_share) : null;

    const penalty = 100 * (1 - Math.exp(-noisePressure / 8));
    const lightingBonus = litShare != null ? litShare * 5 : 0;
    const noiseComfortScore = 100 - penalty + lightingBonus;

    return {
      available: true,
      noiseComfortScore: round2(clampScore(noiseComfortScore)),
      featureCount: Number(row.feature_count || 0),
      totalSegmentKm: round2(Number(row.total_segment_km || 0)),
      weightedNoise: round2(weightedNoise),
      noisePressure: round2(noisePressure),
      averageWeight: row.avg_noise_weight != null
        ? round2(Number(row.avg_noise_weight))
        : null,
      litShare: litShare != null ? round2(litShare) : null,
      featureTypes: row.feature_types || []
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        available: false,
        noiseComfortScore: null,
        featureCount: 0,
        totalSegmentKm: null,
        weightedNoise: null,
        noisePressure: null,
        averageWeight: null,
        litShare: null,
        featureTypes: [],
        message: 'Noise scoring table unavailable'
      };
    }

    throw error;
  }
}

// ---------- Public transport stop comfort ----------
async function getTransportComfortScoreWithinRadius({ lat, lng, radiusMeters }) {
  const sql = `
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom
    ),

    nearby_transport AS (
      SELECT
        to_jsonb(t) AS props,
        t.mode,
        t.lit,
        t.shelter,
        t.bench,
        t.covered,
        t.wheelchair,
        t.tactile_paving,
        COALESCE(t.stop_comfort_weight, 0.6) AS stop_comfort_weight,
        ST_Distance(t.geom::geography, o.geom::geography) AS distance_m
      FROM public.osm_transport_comfort_scoring t
      CROSS JOIN origin o
      WHERE ST_DWithin(t.geom::geography, o.geom::geography, $3)
    )

    SELECT
      COUNT(*)::int AS stop_count,
      COALESCE(
        SUM(stop_comfort_weight * GREATEST(0.15, 1 - distance_m / $3)),
        0
      ) AS weighted_comfort,
      AVG(stop_comfort_weight) AS avg_comfort_weight,
      AVG(CASE WHEN lit = 'yes' THEN 1.0 WHEN lit = 'no' THEN 0.0 ELSE NULL END) AS lit_share,
      AVG(CASE WHEN shelter = 'yes' THEN 1.0 WHEN shelter = 'no' THEN 0.0 ELSE NULL END) AS shelter_share,
      AVG(CASE WHEN bench = 'yes' THEN 1.0 WHEN bench = 'no' THEN 0.0 ELSE NULL END) AS bench_share,
      AVG(CASE WHEN covered = 'yes' THEN 1.0 WHEN covered = 'no' THEN 0.0 ELSE NULL END) AS covered_share,
      AVG(CASE WHEN wheelchair = 'yes' THEN 1.0 WHEN wheelchair = 'no' THEN 0.0 ELSE NULL END) AS wheelchair_share,
      AVG(CASE WHEN tactile_paving = 'yes' THEN 1.0 WHEN tactile_paving = 'no' THEN 0.0 ELSE NULL END) AS tactile_paving_share,
      ARRAY_AGG(DISTINCT mode ORDER BY mode) FILTER (WHERE mode IS NOT NULL) AS modes,
      (ARRAY_AGG(
        json_build_object(
          'name',
          COALESCE(
            NULLIF(props->>'name', ''),
            NULLIF(props->>'stop_name', ''),
            NULLIF(props->>'public_transport', ''),
            NULLIF(props->>'ref', ''),
            CONCAT(INITCAP(COALESCE(mode, 'transport')), ' stop')
          ),
          'mode',
          mode,
          'distanceMeters',
          distance_m
        )
        ORDER BY distance_m ASC
      ))[1] AS nearest_stop
    FROM nearby_transport;
  `;

  try {
    const result = await pool.query(sql, [lng, lat, radiusMeters]);
    const row = result.rows[0];
    const weightedComfort = Number(row.weighted_comfort || 0);
    const areaKm2 = Math.PI * Math.pow(radiusMeters / 1000, 2);
    const comfortDensity = areaKm2 > 0 ? weightedComfort / areaKm2 : 0;
    const avgComfortWeight = row.avg_comfort_weight != null
      ? Number(row.avg_comfort_weight)
      : null;

    const coverageScore = 100 * (1 - Math.exp(-comfortDensity / 8));
    const qualityScore = avgComfortWeight != null
      ? clampScore((avgComfortWeight / 1.2) * 100)
      : 0;
    const transportComfortScore = Number(row.stop_count || 0) > 0
      ? coverageScore * 0.55 + qualityScore * 0.45
      : 0;

    return {
      available: true,
      transportComfortScore: round2(clampScore(transportComfortScore)),
      stopCount: Number(row.stop_count || 0),
      weightedComfort: round2(weightedComfort),
      comfortDensity: round2(comfortDensity),
      averageWeight: avgComfortWeight != null ? round2(avgComfortWeight) : null,
      tagCoverage: {
        lit: row.lit_share != null ? round2(Number(row.lit_share)) : null,
        shelter: row.shelter_share != null ? round2(Number(row.shelter_share)) : null,
        bench: row.bench_share != null ? round2(Number(row.bench_share)) : null,
        covered: row.covered_share != null ? round2(Number(row.covered_share)) : null,
        wheelchair: row.wheelchair_share != null ? round2(Number(row.wheelchair_share)) : null,
        tactilePaving: row.tactile_paving_share != null
          ? round2(Number(row.tactile_paving_share))
          : null
      },
      modes: row.modes || [],
      nearestStop: row.nearest_stop
        ? {
            name: row.nearest_stop.name || null,
            mode: row.nearest_stop.mode || null,
            distanceMeters: row.nearest_stop.distanceMeters != null
              ? round2(Number(row.nearest_stop.distanceMeters))
              : null
          }
        : null
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        available: false,
        transportComfortScore: null,
        stopCount: 0,
        weightedComfort: null,
        comfortDensity: null,
        averageWeight: null,
        tagCoverage: {},
        modes: [],
        nearestStop: null,
        message: 'Transport comfort scoring table unavailable'
      };
    }

    throw error;
  }
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
      zoneCount: 0,
      zoneMix: []
    };
  }

  let weightedTotal = 0;
  let weightTotal = 0;
  const zoneCounts = new Map();

  zones.forEach((zone) => {
    const distance = Number(zone.distance_m);
    const weight = Math.max(0.01, 1 - distance / radiusMeters);

    const score = getZoningSafetyScore(zone.zone_code, zone.zone_desc);
    const label = zone.zone_desc || zone.zone_code || 'Unknown zoning';

    weightedTotal += score * weight;
    weightTotal += weight;
    zoneCounts.set(label, (zoneCounts.get(label) || 0) + 1);
  });

  const zoningScore = weightedTotal / weightTotal;
  const zoneMix = [...zoneCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    zoningScore: round2(zoningScore),
    zoneCount: zones.length,
    zoneMix
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
  const activityResult = await getActivityScoreWithinRadius({ lat, lng, radiusMeters });
  const noiseResult = await getNoiseComfortScoreWithinRadius({ lat, lng, radiusMeters });
  const transportComfortResult =
    await getTransportComfortScoreWithinRadius({ lat, lng, radiusMeters });
  const zoningResult = await getZoningScoreWithinRadius({ lat, lng, radiusMeters });

  const calibratedActivityScore = activityResult.available
    ? calibrateSparseSupportScore(activityResult.activityScore, 40, 0.6)
    : null;
  const calibratedTransportComfortScore = transportComfortResult.available
    ? calibrateSparseSupportScore(
        transportComfortResult.transportComfortScore,
        35,
        0.65
      )
    : null;

  const components = {
    crime: {
      available: crimeResult.crimeScore != null,
      score: crimeResult.crimeScore
    },
    activity: {
      available: activityResult.available,
      score: calibratedActivityScore
    },
    noise: {
      available: noiseResult.available,
      score: noiseResult.noiseComfortScore
    },
    transportComfort: {
      available: transportComfortResult.available,
      score: calibratedTransportComfortScore
    },
    zoning: {
      available: zoningResult.zoningScore != null,
      score: zoningResult.zoningScore
    }
  };

  const availableSignals = Object.values(components).filter(
    (component) => component.available
  ).length;
  const totalSignals = Object.keys(components).length;

  if (availableSignals === 0) {
    return {
      safetyScore: null,
      time,
      persona,
      radiusMeters,
      message: 'No data found',
      missingData: {
        crime: true,
        activity: true,
        noise: true,
        transportComfort: true,
        zoning: true
      },
      effectiveWeights: {
        crime: 0,
        activity: 0,
        noise: 0,
        transportComfort: 0,
        zoning: 0
      },
      dataCoverage: {
        availableSignals,
        totalSignals,
        confidence: getCoverageConfidence(availableSignals, totalSignals)
      }
    };
  }

  const effectiveWeights = calculateEffectiveWeights(components);
  const rawSafetyScore = Object.entries(components).reduce(
    (total, [key, component]) =>
      component.available ? total + component.score * effectiveWeights[key] : total,
    0
  );
  const safetyScore = clampScore(rawSafetyScore);

  return {
    safetyScore: Math.round(safetyScore),
    time,
    persona,
    radiusMeters,

    scores: {
      crime: crimeResult.crimeScore != null ? round2(crimeResult.crimeScore) : null,
      activity: calibratedActivityScore,
      rawActivity: activityResult.activityScore,
      noise: noiseResult.noiseComfortScore,
      transportComfort: calibratedTransportComfortScore,
      rawTransportComfort: transportComfortResult.transportComfortScore,
      zoning: zoningResult.zoningScore != null ? round2(zoningResult.zoningScore) : null,
      rawSafety: round2(rawSafetyScore)
    },

    crimeDetails: {
      averageInRadius: crimeResult.crimeAvgScore,
      suburbCount: crimeResult.suburbCount,
      suburbNames: crimeResult.suburbNames
    },

    activityDetails: {
      featureCount: activityResult.featureCount,
      weightedActivity: activityResult.weightedActivity,
      weightedDensity: activityResult.weightedDensity,
      averageWeight: activityResult.averageWeight,
      categories: activityResult.categories
    },

    noiseDetails: {
      featureCount: noiseResult.featureCount,
      totalSegmentKm: noiseResult.totalSegmentKm,
      weightedNoise: noiseResult.weightedNoise,
      noisePressure: noiseResult.noisePressure,
      averageWeight: noiseResult.averageWeight,
      litShare: noiseResult.litShare,
      featureTypes: noiseResult.featureTypes
    },

    transportComfortDetails: {
      stopCount: transportComfortResult.stopCount,
      weightedComfort: transportComfortResult.weightedComfort,
      comfortDensity: transportComfortResult.comfortDensity,
      averageWeight: transportComfortResult.averageWeight,
      tagCoverage: transportComfortResult.tagCoverage,
      modes: transportComfortResult.modes,
      nearestStop: transportComfortResult.nearestStop
    },

    zoningDetails: {
      zoneCount: zoningResult.zoneCount,
      zoneMix: zoningResult.zoneMix
    },

    missingData: {
      crime: crimeResult.crimeScore == null,
      activity: !activityResult.available,
      noise: !noiseResult.available,
      transportComfort: !transportComfortResult.available,
      zoning: zoningResult.zoningScore == null
    },

    weights: SAFETY_WEIGHTS,
    effectiveWeights,

    dataCoverage: {
      availableSignals,
      totalSignals,
      confidence: getCoverageConfidence(availableSignals, totalSignals)
    }
  };
}

module.exports = {
  getSafetyScore
};
