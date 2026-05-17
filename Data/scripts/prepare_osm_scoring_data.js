const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'raw', 'geospatial');
const OUT_DIR = path.join(ROOT, 'processed', 'osm_scoring');

const INPUTS = {
  activity: path.join(RAW_DIR, 'osm_activity_busyness_melbourne.geojson'),
  noise: path.join(RAW_DIR, 'osm_noise_proxy_roads_rail_melbourne.geojson'),
  transport: path.join(RAW_DIR, 'raw_osm_public_transport_stops_victoria.geojson'),
};

const OUTPUTS = {
  activity: path.join(OUT_DIR, 'osm_activity_scoring.geojson'),
  noise: path.join(OUT_DIR, 'osm_noise_scoring.geojson'),
  transport: path.join(OUT_DIR, 'osm_transport_comfort_scoring.geojson'),
  summary: path.join(OUT_DIR, 'processing_summary.json'),
};

const ACTIVITY_WEIGHTS = {
  restaurant: 1.0,
  cafe: 1.0,
  fast_food: 0.75,
  pub: 0.75,
  bar: 0.7,
  biergarten: 0.7,
  food_court: 0.85,
  marketplace: 1.0,
  community_centre: 1.0,
  library: 1.0,
  theatre: 0.85,
  cinema: 0.85,
  arts_centre: 0.85,
  public_building: 0.75,
  place_of_worship: 0.6,
  supermarket: 1.0,
  convenience: 0.9,
  bakery: 0.85,
  greengrocer: 0.85,
  butcher: 0.75,
  mall: 0.95,
  department_store: 0.95,
  clothes: 0.65,
  hairdresser: 0.65,
  beauty: 0.6,
  pharmacy: 0.85,
  chemist: 0.85,
  attraction: 0.75,
  museum: 0.75,
  gallery: 0.75,
};

const EXCLUDED_ACTIVITY = new Set([
  'parking',
  'parking_space',
  'toilets',
  'bench',
  'waste_basket',
  'recycling',
  'atm',
  'vending_machine',
  'car_wash',
  'fuel',
  'vacant',
  'storage_rental',
]);

const NOISE_WEIGHTS = {
  motorway: 1.0,
  motorway_link: 0.9,
  trunk: 0.95,
  trunk_link: 0.85,
  primary: 0.85,
  primary_link: 0.75,
  secondary: 0.65,
  secondary_link: 0.55,
  tertiary: 0.45,
  tertiary_link: 0.35,
  rail: 0.75,
  tram: 0.45,
  light_rail: 0.5,
};

const TRANSPORT_MODE_WEIGHTS = {
  train: 1.0,
  tram: 0.9,
  bus: 0.75,
  ferry: 0.7,
  unknown: 0.6,
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readGeoJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeGeoJson(filePath, features) {
  const payload = {
    type: 'FeatureCollection',
    name: path.basename(filePath, '.geojson'),
    generated_by: 'Data/scripts/prepare_osm_scoring_data.js',
    generated_at: new Date().toISOString(),
    features,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload));
}

function stripEmptyProperties(props) {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function roundNumber(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}

function roundCoordinates(coords) {
  if (!Array.isArray(coords)) return coords;
  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  ) {
    return [roundNumber(coords[0]), roundNumber(coords[1])];
  }
  return coords.map(roundCoordinates);
}

function roundGeometry(geometry) {
  if (!geometry) return geometry;
  return {
    ...geometry,
    coordinates: roundCoordinates(geometry.coordinates),
  };
}

function compactProperties(props, keys) {
  const result = {};
  keys.forEach((key) => {
    if (props[key] !== undefined && props[key] !== null && props[key] !== '') {
      result[key.replace(/[:]/g, '_')] = props[key];
    }
  });
  return result;
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.toLowerCase() : null;
}

function normalizeYesNo(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (['yes', 'true', '1', 'designated'].includes(text)) return 'yes';
  if (['no', 'false', '0'].includes(text)) return 'no';
  return text;
}

function parseNumeric(value) {
  if (value === undefined || value === null || value === '') return null;
  const match = String(value).match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function getOsmId(props) {
  return props['@id'] || props.id || null;
}

function pointFeature(props, coordinates) {
  return {
    type: 'Feature',
    properties: stripEmptyProperties(props),
    geometry: {
      type: 'Point',
      coordinates: roundCoordinates(coordinates),
    },
  };
}

function lineFeature(props, geometry) {
  return {
    type: 'Feature',
    properties: stripEmptyProperties(props),
    geometry: roundGeometry(geometry),
  };
}

function flattenCoords(coords, points = []) {
  if (!Array.isArray(coords)) return points;
  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  ) {
    points.push(coords);
    return points;
  }
  coords.forEach((child) => flattenCoords(child, points));
  return points;
}

function centroidFromGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return geometry.coordinates;

  const points = flattenCoords(geometry.coordinates);
  if (!points.length) return null;

  const total = points.reduce(
    (acc, coord) => {
      acc.lng += Number(coord[0]);
      acc.lat += Number(coord[1]);
      return acc;
    },
    { lng: 0, lat: 0 }
  );

  return [total.lng / points.length, total.lat / points.length];
}

function categoryFromActivity(props) {
  const amenity = normalizeText(props.amenity);
  const shop = normalizeText(props.shop);
  const tourism = normalizeText(props.tourism);
  const leisure = normalizeText(props.leisure);

  for (const value of [amenity, shop, tourism, leisure]) {
    if (value && EXCLUDED_ACTIVITY.has(value)) return null;
  }

  if (amenity && ACTIVITY_WEIGHTS[amenity]) {
    return { category: amenity, sourceTag: 'amenity', weight: ACTIVITY_WEIGHTS[amenity] };
  }
  if (shop && ACTIVITY_WEIGHTS[shop]) {
    return { category: shop, sourceTag: 'shop', weight: ACTIVITY_WEIGHTS[shop] };
  }
  if (tourism && ACTIVITY_WEIGHTS[tourism]) {
    return { category: tourism, sourceTag: 'tourism', weight: ACTIVITY_WEIGHTS[tourism] };
  }
  if (leisure && ACTIVITY_WEIGHTS[leisure]) {
    return { category: leisure, sourceTag: 'leisure', weight: ACTIVITY_WEIGHTS[leisure] };
  }
  if (shop && !EXCLUDED_ACTIVITY.has(shop)) {
    return { category: shop, sourceTag: 'shop', weight: 0.55 };
  }

  return null;
}

function processActivity(data) {
  const seen = new Set();
  const features = [];
  const stats = baseStats(data.features.length);

  for (const feature of data.features) {
    const props = feature.properties || {};
    const osmId = getOsmId(props);
    if (!osmId || seen.has(osmId)) {
      stats.skippedDuplicates += osmId ? 1 : 0;
      stats.skippedInvalid += osmId ? 0 : 1;
      continue;
    }

    const category = categoryFromActivity(props);
    if (!category) {
      stats.skippedFiltered += 1;
      continue;
    }

    const coordinates = centroidFromGeometry(feature.geometry);
    if (!coordinates) {
      stats.skippedInvalid += 1;
      continue;
    }

    seen.add(osmId);
    features.push(pointFeature({
      osm_id: osmId,
      name: props.name || null,
      category: category.category,
      source_tag: category.sourceTag,
      activity_weight: category.weight,
      ...compactProperties(props, ['amenity', 'shop', 'tourism', 'leisure', 'opening_hours']),
    }, coordinates));
  }

  stats.outputFeatures = features.length;
  stats.geometryTypes = countGeometryTypes(features);
  return { features, stats };
}

function noiseCategory(props) {
  const highway = normalizeText(props.highway);
  const railway = normalizeText(props.railway);

  if (highway && NOISE_WEIGHTS[highway]) {
    return { type: highway, sourceTag: 'highway', weight: NOISE_WEIGHTS[highway] };
  }
  if (railway && NOISE_WEIGHTS[railway]) {
    return { type: railway, sourceTag: 'railway', weight: NOISE_WEIGHTS[railway] };
  }
  return null;
}

function processNoise(data) {
  const seen = new Set();
  const features = [];
  const stats = baseStats(data.features.length);

  for (const feature of data.features) {
    const props = feature.properties || {};
    const osmId = getOsmId(props);
    if (!osmId || seen.has(osmId)) {
      stats.skippedDuplicates += osmId ? 1 : 0;
      stats.skippedInvalid += osmId ? 0 : 1;
      continue;
    }

    const category = noiseCategory(props);
    if (!category) {
      stats.skippedFiltered += 1;
      continue;
    }

    if (!feature.geometry || feature.geometry.type !== 'LineString') {
      stats.skippedInvalid += 1;
      continue;
    }

    seen.add(osmId);
    features.push(lineFeature({
      osm_id: osmId,
      name: props.name || null,
      feature_type: category.type,
      source_tag: category.sourceTag,
      noise_weight: category.weight,
      lit: normalizeYesNo(props.lit),
      maxspeed_num: parseNumeric(props.maxspeed),
      lanes_num: parseNumeric(props.lanes),
      surface: normalizeText(props.surface),
    }, feature.geometry));
  }

  stats.outputFeatures = features.length;
  stats.geometryTypes = countGeometryTypes(features);
  return { features, stats };
}

