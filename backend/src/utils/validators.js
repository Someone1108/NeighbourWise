const ALLOWED_TRAVEL_TIMES = [10, 20, 30];
const ALLOWED_PERSONAS = ['default', 'family', 'elderly', 'pet'];
const ALLOWED_RECOMMENDATION_AREAS = ['area1', 'area2'];
const ALLOWED_RECOMMENDATION_CATEGORIES = [
  'accessibility',
  'safety',
  'environment',
];

class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.details = details;
  }
}

function reject(message, details) {
  throw new ValidationError(message, details);
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function requireCleanString(value, field, { maxLength = 120 } = {}) {
  const raw = firstValue(value);

  if (typeof raw !== 'string' || !raw.trim()) {
    reject(`${field} is required`, { field });
  }

  const trimmed = raw.trim();

  if (trimmed.length > maxLength) {
    reject(`${field} must be ${maxLength} characters or fewer`, { field });
  }

  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    reject(`${field} contains invalid characters`, { field });
  }

  return trimmed;
}

function optionalCleanString(value, field, { maxLength = 120 } = {}) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  return requireCleanString(raw, field, { maxLength });
}

function parseNumber(value, field, { min, max, required = true } = {}) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    if (!required) return null;
    reject(`${field} is required`, { field });
  }

  const numeric = Number(raw);

  if (!Number.isFinite(numeric)) {
    reject(`${field} must be a valid number`, { field });
  }

  if (min !== undefined && numeric < min) {
    reject(`${field} must be at least ${min}`, { field, min });
  }

  if (max !== undefined && numeric > max) {
    reject(`${field} must be at most ${max}`, { field, max });
  }

  return numeric;
}

function parseStringChoice(value, field, allowedValues, defaultValue) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    if (defaultValue !== undefined) return defaultValue;
    reject(`${field} is required`, { field, allowedValues });
  }

  const normalized = String(raw).trim().toLowerCase();

  if (!allowedValues.includes(normalized)) {
    reject(`${field} must be one of: ${allowedValues.join(', ')}`, {
      field,
      allowedValues,
    });
  }

  return normalized;
}

function parseIntegerChoice(value, field, allowedValues, defaultValue) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }

  const numeric = Number(raw);

  if (!Number.isInteger(numeric) || !allowedValues.includes(numeric)) {
    reject(`${field} must be one of: ${allowedValues.join(', ')}`, {
      field,
      allowedValues,
    });
  }

  return numeric;
}

function validateCoordinates(query) {
  return {
    lat: parseNumber(query.lat, 'lat', { min: -90, max: 90 }),
    lng: parseNumber(query.lng, 'lng', { min: -180, max: 180 }),
  };
}

function validateTravelTime(value) {
  return parseIntegerChoice(value, 'time', ALLOWED_TRAVEL_TIMES, 20);
}

function validatePersona(value) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return 'default';
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.familyWithChildren) return 'family';
    if (raw.elderly) return 'elderly';
    if (raw.petOwner) return 'pet';
    return 'default';
  }

  const persona = String(raw).trim().toLowerCase();
  const normalized = persona === 'pet_owner' ? 'pet' : persona;

  if (!ALLOWED_PERSONAS.includes(normalized)) {
    reject(`persona must be one of: ${ALLOWED_PERSONAS.join(', ')}`, {
      field: 'persona',
      allowedValues: ALLOWED_PERSONAS,
    });
  }

  return normalized;
}

function validateScoreQuery(query) {
  return {
    ...validateCoordinates(query),
    time: validateTravelTime(query.time),
    persona: validatePersona(query.persona),
  };
}

function validateSearchQuery(query) {
  return requireCleanString(query.q, 'q', { maxLength: 120 });
}

function validateSuburbName(value) {
  return requireCleanString(value, 'name', { maxLength: 100 });
}

function validateVicNamesId(value) {
  const id = requireCleanString(value, 'vicnamesid', { maxLength: 80 });

  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    reject('vicnamesid contains invalid characters', { field: 'vicnamesid' });
  }

  return id;
}

