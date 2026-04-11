const pool = require('../utils/db');

function normalizeName(name) {
  return String(name || '').trim();
}

function normalizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRadius(radiusMeters) {
  const n = normalizeNumber(radiusMeters);
  if (!n || n <= 0) return 2200;
  return n;
}

async function getLayersForSuburb(suburbName) {
  const target = normalizeName(suburbName);

  if (!target) {
    throw new Error('Suburb name is required');
  }

  const boundarySql = `
    select
      id,
      "LOCALITY",
      "GAZLOC",
      st_asgeojson(geom)::json as geometry
    from public.locality_polygon
    where upper("LOCALITY") = upper($1)
    limit 1;
  `;

  const boundaryResult = await pool.query(boundarySql, [target]);

  if (boundaryResult.rows.length === 0) {
    throw new Error(`No boundary found for suburb: ${suburbName}`);
  }

  const boundaryRow = boundaryResult.rows[0];

  const boundary = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: boundaryRow.id,
          locality: boundaryRow.LOCALITY,
          gazloc: boundaryRow.GAZLOC,
        },
        geometry: boundaryRow.geometry,
      },
    ],
  };

  const heatSql = `
  select
    h.ogc_fid,
    h.mb_code16,
    h.sa1_main16,
    h.sa2_name16,
    h.sa3_code16,
    h.sa3_name16,
    h.sa4_code16,
    h.sa4_name16,
    h.gcc_code16,
    h.sa2_main16,
    h.pershrbtre,
    h.peranyveg,
    h.pershrub,
    h.pertr03_10,
    h.pertr10_15,
    h.pertr15pl,
    h."uhi18_m",
    h.pergrass,
    h.lga,
    st_asgeojson(st_intersection(h.geom, p.geom))::json as geometry
  from public.heat_features h
  join public.locality_polygon p
    on st_intersects(h.geom, p.geom)
  where upper(p."LOCALITY") = upper($1)
    and not st_isempty(st_intersection(h.geom, p.geom));
`;

  const heatResult = await pool.query(heatSql, [target]);

  const heat = {
    type: 'FeatureCollection',
    features: heatResult.rows.map((row) => ({
      type: 'Feature',
      properties: {
        ogc_fid: row.ogc_fid,
        mb_code16: row.mb_code16,
        sa1_main16: row.sa1_main16,
        sa2_name16: row.sa2_name16,
        sa3_code16: row.sa3_code16,
        sa3_name16: row.sa3_name16,
        sa4_code16: row.sa4_code16,
        sa4_name16: row.sa4_name16,
        gcc_code16: row.gcc_code16,
        sa2_main16: row.sa2_main16,
        pershrbtre: row.pershrbtre,
        peranyveg: row.peranyveg,
        pershrub: row.pershrub,
        pertr03_10: row.pertr03_10,
        pertr10_15: row.pertr10_15,
        pertr15pl: row.pertr15pl,
        uhi18_m: row.uhi18_m,
        pergrass: row.pergrass,
        lga: row.lga,
      },
      geometry: row.geometry,
    })),
  };

  const vegetationSql = `
  select
    v.fid,
    v.uniqueid,
    v.mb_reclass,
    v.type,
    v.landtype,
    v.areasqm,
    v.areaanyveg,
    v.peranyveg,
    st_asgeojson(st_intersection(v.geom, p.geom))::json as geometry
  from public.vegetation_features v
  join public.locality_polygon p
    on st_intersects(v.geom, p.geom)
  where upper(p."LOCALITY") = upper($1)
    and not st_isempty(st_intersection(v.geom, p.geom));
`;

  const vegetationResult = await pool.query(vegetationSql, [target]);

  const vegetation = {
    type: 'FeatureCollection',
    features: vegetationResult.rows.map((row) => ({
      type: 'Feature',
      properties: {
        fid: row.fid,
        uniqueid: row.uniqueid,
        mb_reclass: row.mb_reclass,
        type: row.type,
        landtype: row.landtype,
        areasqm: row.areasqm,
        areaanyveg: row.areaanyveg,
        peranyveg: row.peranyveg,
      },
      geometry: row.geometry,
    })),
  };

  return {
    suburb: target,
    boundary,
    heat,
    vegetation,
  };
}

