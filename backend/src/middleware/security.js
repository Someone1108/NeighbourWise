const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getAllowedCorsOrigins() {
  const configuredOrigins = [
    ...parseOrigins(process.env.CORS_ORIGINS),
    ...parseOrigins(process.env.FRONTEND_ORIGIN),
  ];

  const origins =
    process.env.NODE_ENV === 'production'
      ? configuredOrigins
      : [...DEFAULT_DEV_ORIGINS, ...configuredOrigins];

  return new Set(origins);
}

function createCorsOptions() {
  const allowedOrigins = getAllowedCorsOrigins();

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin is not allowed'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: false,
    optionsSuccessStatus: 204,
  };
}

function createSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
}

function createRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
}

function timingSafeEquals(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''));
  const right = Buffer.from(String(rightValue || ''));

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getSuppliedApiToken(req) {
  const authHeader = req.get('authorization') || '';
  const bearerPrefix = 'Bearer ';

  if (authHeader.startsWith(bearerPrefix)) {
    return authHeader.slice(bearerPrefix.length).trim();
  }

  return req.get('x-api-key') || '';
}

function requireApiAccess(req, res, next) {
  const expectedToken = process.env.API_ACCESS_TOKEN;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!expectedToken && !isProduction) {
    return next();
  }

  if (!expectedToken) {
    return res.status(503).json({ error: 'API access is not configured' });
  }

  if (!timingSafeEquals(getSuppliedApiToken(req), expectedToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
});

const expensiveApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
});

module.exports = {
  apiRateLimiter,
  createCorsOptions,
  createSecurityHeaders,
  expensiveApiRateLimiter,
  requireApiAccess,
};
