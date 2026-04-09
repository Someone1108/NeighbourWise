const axios = require('axios');

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

const categoryMap = {
  park: 'park',
  hospital: 'hospital',
  train_station: 'railway_station',
  school: 'school',
  supermarket: 'supermarket',
  bus_stop: 'bus_stop'
};

const MAX_DISTANCE_MAP = {
  10: 0.8,   // 約 800 公尺，步行 10 分鐘
  20: 1.6,   // 約 1.6 公里
  30: 2.4    // 約 2.4 公里
};

// Haversine formula：計算兩點距離（公里）
const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;

  const R = 6371; // 地球半徑（km）
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

const fetchPoiInsights = async ({ lat, lng, type, time }) => {
  const category = categoryMap[type];

  if (!category) {
    throw new Error(`Unsupported POI type: ${type}`);
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

  let results = features.map((feature) => {
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
      distanceKm: distanceKm != null ? Number(distanceKm.toFixed(2)) : null
    };
  });

  // 如果有 time，就依照 10/20/30 分鐘做距離過濾
  if (time && MAX_DISTANCE_MAP[time]) {
    const maxDistance = MAX_DISTANCE_MAP[time];
    results = results.filter(
      (poi) => poi.distanceKm !== null && poi.distanceKm <= maxDistance
    );
  }

  return {
    type,
    time: time || null,
    results
  };
};

module.exports = {
  fetchPoiInsights
};