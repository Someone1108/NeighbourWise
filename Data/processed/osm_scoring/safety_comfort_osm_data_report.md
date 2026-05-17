# Safety & Comfort OSM Data Preparation Report

## Purpose

This report explains the preparation and database upload of three OpenStreetMap-derived datasets that will support the new **Safety & Comfort** score in NeighbourWise.

The original safety score was driven mainly by recorded crime context and zoning. These new datasets add street-level proxy signals for:

- activity and passive surveillance
- noise and traffic comfort
- public transport stop comfort

The raw files are retained as source data, while smaller processed files were created for scoring and imported into PostGIS.

## Source Data

Raw files were placed in:

```text
Data/raw/geospatial
```

The three source files are:

```text
osm_activity_busyness_melbourne.geojson
osm_noise_proxy_roads_rail_melbourne.geojson
raw_osm_public_transport_stops_victoria.geojson
```

All three files are OpenStreetMap/Overpass-derived GeoJSON datasets.

## Processing Script

The cleaning and reduction script is:

```text
Data/scripts/prepare_osm_scoring_data.js
```

The script reads the raw GeoJSON files, keeps only scoring-relevant fields, normalises selected values, reduces geometry where appropriate, and writes smaller scoring-ready GeoJSON files.

The script can be rerun with:

```powershell
node Data\scripts\prepare_osm_scoring_data.js
```

## Processed Output Files

Processed files were written to:

```text
Data/processed/osm_scoring
```

Generated files:

```text
osm_activity_scoring.geojson
osm_noise_scoring.geojson
osm_transport_comfort_scoring.geojson
processing_summary.json
```

## Size Reduction Summary

| Dataset | Raw Size | Processed Size | Reduction | Output Features |
|---|---:|---:|---:|---:|
| Activity / busyness | 18.84 MB | 9.03 MB | 52.1% | 38,663 |
| Noise roads/rail | 82.76 MB | 33.41 MB | 59.6% | 88,797 |
| Public transport comfort | 25.36 MB | 11.19 MB | 55.9% | 46,975 |

## Table Upload

The processed GeoJSON files were imported into Supabase/PostGIS using QGIS's GDAL command-line tool, `ogr2ogr`.

The import script is:

```text
Data/scripts/import_osm_scoring_to_postgis.ps1
```

The script reads `backend/.env` for `DATABASE_URL`, connects to PostGIS, and imports each processed GeoJSON into the `public` schema.

The script can be rerun with:

```powershell
powershell -ExecutionPolicy Bypass -File Data\scripts\import_osm_scoring_to_postgis.ps1
```

By default, the script uses `-overwrite`, so rerunning it replaces the existing imported tables. To append instead, run:

```powershell
powershell -ExecutionPolicy Bypass -File Data\scripts\import_osm_scoring_to_postgis.ps1 -Append
```

## Verification

The verification script is:

```text
Data/scripts/verify_osm_scoring_tables.js
```

It checks that the imported tables exist and confirms row counts.

Verified database row counts:

| Database Table | Row Count |
|---|---:|
| `public.osm_activity_scoring` | 38,663 |
| `public.osm_noise_scoring` | 88,797 |
| `public.osm_transport_comfort_scoring` | 46,975 |

The schema inspection script is:

```text
Data/scripts/inspect_osm_scoring_schema.js
```

It was used to confirm the final database column names and geometry metadata.

## Database Tables

### 1. `public.osm_activity_scoring`

This table supports the **activity / passive safety** signal.

It represents nearby active places such as restaurants, cafes, shops, supermarkets, libraries, community centres, attractions, pubs, and bars. These features can act as a proxy for street activity and passive surveillance.

Source file:

```text
Data/processed/osm_scoring/osm_activity_scoring.geojson
```

Raw source:

```text
Data/raw/geospatial/osm_activity_busyness_melbourne.geojson
```

Geometry:

```text
geom geometry(Point, 4326)
```

Polygons and non-point features were converted to point centroids for simpler radius-based scoring.

Database variables:

| Column | DB Type | Meaning |
|---|---|---|
| `id` | integer | Auto-generated primary key from import |
| `osm_id` | varchar | Original OSM feature id, for example `way/266724801` |
| `name` | varchar | OSM feature name, where available |
| `category` | varchar | Scoring category, for example `restaurant`, `cafe`, `supermarket`, `library` |
| `source_tag` | varchar | OSM tag used to derive category, for example `amenity`, `shop`, `tourism`, `leisure` |
| `activity_weight` | double precision | Weight used by the future activity/busyness score |
| `amenity` | varchar | Original OSM `amenity` value, where retained |
| `shop` | varchar | Original OSM `shop` value, where retained |
| `tourism` | varchar | Original OSM `tourism` value, where retained |
| `leisure` | varchar | Original OSM `leisure` value, where retained |
| `opening_hours` | varchar | OSM opening hours if available |
| `geom` | geometry | Point geometry in EPSG:4326 |

Expected scoring use:

```text
More useful active places within the selected radius -> higher activity/passive-safety score.
```

### 2. `public.osm_noise_scoring`

This table supports the **noise and traffic comfort** signal.

It represents major roads, road links, rail, tram, and light rail features. These can act as proxies for traffic stress, road noise, rail noise, and pedestrian comfort impacts.

Source file:

```text
Data/processed/osm_scoring/osm_noise_scoring.geojson
```

Raw source:

```text
Data/raw/geospatial/osm_noise_proxy_roads_rail_melbourne.geojson
```

Geometry:

```text
geom geometry(LineString, 4326)
```