function transportMode(props) {
  if (normalizeYesNo(props.train) === 'yes' || normalizeText(props.railway) === 'station') return 'train';
  if (normalizeYesNo(props.tram) === 'yes' || normalizeText(props.railway) === 'tram_stop') return 'tram';
  if (normalizeYesNo(props.bus) === 'yes' || normalizeText(props.highway) === 'bus_stop') return 'bus';
  if (normalizeText(props.amenity) === 'ferry_terminal') return 'ferry';
  return 'unknown';
}

function hasTransportSignal(props) {
  return Boolean(
    normalizeText(props.public_transport) ||
      normalizeText(props.highway) === 'bus_stop' ||
      normalizeText(props.railway) ||
      normalizeYesNo(props.bus) === 'yes' ||
      normalizeYesNo(props.tram) === 'yes' ||
      normalizeYesNo(props.train) === 'yes' ||
      normalizeText(props.amenity) === 'ferry_terminal'
  );
}

function calculateStopComfortWeight(props, mode) {
  let score = TRANSPORT_MODE_WEIGHTS[mode] || TRANSPORT_MODE_WEIGHTS.unknown;

  const amenities = [
    normalizeYesNo(props.lit),
    normalizeYesNo(props.shelter),
    normalizeYesNo(props.bench),
    normalizeYesNo(props.covered),
    normalizeYesNo(props.wheelchair),
    normalizeYesNo(props.tactile_paving),
  ];

  const yesCount = amenities.filter((value) => value === 'yes').length;
  const noCount = amenities.filter((value) => value === 'no').length;

  score += yesCount * 0.05;
  score -= noCount * 0.03;
  return Math.max(0.35, Math.min(1.2, Number(score.toFixed(2))));
}

function processTransport(data) {
  const seen = new Set();
  const features = [];
  const stats = baseStats(data.features.length);

  for (const feature of data.features) {
    const props = feature.properties || {};
    const osmId = getOsmId(props);
    if (!osmId || seen.has(osmId)) {
      stats.skippedDuplicates += osmId ? 1 : 0;
      stats.skippedInvalid += osmId ? 0 : 1;
      continue;
    }

    if (!hasTransportSignal(props)) {
      stats.skippedFiltered += 1;
      continue;
    }

    const coordinates = centroidFromGeometry(feature.geometry);
    if (!coordinates) {
      stats.skippedInvalid += 1;
      continue;
    }

    const mode = transportMode(props);
    seen.add(osmId);
    features.push(pointFeature({
      osm_id: osmId,
      name: props.name || null,
      mode,
      public_transport: normalizeText(props.public_transport),
      stop_comfort_weight: calculateStopComfortWeight(props, mode),
      lit: normalizeYesNo(props.lit),
      shelter: normalizeYesNo(props.shelter),
      bench: normalizeYesNo(props.bench),
      covered: normalizeYesNo(props.covered),
      wheelchair: normalizeYesNo(props.wheelchair),
      tactile_paving: normalizeYesNo(props.tactile_paving),
    }, coordinates));
  }

  stats.outputFeatures = features.length;
  stats.geometryTypes = countGeometryTypes(features);
  return { features, stats };
}

function baseStats(inputFeatures) {
  return {
    inputFeatures,
    outputFeatures: 0,
    skippedDuplicates: 0,
    skippedFiltered: 0,
    skippedInvalid: 0,
    geometryTypes: {},
  };
}

function countGeometryTypes(features) {
  return features.reduce((counts, feature) => {
    const type = feature.geometry?.type || 'Unknown';
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
}

function fileSize(filePath) {
  return fs.statSync(filePath).size;
}

function prettyMb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function processDataset(name, processor) {
  const inputPath = INPUTS[name];
  const outputPath = OUTPUTS[name];
  const data = readGeoJson(inputPath);
  const { features, stats } = processor(data);

  writeGeoJson(outputPath, features);

  return {
    inputFile: path.relative(ROOT, inputPath),
    outputFile: path.relative(ROOT, outputPath),
    inputSizeMb: prettyMb(fileSize(inputPath)),
    outputSizeMb: prettyMb(fileSize(outputPath)),
    reductionPct: Number((100 - (fileSize(outputPath) / fileSize(inputPath)) * 100).toFixed(1)),
    ...stats,
  };
}

function main() {
  ensureDir(OUT_DIR);

  const summary = {
    generatedAt: new Date().toISOString(),
    datasets: {
      activity: processDataset('activity', processActivity),
      noise: processDataset('noise', processNoise),
      transport: processDataset('transport', processTransport),
    },
  };

  fs.writeFileSync(OUTPUTS.summary, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main();
