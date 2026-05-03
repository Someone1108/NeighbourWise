const ALLOWED_TRAVEL_TIMES = [10, 20, 30];
const ALLOWED_PERSONAS = ['default', 'family', 'elderly', 'pet'];

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
  ALLOWED_TRAVEL_TIMES,
  ValidationError,
  sendValidationError,
  validateCoordinates,
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
