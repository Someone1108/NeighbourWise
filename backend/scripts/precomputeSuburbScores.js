require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/utils/db');
const { getAccessibilityScore } = require('../src/services/accessibilityScoreService');
const { getSafetyScore } = require('../src/services/safetyScoreService');
const { getEnvironmentScore } = require('../src/services/environmentScoreService');

const PERSONA_WEIGHTS = {
  default: { A: 0.4, S: 0.35, E: 0.25 },
  family: { A: 0.35, S: 0.4, E: 0.25 },
  elderly: { A: 0.45, S: 0.4, E: 0.15 },
  pet: { A: 0.3, S: 0.25, E: 0.45 }
};

const DEFAULT_DELAY_MS = 3000;
const DEFAULT_POI_DELAY_MS = 500;

function parseArgs(argv) {
  return argv.slice(2).reduce((args, arg) => {
    if (!arg.startsWith('--')) return args;

    const [rawKey, rawValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = rawValue === undefined ? true : rawValue;
    return args;
  }, {});
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';

  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function createCsvWriter(outputCsv) {
  if (!outputCsv) return null;

  const outputPath = path.resolve(process.cwd(), outputCsv);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const columns = [
    'locality_point_id',
    'suburb_name',
    'suburb_label',
    'postcode',
    'latitude',
    'longitude',
    'accessibility_score',
    'safety_score',
    'environment_score',
    'liveability_score',
    'persona',
    'time_minutes',
    'scoring_version',
    'crime_latest_year',
    'status',
    'error_message',
    'calculated_at',
    'breakdown_json'
  ];

  const stream = fs.createWriteStream(outputPath, { encoding: 'utf8' });
  stream.write(`${columns.join(',')}\n`);

  return {
    outputPath,
    write(row) {
      const line = columns.map((column) => csvEscape(row[column])).join(',');
      stream.write(`${line}\n`);
    },
    close() {
      return new Promise((resolve, reject) => {
        stream.end(resolve);
        stream.on('error', reject);
      });
    }
  };
}

async function columnExists(tableName, columnName) {
  const result = await pool.query(
    `
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
        and column_name = $2
      limit 1;
    `,
    [tableName, columnName]
  );

  return result.rowCount > 0;
}

async function getLocalityPointShape() {
  const [
    hasPlaceName,
    hasRawPlaceName,
    hasPlaceLabel,
    hasRawPlaceLabel,
    hasPostcode,
    hasLatitude,
    hasLongitude
  ] = await Promise.all([
    columnExists('locality_point', 'place_name'),
    columnExists('locality_point', 'PLACE_NAME'),
    columnExists('locality_point', 'placelabel'),
    columnExists('locality_point', 'PLACELABEL'),
    columnExists('locality_point', 'postcode'),
    columnExists('locality_point', 'latitude'),
    columnExists('locality_point', 'longitude')
  ]);

  const nameColumn = hasPlaceName
    ? 'place_name'
    : hasRawPlaceName
      ? '"PLACE_NAME"'
      : null;

  if (!nameColumn) {
    throw new Error('Could not find place_name or PLACE_NAME on public.locality_point');
  }

  return {
    nameColumn,
    labelColumn: hasPlaceLabel ? 'placelabel' : hasRawPlaceLabel ? '"PLACELABEL"' : null,
    postcodeColumn: hasPostcode ? 'postcode' : null,
    latitudeExpression:
      hasLatitude && hasLongitude ? 'latitude' : 'ST_Y(geom)',
    longitudeExpression:
      hasLatitude && hasLongitude ? 'longitude' : 'ST_X(geom)'
  };
}

async function fetchSuburbs({ limit, offset }) {
  const shape = await getLocalityPointShape();
  const labelExpression = shape.labelColumn || shape.nameColumn;
  const postcodeExpression = shape.postcodeColumn || 'null';
  const limitClause = limit > 0 ? 'limit $1 offset $2' : '';
  const params = limit > 0 ? [limit, offset] : [];

  const result = await pool.query(
    `
      select
        id as locality_point_id,
        ${shape.nameColumn} as suburb_name,
        ${labelExpression} as suburb_label,
        ${postcodeExpression} as postcode,
        ${shape.latitudeExpression} as latitude,
        ${shape.longitudeExpression} as longitude
      from public.locality_point
      where ${shape.nameColumn} is not null
        and ${shape.latitudeExpression} is not null
        and ${shape.longitudeExpression} is not null
      order by ${shape.nameColumn}
      ${limitClause};
    `,
    params
  );

  return result.rows.map((row) => ({
    localityPointId: row.locality_point_id,
    suburbName: row.suburb_name,
    suburbLabel: row.suburb_label,
    postcode: row.postcode,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude)
  }));
}

async function fetchSuburbsByName(suburbNames) {
  if (!suburbNames.length) return [];

  const shape = await getLocalityPointShape();
  const labelExpression = shape.labelColumn || shape.nameColumn;
  const postcodeExpression = shape.postcodeColumn || 'null';

  const result = await pool.query(
    `
      select
        id as locality_point_id,
        ${shape.nameColumn} as suburb_name,
        ${labelExpression} as suburb_label,
        ${postcodeExpression} as postcode,
        ${shape.latitudeExpression} as latitude,
        ${shape.longitudeExpression} as longitude
      from public.locality_point
      where upper(${shape.nameColumn}) = any($1::text[])
        and ${shape.latitudeExpression} is not null
        and ${shape.longitudeExpression} is not null
      order by array_position($1::text[], upper(${shape.nameColumn}));
    `,
    [suburbNames.map((name) => name.toUpperCase())]
  );

  return result.rows.map((row) => ({
    localityPointId: row.locality_point_id,
    suburbName: row.suburb_name,
    suburbLabel: row.suburb_label,
    postcode: row.postcode,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude)
  }));
}

