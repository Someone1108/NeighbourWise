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


// Haversine formula：計算兩點距離（公里）
const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;

  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// 將名稱標準化，方便判斷是否為同一個 POI
const normalizePoiName = (name) => {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// 根據「名稱 + 很接近的座標」去重
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

// 從 Mapbox 抓單一 category
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

// 從資料庫抓 dog park
const fetchDogParksFromDB = async ({ lat, lng }) => {
  const sql = `
    select
      pet_point_id as id,
      st_y(geom) as lat,
      st_x(geom) as lng,
      st_distance(
        geom::geography,
        st_setsrid(st_makepoint($1, $2), 4326)::geography
      ) / 1000 as distance_km
    from public.pet_friendly_spaces_points
    order by distance_km asc
    limit 50;
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

// 統一判斷資料來源
const fetchCategoryByType = async ({ lat, lng, type }) => {
  if (type === 'dog_park') {
    return fetchDogParksFromDB({ lat, lng });
  }

  return fetchSingleCategory({ lat, lng, type });
};

// 抓所有 POI insights
const fetchPoiInsights = async ({ lat, lng, time }) => {
  const allTypes = Object.keys(categoryMap);

  const allResults = await Promise.all(
    allTypes.map((poiType) =>
      fetchCategoryByType({ lat, lng, type: poiType })
    )
  );

  let results = allResults.flat();

  if (time && MAX_DISTANCE_MAP[time]) {
    // ⭐ distanceConfig 是「公尺」，這裡轉成公里
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