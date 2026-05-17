# Backend Security Notes

The backend protects user-controlled input and public API access in several places:

1. API controllers and routes validate request values before calling services.
2. Database services use parameterized PostgreSQL queries through the `pg` library.
3. Shared middleware applies security headers, restricted CORS, rate limiting, and API access checks.
4. Internal server errors are logged server-side and returned to clients as generic messages.

## Security Middleware

Shared security middleware lives in `src/middleware/security.js` and is mounted from `src/app.js`.

### Security Headers

The backend uses `helmet` to set common HTTP security headers. Because this server is an API rather than the frontend asset host, the Content Security Policy is intentionally strict:

- `default-src 'none'`
- `base-uri 'none'`
- `form-action 'none'`
- `frame-ancestors 'none'`

This also adds protections such as content type sniffing prevention and frame protection through Helmet's default header set.

### CORS

The backend no longer uses open `cors()`.

Allowed origins are controlled by environment configuration:

- `CORS_ORIGINS`: comma-separated list of allowed browser origins.
- `FRONTEND_ORIGIN`: optional single deployed frontend origin.

In non-production environments, local frontend origins are also allowed:

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://localhost:5173`
- `http://127.0.0.1:5173`

In production, only configured origins are allowed.

### API Access Token

All `/api/*` routes pass through `requireApiAccess`.

The middleware checks `API_ACCESS_TOKEN` and accepts either:

- `Authorization: Bearer <token>`
- `X-API-Key: <token>`

Production behavior:

- if `API_ACCESS_TOKEN` is set, requests must provide the matching token;
- if `API_ACCESS_TOKEN` is missing, API access returns `503` so the backend is not accidentally deployed open.

Development behavior:

- if `API_ACCESS_TOKEN` is not set and `NODE_ENV` is not `production`, API requests are allowed so local development keeps working.

The frontend API client can send the token through `VITE_API_ACCESS_TOKEN`. Do not commit real token values to the repository.

### Rate Limiting

The backend uses `express-rate-limit`.

Current limits:

- General `/api/*` limit: `300` requests per `15` minutes.
- Expensive endpoint limit: `30` requests per `1` minute.

The expensive limiter is applied to:

- `/api/search`
- `/api/score`
- `/api/layers`
- `/api/aqi`
- `/api/recommendations`

These routes can trigger database, PostGIS, or external API work, so they get tighter abuse protection.

### Request Body Size

JSON request bodies are limited with:

```js
express.json({ limit: '20kb' })
```

This reduces the risk of oversized body abuse, especially on POST endpoints such as recommendation comparison.

## Backend Validation

Shared validation lives in `src/utils/validators.js`.

The validators reject manipulated requests with HTTP `400` before those values reach scoring, external API calls, geospatial calculations, or database queries.

Validated inputs include:

- `lat` and `lng`: must be finite numbers inside valid coordinate ranges.
- `time` and `minutes`: must be one of `10`, `20`, or `30`.
- `persona`: must be one of `default`, `family`, `elderly`, or `pet`.
- `radiusMeters`: must be between `100` and `5000` when supplied.
- search/suburb text: must be present, trimmed, length-limited, and free of control characters.
- postcode: must be exactly 4 digits.
- `vicnamesid` and SA2 code values: length-limited and restricted to safe identifier characters.
- recommendation category: must be one of `accessibility`, `safety`, or `environment`.
- recommendation benchmark area: must be one of `area1` or `area2`.
- recommendation compare body: must contain valid `area1` and `area2` objects with valid coordinates.

Validation is applied at the following entry points:

- `src/routes/scoreRoutes.js`
- `src/controllers/aqiController.js`
- `src/controllers/censusController.js`
- `src/controllers/insightController.js`
- `src/controllers/layerController.js`
- `src/controllers/localityController.js`
- `src/controllers/recommendationController.js`
- `src/controllers/searchController.js`
- `src/routes/localityRoutes.js`

## Error Responses

Validation errors still return clear HTTP `400` responses so the frontend can show useful feedback.

Unexpected backend errors no longer return raw exception messages such as `err.message` to clients. The server logs the full error internally and returns generic messages such as:

- `Failed to calculate liveability score`
- `Failed to load AQI data`
- `Failed to load Census profile`
- `Internal server error`

This reduces accidental leakage of database details, upstream API details, stack traces, or other internal implementation information.

## SQL Injection Protection

The backend uses PostgreSQL's `pg` package from `src/utils/db.js`.

Dynamic database values are passed separately from SQL text:

```js
const sql = `
  select *
  from public.locality_polygon
  where upper("LOCALITY") = upper($1)
  limit 1;
`;

const result = await pool.query(sql, [suburbName]);
```

This means user input is bound to placeholders such as `$1`, `$2`, and `$3`. PostgreSQL treats those values as data, not executable SQL, so input like `' OR 1=1 --` cannot change the query structure.

The SQL audit found the dynamic query paths using `pool.query(sql, values)` or fixed SQL without user input.

## ORM Decision

A full ORM migration was not added in this iteration because the backend relies heavily on PostGIS queries such as `ST_Intersection`, `ST_Buffer`, `ST_AsGeoJSON`, and spatial joins. Those queries would still need raw SQL in most ORMs.

For this iteration, the safer and lower-risk security improvement is:

- keep the existing `pg` database layer,
- prove SQL injection protection through parameterized queries,
- add consistent backend validation at API boundaries.

An ORM can still be considered later for simple CRUD or lookup tables, while keeping advanced PostGIS queries in parameterized SQL.

## Dependency Audit

Security middleware dependencies added in this iteration:

- `helmet`
- `express-rate-limit`

The backend dependency audit also found vulnerable `axios` / `follow-redirects` versions. `npm audit fix` was run for the backend, and the latest production audit result was:

```text
found 0 vulnerabilities
```