async function getLayersForAddress(lat, lng, radiusMeters) {
  const safeLat = normalizeNumber(lat);
  const safeLng = normalizeNumber(lng);
  const safeRadius = normalizeRadius(radiusMeters);

  if (safeLat === null || safeLng === null) {
    throw new Error('Valid latitude and longitude are required');
  }

  const analysisAreaSql = `
    select st_asgeojson(
      st_transform(
        st_buffer(
          st_transform(
            st_setsrid(st_makepoint($1, $2), 4326),
            3857
          ),
          $3
        ),
        4326
      )
    )::json as geometry;
  `;

  const analysisAreaResult = await pool.query(analysisAreaSql, [
    safeLng,
    safeLat,
    safeRadius,
  ]);

  const analysisArea = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          lat: safeLat,
          lng: safeLng,
          radiusMeters: safeRadius,
        },
        geometry: analysisAreaResult.rows[0].geometry,
      },
    ],
  };

  const heatSql = `
    with buffer_area as (
      select st_transform(
        st_buffer(
          st_transform(
            st_setsrid(st_makepoint($1, $2), 4326),
            3857
          ),
          $3
        ),
        4326
      ) as geom
    )
    select
      h.ogc_fid,
      h.mb_code16,
      h.sa1_main16,
      h.sa2_name16,
      h.sa3_code16,
      h.sa3_name16,
      h.sa4_code16,
      h.sa4_name16,
      h.gcc_code16,
      h.sa2_main16,
      h.pershrbtre,
      h.peranyveg,
      h.pershrub,
      h.pertr03_10,
      h.pertr10_15,
      h.pertr15pl,
      h."uhi18_m",
      h.pergrass,
      h.lga,
      st_asgeojson(st_intersection(h.geom, b.geom))::json as geometry
    from public.heat_features h
    join buffer_area b
      on st_intersects(h.geom, b.geom)
    where not st_isempty(st_intersection(h.geom, b.geom));
  `;

  const heatResult = await pool.query(heatSql, [
    safeLng,
    safeLat,
    safeRadius,
  ]);

  const heat = {
    type: 'FeatureCollection',
    features: heatResult.rows.map((row) => ({
      type: 'Feature',
      properties: {
        ogc_fid: row.ogc_fid,
        mb_code16: row.mb_code16,
        sa1_main16: row.sa1_main16,
        sa2_name16: row.sa2_name16,
        sa3_code16: row.sa3_code16,
        sa3_name16: row.sa3_name16,
        sa4_code16: row.sa4_code16,
        sa4_name16: row.sa4_name16,
        gcc_code16: row.gcc_code16,
        sa2_main16: row.sa2_main16,
        pershrbtre: row.pershrbtre,
        peranyveg: row.peranyveg,
        pershrub: row.pershrub,
        pertr03_10: row.pertr03_10,
        pertr10_15: row.pertr10_15,
        pertr15pl: row.pertr15pl,
        uhi18_m: row.uhi18_m,
        pergrass: row.pergrass,
        lga: row.lga,
      },
      geometry: row.geometry,
    })),
  };

  const vegetationSql = `
    with buffer_area as (
      select st_transform(
        st_buffer(
          st_transform(
            st_setsrid(st_makepoint($1, $2), 4326),
            3857
          ),
          $3
        ),
        4326
      ) as geom
    )
    select
      v.fid,
      v.uniqueid,
      v.mb_reclass,
      v.type,
      v.landtype,
      v.areasqm,
      v.areaanyveg,
      v.peranyveg,
      st_asgeojson(st_intersection(v.geom, b.geom))::json as geometry
    from public.vegetation_features v
    join buffer_area b
      on st_intersects(v.geom, b.geom)
    where not st_isempty(st_intersection(v.geom, b.geom));
  `;

  const vegetationResult = await pool.query(vegetationSql, [
    safeLng,
    safeLat,
    safeRadius,
  ]);

  const vegetation = {
    type: 'FeatureCollection',
    features: vegetationResult.rows.map((row) => ({
      type: 'Feature',
      properties: {
        fid: row.fid,
        uniqueid: row.uniqueid,
        mb_reclass: row.mb_reclass,
        type: row.type,
        landtype: row.landtype,
        areasqm: row.areasqm,
        areaanyveg: row.areaanyveg,
        peranyveg: row.peranyveg,
      },
      geometry: row.geometry,
    })),
  };

  return {
    address: {
      lat: safeLat,
      lng: safeLng,
      radiusMeters: safeRadius,
    },
    analysisArea,
    heat,
    vegetation,
  };
}

async function getSuburbLayerSummary(suburbName) {
  const target = normalizeName(suburbName);

  if (!target) {
    throw new Error('Suburb name is required');
  }

  const heatSummarySql = `
    select
      avg(h."uhi18_m") as avg_heat_value,
      min(h."uhi18_m") as min_heat_value,
      max(h."uhi18_m") as max_heat_value
    from public.heat_features h
    join public.locality_polygon p
      on st_intersects(h.geom, p.geom)
    where upper(p."LOCALITY") = upper($1);
  `;

  const vegetationSummarySql = `
    select
      sum(v.areasqm) as total_unit_area_sqm,
      sum(v.areaanyveg) as total_vegetation_area_sqm,
      avg(v.peranyveg) as avg_vegetation_percent
    from public.vegetation_features v
    join public.locality_polygon p
      on st_intersects(v.geom, p.geom)
    where upper(p."LOCALITY") = upper($1);
  `;

  const [heatSummaryResult, vegetationSummaryResult] = await Promise.all([
    pool.query(heatSummarySql, [target]),
    pool.query(vegetationSummarySql, [target]),
  ]);

  return {
    suburb: target,
    heat: heatSummaryResult.rows[0] || null,
    vegetation: vegetationSummaryResult.rows[0] || null,
  };
}

module.exports = {
  getLayersForSuburb,
  getLayersForAddress,
  getSuburbLayerSummary,
};