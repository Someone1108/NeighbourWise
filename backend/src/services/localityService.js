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
      "LOCALITY" as name
    from public.locality_polygon
    where "LOCALITY" is not null
      and trim("LOCALITY") <> ''
    order by "LOCALITY" asc;
  `;

  const result = await pool.query(sql);

  return {
    suburbs: result.rows.map((row) => row.name).filter(Boolean),
  };
};

const getCoverageMap = async () => {
  const sql = `
    select
      id,
      "LOCALITY" as name,
      st_asgeojson(
        st_simplifypreservetopology(geom, 0.00015)
      )::json as geometry
    from public.locality_polygon
    where "LOCALITY" is not null
      and trim("LOCALITY") <> ''
    order by "LOCALITY" asc;
  `;

  const result = await pool.query(sql);

  return {
    type: 'FeatureCollection',
    features: result.rows
      .filter((row) => row.geometry)
      .map((row) => ({
        type: 'Feature',
        properties: {
          id: row.id,
          locality: row.name,
        },
        geometry: row.geometry,
      })),
  };
};

module.exports = {
  getLocalityByName,
  getLocalityByVicNamesId,
  getCoverageSuburbs,
  getCoverageMap,
};