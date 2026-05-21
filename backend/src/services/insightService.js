const { MAX_DISTANCE_MAP } = require('../utils/distanceConfig');

const axios = require('axios');
const pool = require('../utils/db');

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

const categoryMap = {
  park: 'park',
  hospital: 'hospital',
  train_station: 'railway_station',
  school: 'school',
  supermarket: 'supermarket',
  bus_stop: 'bus_stop',
  dog_park: 'dog_park'
};

const delay = (ms = 0) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));


// Haversine formula: calculate the distance between two points in kilometers.
const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;

  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
};

// Normalize POI names to make it easier to identify the same POI
const normalizePoiName = (name) => {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Remove duplicate POIs based on name and very close coordinates
const dedupePois = (pois) => {
  const unique = [];
  const DUPLICATE_DISTANCE_KM = 0.12;

  for (const poi of pois) {
    const normalizedName = normalizePoiName(poi.name);

    const isDuplicate = unique.some((existing) => {
      const sameCategory = existing.type === poi.type;
      const sameName = normalizePoiName(existing.name) === normalizedName;

      const bothHaveCoords =
        existing.lat != null &&
        existing.lng != null &&
        poi.lat != null &&
        poi.lng != null;

      const closeEnough =
        bothHaveCoords &&
        calculateDistanceKm(existing.lat, existing.lng, poi.lat, poi.lng) <=
          DUPLICATE_DISTANCE_KM;

      return sameCategory && sameName && closeEnough;
    });

    if (!isDuplicate) {
      unique.push(poi);
    }
  }

  return unique;
};

// Fetch a single POI category from Mapbox
const fetchSingleCategory = async ({ lat, lng, type }) => {
  const category = categoryMap[type];

  if (!category || type === 'dog_park') {
    throw new Error(`Unsupported Mapbox POI type: ${type}`);
  }

  if (!MAPBOX_TOKEN) {
    throw new Error('MAPBOX_TOKEN is missing in .env');
  }

  const url = `https://api.mapbox.com/search/searchbox/v1/category/${category}`;

  const response = await axios.get(url, {
    params: {
      proximity: `${lng},${lat}`,
      access_token: MAPBOX_TOKEN,
      limit: 20,
      language: 'en'
    }
  });

  const features = response.data.features || [];

  return features.map((feature) => {
    const poiLat = feature.geometry?.coordinates?.[1];
    const poiLng = feature.geometry?.coordinates?.[0];

    const distanceKm =
      poiLat != null && poiLng != null
        ? calculateDistanceKm(lat, lng, poiLat, poiLng)
        : null;

    return {
      id: feature.properties?.mapbox_id || feature.id,
      name: feature.properties?.name || 'Unknown',
      address: feature.properties?.full_address || '',
      lat: poiLat,
      lng: poiLng,
      type,
      distanceKm: distanceKm != null ? Number(distanceKm.toFixed(2)) : null,
      source: 'mapbox'
    };
  });
};

// Fetch dog park data from the database
const fetchDogParksFromDB = async ({ lat, lng }) => {
  const sql = `
    with origin as (
      select st_setsrid(st_makepoint($1, $2), 4326) as geom
    ),
    nearest_spaces as (
      select p.pet_point_id, p.geom
      from public.pet_friendly_spaces_points p
      cross join origin o
      order by p.geom <-> o.geom
      limit 50
    )
    select
      pet_point_id as id,
      st_y(geom) as lat,
      st_x(geom) as lng,
      st_distance(
        geom::geography,
        (select geom from origin)::geography
      ) / 1000 as distance_km
    from nearest_spaces
    order by distance_km asc
  `;

  const values = [lng, lat];

  const result = await pool.query(sql, values);

  return result.rows.map((row) => ({
    id: `dog-park-${row.id}`,
    name: 'Dog Park',
    address: '',
    lat: Number(row.lat),
    lng: Number(row.lng),
    type: 'dog_park',
    distanceKm: Number(Number(row.distance_km).toFixed(2)),
    source: 'supabase'
  }));
};

// Determine the data source based on POI type
const fetchCategoryByType = async ({ lat, lng, type }) => {
  if (type === 'dog_park') {
    return fetchDogParksFromDB({ lat, lng });
  }

  return fetchSingleCategory({ lat, lng, type });
};

// Fetch all POI insights
const fetchPoiInsights = async ({
  lat,
  lng,
  time,
  sequential = false,
  requestDelayMs = 0
}) => {
  const allTypes = Object.keys(categoryMap);

  let allResults;

  if (sequential) {
    allResults = [];

    for (const poiType of allTypes) {
      allResults.push(await fetchCategoryByType({ lat, lng, type: poiType }));
      await delay(requestDelayMs);
    }
  } else {
    allResults = await Promise.all(
      allTypes.map((poiType) =>
        fetchCategoryByType({ lat, lng, type: poiType })
      )
    );
  }

  let results = allResults.flat();

  if (time && MAX_DISTANCE_MAP[time]) {
    // distanceConfig uses meters, so convert it to kilometers here
    const maxDistanceKm = MAX_DISTANCE_MAP[time] / 1000;

    results = results.filter(
      (poi) =>
        poi.distanceKm !== null &&
        Number.isFinite(poi.distanceKm) &&
        poi.distanceKm <= maxDistanceKm
    );
  }

  results.sort((a, b) => {
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  const uniqueResults = dedupePois(results);

  return {
    type: 'all',
    time: time || null,
    results: uniqueResults
  };
};

module.exports = {
  fetchPoiInsights
};
