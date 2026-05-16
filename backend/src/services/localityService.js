const pool = require('../utils/db');

const getLocalityByName = async (name) => {
  if (!name || !name.trim()) {
    return null;
  }

  const sql = `
    select
      id,
      "LOCALITY",
      "GAZLOC",
      "VICNAMESID",
      st_asgeojson(geom)::json as geometry
    from public.locality_polygon
    where upper("LOCALITY") = upper($1)
    limit 1;
  `;

  const values = [name.trim()];
  const result = await pool.query(sql, values);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    name: row.LOCALITY,
    displayName: row.GAZLOC || row.LOCALITY,
    vicnamesid: row.VICNAMESID,
    geometry: row.geometry,
  };
};

const getLocalityByVicNamesId = async (vicnamesid) => {
  if (!vicnamesid) {
    return null;
  }

  const sql = `
    select
      id,
      "LOCALITY",
      "GAZLOC",
      "VICNAMESID",
      st_asgeojson(geom)::json as geometry
    from public.locality_polygon
    where "VICNAMESID" = $1
    limit 1;
  `;

  const result = await pool.query(sql, [vicnamesid]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    name: row.LOCALITY,
    displayName: row.GAZLOC || row.LOCALITY,
    vicnamesid: row.VICNAMESID,
    geometry: row.geometry,
  };
};

const getCoverageSuburbs = async () => {
  const sql = `
    select distinct
      "PLACE_NAME" as name
    from public.locality_point
    where "PLACE_NAME" is not null
      and trim("PLACE_NAME") <> ''
    order by "PLACE_NAME" asc;
  `;

  const result = await pool.query(sql);

  return {
    suburbs: result.rows.map((row) => row.name).filter(Boolean),
  };
};

const getCoverageMap = async () => {
  const sql = `
    select
      lp.id,
      lp."PLACE_NAME" as name,
      st_asgeojson(lp.geom)::json as point_geometry,
      st_asgeojson(
        st_simplifypreservetopology(poly.geom, 0.00015)
      )::json as polygon_geometry
    from public.locality_point lp
    left join public.locality_polygon poly
      on upper(poly."LOCALITY") = upper(lp."PLACE_NAME")
    where lp."PLACE_NAME" is not null
      and trim(lp."PLACE_NAME") <> ''
    order by lp."PLACE_NAME" asc;
  `;

  const result = await pool.query(sql);

  return {
    type: 'FeatureCollection',
    features: result.rows
      .filter((row) => row.polygon_geometry || row.point_geometry)
      .map((row) => ({
        type: 'Feature',
        properties: {
          id: row.id,
          locality: row.name,
          coverageGeometry: row.polygon_geometry ? 'polygon' : 'point',
        },
        geometry: row.polygon_geometry || row.point_geometry,
      })),
  };
};

module.exports = {
  getLocalityByName,
  getLocalityByVicNamesId,
  getCoverageSuburbs,
  getCoverageMap,
};
