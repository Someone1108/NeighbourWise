const axios = require('axios');
const pool = require('../utils/db');

/**
 * Search suburb/locality results from Supabase.
 */
const searchLocalities = async (query) => {
  if (!query || !query.trim()) {
    return [];
  }

  const sql = `
    select
      id,
      "PLACE_NAME",
      "PLACELABEL",
      st_y(geom) as lat,
      st_x(geom) as lng
    from public.locality_point
    where upper("PLACE_NAME") like upper($1)
    order by "PLACE_NAME" asc
    limit 10;
  `;

  const values = [`${query.trim()}%`];
  const result = await pool.query(sql, values);

  return result.rows.map((row) => ({
    id: `locality-${row.id}`,
    name: row.PLACE_NAME || '',
    fullAddress: row.PLACELABEL || row.PLACE_NAME || '',
    lat: Number(row.lat),
    lng: Number(row.lng),
    placeType: 'suburb',
    source: 'supabase',
  }));
};

/**
 * Search address results from Mapbox.
 */
const searchAddresses = async (query) => {
  if (!query || !query.trim()) {
    return [];
  }

  const accessToken = process.env.MAPBOX_TOKEN;

  if (!accessToken) {
    throw new Error('MAPBOX_TOKEN is missing in .env');
  }

  const url = 'https://api.mapbox.com/search/geocode/v6/forward';

  const response = await axios.get(url, {
    params: {
      q: query,
      access_token: accessToken,
      limit: 5,
      country: 'au',
    },
  });

  const features = response.data.features || [];

  return features.map((feature) => ({
    id: feature.properties?.mapbox_id || feature.id,
    name: feature.properties?.name || feature.text || '',
    fullAddress: feature.properties?.full_address || feature.place_name || '',
    lat: feature.geometry?.coordinates?.[1],
    lng: feature.geometry?.coordinates?.[0],
    placeType: feature.properties?.feature_type || 'address',
    source: 'mapbox',
  }));
};

const searchLocations = async (query) => {
  if (!query || !query.trim()) {
    return [];
  }

  const [localities, addresses] = await Promise.all([
    searchLocalities(query),
    searchAddresses(query).catch((err) => {
      console.error('Mapbox address search failed:', err.message);
      return [];
    }),
  ]);

  return [...localities, ...addresses];
};

module.exports = {
  searchLocalities,
  searchAddresses,
  searchLocations,
};