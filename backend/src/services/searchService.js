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
 * Search address OR postcode results from Mapbox.
 */
const searchAddresses = async (query) => {
  if (!query || !query.trim()) {
    return [];
  }

  const trimmedQuery = query.trim();
  const accessToken = process.env.MAPBOX_TOKEN;

  if (!accessToken) {
    throw new Error('MAPBOX_TOKEN is missing in .env');
  }

  const url = 'https://api.mapbox.com/search/geocode/v6/forward';

  // Melbourne bounding box: [west, south, east, north]
  const melbourneBbox = [144.5937, -38.4339, 145.5125, -37.5113];

  const isPostcodeQuery = /^\d{4}$/.test(trimmedQuery);

  const mapboxQuery = isPostcodeQuery
    ? `${trimmedQuery}, Victoria, Australia`
    : trimmedQuery;

  const normalizeAddress = (text) => {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ');
  };

  const dedupeAddresses = (items) => {
    const seen = new Set();
    const results = [];

    for (const item of items) {
      const key = normalizeAddress(item.fullAddress || item.name);

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(item);
    }

    return results;
  };

  const response = await axios.get(url, {
    params: {
      q: mapboxQuery,
      access_token: accessToken,
      limit: 10,
      country: 'au',
      bbox: melbourneBbox.join(','),
      autocomplete: true,
      types: isPostcodeQuery ? 'postcode,locality,address,street' : 'address,street',
    },
  });

  const features = response.data.features || [];

  const mappedResults = features
    .filter((feature) => {
      const featureType = feature.properties?.feature_type || '';

      if (isPostcodeQuery) {
        return ['postcode', 'locality', 'address', 'street'].includes(featureType);
      }

      return ['address', 'street'].includes(featureType);
    })
    .map((feature) => ({
      id: feature.properties?.mapbox_id || feature.id,
      name: feature.properties?.name || feature.text || '',
      fullAddress: feature.properties?.full_address || feature.place_name || '',
      lat: Number(feature.geometry?.coordinates?.[1]),
      lng: Number(feature.geometry?.coordinates?.[0]),
      placeType: feature.properties?.feature_type || 'address',
      source: 'mapbox',
      postcode: isPostcodeQuery ? trimmedQuery : null,
    }));

  return dedupeAddresses(mappedResults).slice(0, 5);
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