async function getSourceMetadata() {
  const crimeYear = await pool.query(
    'select max(year) as latest_year from public.crime_suburb_summary;'
  );

  return {
    generatedBy: 'backend/scripts/precomputeSuburbScores.js',
    crimeLatestYear: crimeYear.rows[0]?.latest_year || null,
    usesMapbox: Boolean(process.env.MAPBOX_TOKEN),
    usesEpaAirwatch: Boolean(process.env.EPA_AIRWATCH_API_KEY)
  };
}

async function createScoreRun({ scoringVersion, persona, time, delayMs, sourceMetadata }) {
  const result = await pool.query(
    `
      insert into public.score_runs (
        scoring_version,
        persona,
        time_minutes,
        delay_ms,
        source_metadata
      )
      values ($1, $2, $3, $4, $5::jsonb)
      returning id;
    `,
    [scoringVersion, persona, time, delayMs, JSON.stringify(sourceMetadata)]
  );

  return result.rows[0].id;
}

async function finishScoreRun({ runId, status, errorMessage = null }) {
  await pool.query(
    `
      update public.score_runs
      set status = $2,
          completed_at = now(),
          error_message = $3
      where id = $1;
    `,
    [runId, status, errorMessage]
  );
}

function calculateLiveabilityScore({ accessibilityScore, safetyScore, environmentScore, persona }) {
  if (
    accessibilityScore == null ||
    safetyScore == null ||
    environmentScore == null
  ) {
    return null;
  }

  const weights = PERSONA_WEIGHTS[persona] || PERSONA_WEIGHTS.default;

  return Math.round(
    accessibilityScore * weights.A +
      safetyScore * weights.S +
      environmentScore * weights.E
  );
}

function applyMissingScoreFallbacks({ accessibility, safety, environment, fallbackSafetyScore }) {
  if (
    safety.safetyScore == null &&
    fallbackSafetyScore !== null &&
    fallbackSafetyScore !== undefined
  ) {
    return {
      ...safety,
      safetyScore: fallbackSafetyScore,
      fallbackApplied: true,
      fallbackReason: safety.message || 'No safety score returned'
    };
  }

  return safety;
}

async function saveSuburbScore({ runId, suburb, result }) {
  await pool.query(
    `
      insert into public.suburb_scores (
        score_run_id,
        locality_point_id,
        suburb_name,
        suburb_label,
        postcode,
        latitude,
        longitude,
        accessibility_score,
        safety_score,
        environment_score,
        liveability_score,
        status,
        error_message,
        breakdown
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14::jsonb
      )
      on conflict (score_run_id, suburb_name, postcode)
      do update set
        locality_point_id = excluded.locality_point_id,
        suburb_label = excluded.suburb_label,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accessibility_score = excluded.accessibility_score,
        safety_score = excluded.safety_score,
        environment_score = excluded.environment_score,
        liveability_score = excluded.liveability_score,
        status = excluded.status,
        error_message = excluded.error_message,
        breakdown = excluded.breakdown,
        calculated_at = now();
    `,
    [
      runId,
      suburb.localityPointId,
      suburb.suburbName,
      suburb.suburbLabel,
      suburb.postcode,
      suburb.latitude,
      suburb.longitude,
      result.accessibilityScore,
      result.safetyScore,
      result.environmentScore,
      result.liveabilityScore,
      result.status,
      result.errorMessage,
      JSON.stringify(result.breakdown || {})
    ]
  );
}