Database variables:

| Column | DB Type | Meaning |
|---|---|---|
| `id` | integer | Auto-generated primary key from import |
| `osm_id` | varchar | Original OSM feature id |
| `name` | varchar | Road, rail, or tram feature name, where available |
| `feature_type` | varchar | Road/rail class used for scoring, for example `motorway`, `primary`, `secondary`, `tertiary`, `rail`, `tram` |
| `source_tag` | varchar | OSM source tag, usually `highway` or `railway` |
| `noise_weight` | double precision | Relative impact weight for traffic/noise comfort scoring |
| `lit` | varchar | Normalised lighting tag, usually `yes`, `no`, or null |
| `maxspeed_num` | integer | Parsed numeric speed limit where available |
| `lanes_num` | integer | Parsed number of lanes where available |
| `surface` | varchar | OSM surface value where available |
| `geom` | geometry | LineString geometry in EPSG:4326 |

Expected scoring use:

```text
Closer and heavier road/rail features -> lower noise/traffic comfort score.
Lighting can provide a small safety-context bonus but should not cancel the noise penalty.
```

### 3. `public.osm_transport_comfort_scoring`

This table supports the **public transport stop comfort** signal.

It represents bus, tram, train, ferry, platform, stop position, and station features. Unlike the existing accessibility score, this table focuses on comfort and safety-related stop quality tags.

Source file:

```text
Data/processed/osm_scoring/osm_transport_comfort_scoring.geojson
```

Raw source:

```text
Data/raw/geospatial/raw_osm_public_transport_stops_victoria.geojson
```

Geometry:

```text
geom geometry(Point, 4326)
```

Polygons and short line features were converted to point centroids for simpler radius-based scoring.

Database variables:

| Column | DB Type | Meaning |
|---|---|---|
| `id` | integer | Auto-generated primary key from import |
| `osm_id` | varchar | Original OSM feature id |
| `name` | varchar | Stop, station, or platform name, where available |
| `mode` | varchar | Derived mode, for example `bus`, `tram`, `train`, `ferry`, `unknown` |
| `public_transport` | varchar | Original OSM `public_transport` value |
| `stop_comfort_weight` | double precision | Combined weight from mode and comfort tags |
| `lit` | varchar | Normalised lighting tag |
| `shelter` | varchar | Normalised shelter tag |
| `bench` | varchar | Normalised bench tag |
| `covered` | varchar | Normalised covered tag |
| `wheelchair` | varchar | Normalised wheelchair accessibility tag |
| `tactile_paving` | varchar | Normalised tactile paving tag |
| `geom` | geometry | Point geometry in EPSG:4326 |

Expected scoring use:

```text
Nearby stops with lighting, shelter, benches, cover, wheelchair access, and tactile paving -> higher transport comfort score.
```

## How The Tables Connect To The Safety & Comfort Score

These tables are intended to extend the current safety model.

Current model:

```text
Safety = Crime context + Zoning context
```

Proposed model:

```text
Safety & Comfort =
  Crime context
  + Activity / passive safety
  + Noise and traffic comfort
  + Public transport stop comfort
  + Zoning context
```

Recommended starting weights:

| Signal | Proposed Weight | Data Source |
|---|---:|---|
| Crime context | 35% | Existing `public.crime_suburb_summary` |
| Activity / passive safety | 20% | New `public.osm_activity_scoring` |
| Noise and traffic comfort | 20% | New `public.osm_noise_scoring` |
| Public transport comfort | 15% | New `public.osm_transport_comfort_scoring` |
| Zoning context | 10% | Existing `public.zoning_features` |

## Relationship To Existing Tables

Existing database tables still used:

| Existing Table | Role |
|---|---|
| `public.crime_suburb_summary` | Provides recorded-crime context by suburb |
| `public.locality_polygon` | Used to identify nearby/intersecting suburbs |
| `public.zoning_features` | Provides zoning safety/comfort context |

New database tables:

| New Table | Role |
|---|---|
| `public.osm_activity_scoring` | Adds active-place/passive-surveillance proxy |
| `public.osm_noise_scoring` | Adds traffic/noise/road-stress comfort proxy |
| `public.osm_transport_comfort_scoring` | Adds stop-quality and safe-waiting comfort proxy |

## Missing Data Handling

The scoring implementation should distinguish between:

```text
Valid zero features nearby
```

and:

```text
Dataset/table unavailable or outside dataset coverage
```

Recommended behaviour:

1. Calculate each available signal.
2. If a signal is truly unavailable, exclude it from the weighted average.
3. Re-normalise the remaining weights to 100%.
4. Return `missingData`, `effectiveWeights`, and `dataCoverage` in the API response.

Example response shape:

```js
missingData: {
  crime: false,
  activity: false,
  noise: false,
  transportComfort: true,
  zoning: false
},
effectiveWeights: {
  crime: 0.412,
  activity: 0.235,
  noise: 0.235,
  transportComfort: 0,
  zoning: 0.118
},
dataCoverage: {
  availableSignals: 4,
  totalSignals: 5,
  confidence: "medium"
}
```

## Notes And Limitations

These OSM datasets are proxy indicators. They are useful for contextual scoring but are not direct measurements.

- Activity/busyness is based on mapped places, not live foot traffic.
- Noise is based on road/rail type and geometry, not measured decibel levels.
- Public transport comfort depends on completeness of OSM tags such as `lit`, `shelter`, and `bench`.
- Sparse OSM tagging does not always mean the feature is absent in reality.

The model should expose this clearly in insight text and avoid overclaiming precision.