function validatePostcode(value) {
  const postcode = requireCleanString(value, 'postcode', { maxLength: 4 });

  if (!/^\d{4}$/.test(postcode)) {
    reject('postcode must be exactly 4 digits', { field: 'postcode' });
  }

  return postcode;
}

function validateSa2Code(value) {
  const code = requireCleanString(value, 'code', { maxLength: 20 });

  if (!/^[A-Za-z0-9_-]+$/.test(code)) {
    reject('code contains invalid characters', { field: 'code' });
  }

  return code;
}

function validateRadiusMeters(value) {
  const radius = parseNumber(value, 'radiusMeters', {
    min: 100,
    max: 5000,
    required: false,
  });

  return radius === null ? undefined : radius;
}

function validateLayerAddressQuery(query) {
  return {
    ...validateCoordinates(query),
    minutes: parseIntegerChoice(query.minutes, 'minutes', ALLOWED_TRAVEL_TIMES, 20),
    radiusMeters: validateRadiusMeters(query.radiusMeters),
  };
}

function requirePlainObject(value, field) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    reject(`${field} must be an object`, { field });
  }

  return value;
}

function validateRecommendationArea(value, field) {
  const area = requirePlainObject(value, field);

  return {
    lat: parseNumber(area.lat, `${field}.lat`, { min: -90, max: 90 }),
    lng: parseNumber(area.lng, `${field}.lng`, { min: -180, max: 180 }),
    name: optionalCleanString(area.name, `${field}.name`, { maxLength: 120 }),
    displayName: optionalCleanString(area.displayName, `${field}.displayName`, {
      maxLength: 160,
    }),
    suburb: optionalCleanString(area.suburb, `${field}.suburb`, {
      maxLength: 100,
    }),
    postcode: optionalCleanString(area.postcode, `${field}.postcode`, {
      maxLength: 4,
    }),
  };
}

function validateInsightRecommendationQuery(query) {
  return {
    ...validateCoordinates(query),
    suburb: optionalCleanString(query.suburb, 'suburb', { maxLength: 100 }),
    postcode: optionalCleanString(query.postcode, 'postcode', { maxLength: 4 }),
    address: optionalCleanString(query.address, 'address', { maxLength: 200 }),
    profile: validatePersona(query.profile),
    rangeMinutes: parseIntegerChoice(
      query.rangeMinutes,
      'rangeMinutes',
      ALLOWED_TRAVEL_TIMES,
      20
    ),
  };
}

function validateCompareRecommendationBody(body) {
  const input = requirePlainObject(body, 'body');
  const benchmarkArea = parseStringChoice(
    input.benchmarkArea,
    'benchmarkArea',
    ALLOWED_RECOMMENDATION_AREAS,
    'area1'
  );

  const category = parseStringChoice(
    input.category,
    'category',
    ALLOWED_RECOMMENDATION_CATEGORIES
  );

  return {
    area1: validateRecommendationArea(input.area1, 'area1'),
    area2: validateRecommendationArea(input.area2, 'area2'),
    benchmarkArea,
    category,
    persona: validatePersona(input.persona),
  };
}

function sendValidationError(res, error) {
  if (!(error instanceof ValidationError)) {
    return false;
  }

  res.status(error.statusCode).json({
    error: 'Validation failed',
    message: error.message,
    details: error.details,
  });

  return true;
}

module.exports = {
  ALLOWED_PERSONAS,
  ALLOWED_RECOMMENDATION_AREAS,
  ALLOWED_RECOMMENDATION_CATEGORIES,
  ALLOWED_TRAVEL_TIMES,
  ValidationError,
  sendValidationError,
  validateCompareRecommendationBody,
  validateCoordinates,
  validateInsightRecommendationQuery,
  validateLayerAddressQuery,
  validatePersona,
  validatePostcode,
  validateSa2Code,
  validateScoreQuery,
  validateSearchQuery,
  validateSuburbName,
  validateTravelTime,
  validateVicNamesId,
};
