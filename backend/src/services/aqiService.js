const axios = require('axios');

const DEFAULT_BASE_URL = 'https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1';
const DEFAULT_SITES_PATH = '/sites?environmentalSegment=air';
const DEFAULT_SITE_PARAMETERS_PATH = '/sites/{siteId}/parameters';

const CACHE_TTL_MS = 10 * 60 * 1000;

let sitesCache = {
  expiresAt: 0,
  sites: [],
};

function normalizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function requireCoordinate(lat, lng) {
  const safeLat = normalizeNumber(lat);
  const safeLng = normalizeNumber(lng);

  if (safeLat === null || safeLng === null) {
    throw new Error('Valid latitude and longitude are required');
  }

  return { lat: safeLat, lng: safeLng };
}

function getConfig() {
  return {
    baseUrl: process.env.EPA_AIRWATCH_API_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.EPA_AIRWATCH_API_KEY || '',
    sitesPath: process.env.EPA_AIRWATCH_SITES_PATH || DEFAULT_SITES_PATH,
    siteParametersPath:
      process.env.EPA_AIRWATCH_SITE_PARAMETERS_PATH ||
      DEFAULT_SITE_PARAMETERS_PATH,
  };
}

function buildUrl(baseUrl, path, replacements = {}) {
  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  let cleanPath = String(path || '').startsWith('/') ? path : `/${path}`;

  Object.entries(replacements).forEach(([key, value]) => {
    cleanPath = cleanPath.replaceAll(`{${key}}`, encodeURIComponent(value));
  });

  return `${cleanBase}${cleanPath}`;
}

function getHeaders(apiKey) {
  if (!apiKey) return {};

  return {
    'X-API-Key': apiKey,
    'Ocp-Apim-Subscription-Key': apiKey,
    'Subscription-Key': apiKey,
    'subscription-key': apiKey,
  };
}

function firstValue(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }

  return null;
}

function unwrapArray(payload) {
  if (Array.isArray(payload)) return payload;

  const candidates = [
    payload?.records,
    payload?.results,
    payload?.sites,
    payload?.items,
    payload?.data,
    payload?.features,
  ];

  return candidates.find(Array.isArray) || [];
}

