# Backend Security Notes

The backend protects user-controlled input in two places:

1. API controllers and routes validate request values before calling services.
2. Database services use parameterized PostgreSQL queries through the `pg` library.

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

Validation is applied at the following entry points:

- `src/routes/scoreRoutes.js`
- `src/controllers/aqiController.js`
- `src/controllers/censusController.js`
- `src/controllers/insightController.js`
- `src/controllers/layerController.js`
- `src/controllers/localityController.js`
- `src/controllers/searchController.js`
- `src/routes/localityRoutes.js`

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