async function scoreSuburb({ suburb, time, persona, poiDelayMs, fallbackSafetyScore }) {
  const params = {
    lat: suburb.latitude,
    lng: suburb.longitude,
    time,
    persona
  };

  const accessibility = await getAccessibilityScore({
    ...params,
    sequentialPois: true,
    requestDelayMs: poiDelayMs
  });
  const rawSafety = await getSafetyScore(params);
  const environment = await getEnvironmentScore(params);
  const safety = applyMissingScoreFallbacks({
    accessibility,
    safety: rawSafety,
    environment,
    fallbackSafetyScore
  });
  const liveabilityScore = calculateLiveabilityScore({
    accessibilityScore: accessibility.accessibilityScore,
    safetyScore: safety.safetyScore,
    environmentScore: environment.environmentScore,
    persona
  });

  return {
    status: 'completed',
    errorMessage: null,
    accessibilityScore: accessibility.accessibilityScore,
    safetyScore: safety.safetyScore,
    environmentScore: environment.environmentScore,
    liveabilityScore,
    breakdown: {
      accessibility,
      safety,
      environment
    }
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const limit = toInt(args.limit, 0);
  const offset = toInt(args.offset, 0);
  const time = toInt(args.time, 20);
  const delayMs = toInt(args.delayMs, DEFAULT_DELAY_MS);
  const poiDelayMs = toInt(args.poiDelayMs, DEFAULT_POI_DELAY_MS);
  const fallbackSafetyScore =
    args.fallbackSafetyScore === undefined
      ? null
      : toInt(args.fallbackSafetyScore, null);
  const persona = args.persona || 'default';
  const scoringVersion = args.scoringVersion || 'suburb-score-v1';
  const stopOnError = Boolean(args.stopOnError);
  const outputCsv = args.outputCsv || args.csv || null;
  const writeDb = outputCsv ? Boolean(args.writeDb) : true;
  const suburbNames = args.suburbs
    ? String(args.suburbs)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    : [];

  const sourceMetadata = await getSourceMetadata();
  const csvWriter = createCsvWriter(outputCsv);
  const runId = writeDb
    ? await createScoreRun({
        scoringVersion,
        persona,
        time,
        delayMs,
        sourceMetadata: {
          ...sourceMetadata,
          poiDelayMs,
          fallbackSafetyScore,
          limit: limit || null,
          offset,
          suburbs: suburbNames,
          outputCsv: outputCsv || null
        }
      })
    : null;

  let failures = 0;

  try {
    const suburbs = suburbNames.length
      ? await fetchSuburbsByName(suburbNames)
      : await fetchSuburbs({ limit, offset });
    if (writeDb) {
      console.log(`Created score run ${runId}. Scoring ${suburbs.length} suburbs.`);
    } else {
      console.log(`Writing CSV only. Scoring ${suburbs.length} suburbs.`);
    }

    for (let index = 0; index < suburbs.length; index += 1) {
      const suburb = suburbs[index];
      console.log(
        `[${index + 1}/${suburbs.length}] ${suburb.suburbLabel || suburb.suburbName}`
      );

      try {
        const result = await scoreSuburb({
          suburb,
          time,
          persona,
          poiDelayMs,
          fallbackSafetyScore
        });
        if (writeDb) {
          await saveSuburbScore({ runId, suburb, result });
        }
        if (csvWriter) {
          csvWriter.write({
            locality_point_id: suburb.localityPointId,
            suburb_name: suburb.suburbName,
            suburb_label: suburb.suburbLabel,
            postcode: suburb.postcode,
            latitude: suburb.latitude,
            longitude: suburb.longitude,
            accessibility_score: result.accessibilityScore,
            safety_score: result.safetyScore,
            environment_score: result.environmentScore,
            liveability_score: result.liveabilityScore,
            persona,
            time_minutes: time,
            scoring_version: scoringVersion,
            crime_latest_year: sourceMetadata.crimeLatestYear,
            status: result.status,
            error_message: result.errorMessage,
            calculated_at: new Date().toISOString(),
            breakdown_json: result.breakdown
          });
        }
        console.log(
          `  saved A:${result.accessibilityScore} S:${result.safetyScore} E:${result.environmentScore} L:${result.liveabilityScore}`
        );
      } catch (err) {
        failures += 1;
        console.error(`  failed: ${err.message}`);

        const failedResult = {
          runId,
          suburb,
          result: {
            status: 'failed',
            errorMessage: err.message,
            breakdown: {
              stack: err.stack
            }
          }
        };

        if (writeDb) {
          await saveSuburbScore(failedResult);
        }
        if (csvWriter) {
          csvWriter.write({
            locality_point_id: suburb.localityPointId,
            suburb_name: suburb.suburbName,
            suburb_label: suburb.suburbLabel,
            postcode: suburb.postcode,
            latitude: suburb.latitude,
            longitude: suburb.longitude,
            accessibility_score: null,
            safety_score: null,
            environment_score: null,
            liveability_score: null,
            persona,
            time_minutes: time,
            scoring_version: scoringVersion,
            crime_latest_year: sourceMetadata.crimeLatestYear,
            status: 'failed',
            error_message: err.message,
            calculated_at: new Date().toISOString(),
            breakdown_json: { stack: err.stack }
          });
        }

        if (stopOnError) throw err;
      }

      if (index < suburbs.length - 1) {
        await delay(delayMs);
      }
    }

    if (writeDb) {
      await finishScoreRun({
        runId,
        status: failures > 0 ? 'completed_with_errors' : 'completed'
      });
      console.log(`Finished score run ${runId} with ${failures} failures.`);
    } else {
      console.log(`Finished CSV export with ${failures} failures.`);
    }
  } catch (err) {
    if (writeDb) {
      await finishScoreRun({
        runId,
        status: 'failed',
        errorMessage: err.message
      });
    }
    throw err;
  } finally {
    if (csvWriter) {
      await csvWriter.close();
      console.log(`CSV saved to ${csvWriter.outputPath}`);
    }
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