function normalizeSite(raw) {
  const props = raw?.properties || raw || {};
  const coordinates = raw?.geometry?.coordinates || [];
  const coordinateLat =
    Math.abs(normalizeNumber(coordinates[0])) <= 90
      ? normalizeNumber(coordinates[0])
      : normalizeNumber(coordinates[1]);
  const coordinateLng =
    Math.abs(normalizeNumber(coordinates[1])) > 90
      ? normalizeNumber(coordinates[1])
      : normalizeNumber(coordinates[0]);

  const lat =
    coordinateLat ??
    normalizeNumber(firstValue(props, ['lat', 'latitude', 'siteLatitude']));

  const lng =
    coordinateLng ??
    normalizeNumber(
      firstValue(props, ['lng', 'lon', 'long', 'longitude', 'siteLongitude'])
    );

  const id = firstValue(props, [
    'id',
    'siteID',
    'siteId',
    'site_id',
    'siteCode',
    'site_code',
    'monitoringSiteId',
  ]);

  if (!id || lat === null || lng === null) return null;

  return {
    id: String(id),
    name:
      firstValue(props, ['name', 'siteName', 'site_name', 'label']) ||
      String(id),
    lat,
    lng,
    raw,
  };
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestSite(sites, lat, lng) {
  return sites
    .map((site) => ({
      ...site,
      distanceKm: calculateDistanceKm(lat, lng, site.lat, site.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

function normalizeParameters(payload) {
  const siteHealthAdvices = Array.isArray(payload?.siteHealthAdvices)
    ? payload.siteHealthAdvices.map((raw) => ({
        name:
          firstValue(raw, ['healthParameter', 'parameterName', 'parameter']) ||
          'Air quality',
        value: firstValue(raw, ['averageValue', 'value', 'reading']),
        unit: firstValue(raw, ['unit', 'units', 'uom']),
        rating: firstValue(raw, ['healthAdvice', 'rating', 'category']) || null,
        aqi:
          normalizeNumber(firstValue(raw, ['aqi', 'aqiValue', 'index'])) ??
          null,
        timestamp: firstValue(raw, ['since', 'until', 'timestamp']) || null,
        raw,
      }))
    : [];

  const scientificParameters = Array.isArray(payload?.parameters)
    ? payload.parameters.flatMap((parameter) =>
        (parameter.timeSeriesReadings || []).flatMap((series) =>
          (series.readings || []).map((reading) => ({
            name:
              parameter.name ||
              firstValue(reading, ['healthParameter', 'parameterName']) ||
              'Air quality',
            value: firstValue(reading, ['averageValue', 'value', 'reading']),
            unit: firstValue(reading, ['unit', 'units', 'uom']),
            rating:
              firstValue(reading, ['healthAdvice', 'rating', 'category']) ||
              null,
            aqi:
              normalizeNumber(firstValue(reading, ['aqi', 'aqiValue', 'index'])) ??
              null,
            timestamp:
              firstValue(reading, ['since', 'until', 'timestamp']) || null,
            interval: series.timeSeriesName || null,
            raw: reading,
          }))
        )
      )
    : [];

  const fallbackParameters = unwrapArray(payload).map((raw) => {
    const props = raw?.properties || raw || {};

    return {
      name:
        firstValue(props, ['name', 'parameterName', 'parameter', 'pollutant']) ||
        'Air quality',
      value: firstValue(props, ['value', 'reading', 'measurement', 'average']),
      unit: firstValue(props, ['unit', 'units', 'uom']),
      rating:
        firstValue(props, ['rating', 'category', 'qualityCategory', 'status']) ||
        null,
      aqi:
        normalizeNumber(firstValue(props, ['aqi', 'aqiValue', 'index'])) ?? null,
      timestamp:
        firstValue(props, [
          'timestamp',
          'dateTime',
          'date_time',
          'since',
          'until',
          'updatedAt',
        ]) || null,
      raw,
    };
  });

  return [...siteHealthAdvices, ...scientificParameters, ...fallbackParameters];
}

function ratingToScore(rating) {
  const normalized = String(rating || '').toLowerCase();

  if (!normalized) return null;
  if (normalized.includes('extremely poor') || normalized.includes('hazard')) {
    return 10;
  }
  if (normalized.includes('very poor')) return 25;
  if (normalized.includes('poor')) return 45;
  if (normalized.includes('fair')) return 75;
  if (normalized.includes('good')) return 95;

  return null;
}

function aqiValueToScore(value) {
  const aqi = normalizeNumber(value);
  if (aqi === null) return null;

  return Math.max(0, Math.min(100, Math.round(100 - aqi)));
}

function calculateAqiScore(parameters) {
  const scored = parameters
    .map((parameter) => {
      const ratingScore = ratingToScore(parameter.rating);
      if (ratingScore !== null) return ratingScore;
      return aqiValueToScore(parameter.aqi);
    })
    .filter((score) => score !== null);

  if (scored.length === 0) return null;

  return Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length);
}

async function fetchSites(config) {
  if (sitesCache.expiresAt > Date.now() && sitesCache.sites.length > 0) {
    return sitesCache.sites;
  }

  const response = await axios.get(buildUrl(config.baseUrl, config.sitesPath), {
    headers: getHeaders(config.apiKey),
  });

  const sites = unwrapArray(response.data).map(normalizeSite).filter(Boolean);

  sitesCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    sites,
  };

  return sites;
}

async function fetchSiteParameters(config, siteId) {
  const response = await axios.get(
    buildUrl(config.baseUrl, config.siteParametersPath, { siteId }),
    { headers: getHeaders(config.apiKey) }
  );

  return normalizeParameters(response.data);
}

async function getAqiForLocation({ lat, lng }) {
  const coords = requireCoordinate(lat, lng);
  const config = getConfig();

  if (!config.apiKey) {
    return {
      available: false,
      reason: 'EPA_AIRWATCH_API_KEY is not configured',
      coordinates: coords,
    };
  }

  const sites = await fetchSites(config);

  if (sites.length === 0) {
    return {
      available: false,
      reason: 'No EPA AirWatch monitoring sites were returned',
      coordinates: coords,
    };
  }

  const nearestSite = findNearestSite(sites, coords.lat, coords.lng);
  const parameters = await fetchSiteParameters(config, nearestSite.id);
  const score = calculateAqiScore(parameters);

  return {
    available: score !== null,
    score,
    source: 'EPA Victoria AirWatch',
    site: {
      id: nearestSite.id,
      name: nearestSite.name,
      lat: nearestSite.lat,
      lng: nearestSite.lng,
      distanceKm: Number(nearestSite.distanceKm.toFixed(2)),
    },
    parameters,
    coordinates: coords,
    attribution: 'EPA Victoria Environment Monitoring API / AirWatch',
  };
}

module.exports = {
  getAqiForLocation,
};
