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
/**
 * VIC postcode + locality from public.postcode_locality_lookup.
 * Only queries when the input is exactly 4 digits; otherwise returns [].
 * On DB errors, returns [] so search can fall back to Mapbox later.
 */
async function searchPostcodeLocalities(query) {
  const trimmed = String(query || '').trim();
  if (!/^\d{4}$/.test(trimmed)) {
    return [];
  }

  try {
    const sql = `
      select
        id,
        postcode,
        locality,
        state,
        type,
        status,
        lat,
        lng,
        sa1_code_2021,
        sa1_name_2021,
        sa2_code_2021,
        sa2_name_2021,
        lga_name,
        lga_code
      from public.postcode_locality_lookup
      where postcode = $1
      order by locality asc
      limit 25
    `;

    const result = await pool.query(sql, [trimmed]);

    return result.rows.map((row) => {
      const locality = String(row.locality || '').trim();
      const pc = String(row.postcode || '').trim();

      return {
        id: `postcode-${row.id}`,
        name: locality || pc,
        fullAddress: locality ? `${locality}, VIC ${pc}` : `VIC ${pc}`,
        lat: Number(row.lat),
        lng: Number(row.lng),
        placeType: 'postcode',
        source: 'supabase-postcode',
        postcode: pc,
        locality,
        state: row.state || 'VIC',
        type: row.type || null,
        status: row.status || null,
        sa1Code: row.sa1_code_2021 || null,
        sa1Name: row.sa1_name_2021 || null,
        sa2Code: row.sa2_code_2021 || null,
        sa2Name: row.sa2_name_2021 || null,
        lgaName: row.lga_name || null,
        lgaCode: row.lga_code || null,
      };
    });
  } catch (err) {
    console.error('Postcode lookup failed:', err.message);
    return [];
  }
}

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

  const trimmed = query.trim();
  const isPostcodeOnly = /^\d{4}$/.test(trimmed);

  if (isPostcodeOnly) {
    const postcodeRows = await searchPostcodeLocalities(trimmed);
    if (postcodeRows.length > 0) {
      return postcodeRows;
    }
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
  searchPostcodeLocalities,
  searchAddresses,
  searchLocations,
};
