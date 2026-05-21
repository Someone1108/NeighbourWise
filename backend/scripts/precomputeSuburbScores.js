require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/utils/db');
const {
  getAccessibilityScoresForPersonas
} = require('../src/services/accessibilityScoreService');
const { getSafetyScore } = require('../src/services/safetyScoreService');
const { getEnvironmentScore } = require('../src/services/environmentScoreService');

const PERSONA_WEIGHTS = {
  default: { A: 0.4, S: 0.35, E: 0.25 },
  family: { A: 0.35, S: 0.4, E: 0.25 },
  elderly: { A: 0.45, S: 0.4, E: 0.15 },
  pet: { A: 0.3, S: 0.25, E: 0.45 }
};

const DEFAULT_PERSONAS = ['default', 'family', 'elderly', 'pet'];
const PERSONA_ALIASES = {
  elder: 'elderly',
  elderly: 'elderly',
  family: 'family',
  pet: 'pet',
  default: 'default'
};

const DEFAULT_DELAY_MS = 3000;
const DEFAULT_POI_DELAY_MS = 750;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 30000;

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

function parsePersonas(args, fallbackPersonas = DEFAULT_PERSONAS) {
  const rawPersonas = args.personas || args.persona;
  const personas = rawPersonas
    ? String(rawPersonas)
        .split(',')
        .map((persona) => persona.trim().toLowerCase())
        .filter(Boolean)
    : fallbackPersonas;

  const normalized = personas.includes('all')
    ? DEFAULT_PERSONAS
    : personas.map((persona) => PERSONA_ALIASES[persona] || persona);

  const uniquePersonas = [...new Set(normalized)];
  const invalidPersonas = uniquePersonas.filter((persona) => !PERSONA_WEIGHTS[persona]);

  if (invalidPersonas.length) {
    throw new Error(
      `Unknown persona(s): ${invalidPersonas.join(', ')}. ` +
        `Use one of: ${Object.keys(PERSONA_WEIGHTS).join(', ')}.`
    );
  }

  return uniquePersonas;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';

  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [rawHeaders, ...records] = rows;
  if (!rawHeaders) return [];

  const headers = rawHeaders.map((header) => header.replace(/^\uFEFF/, ''));
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] || '']))
  );
}

function getCsvRowKey(row) {
  return [
    row.locality_point_id || '',
    String(row.suburb_name || '').toUpperCase(),
    row.postcode || '',
    row.persona || ''
  ].join('|');
}

function getJobKey(job) {
  return [
    job.suburb.localityPointId || '',
    String(job.suburb.suburbName || '').toUpperCase(),
    job.suburb.postcode || '',
    job.persona || ''
  ].join('|');
}

function getSuburbCacheKey(suburb) {
  return [
    suburb.localityPointId || '',
    String(suburb.suburbName || '').toUpperCase(),
    suburb.postcode || '',
    suburb.latitude,
    suburb.longitude
  ].join('|');
}

function loadCompletedCsvRows(outputCsv) {
  if (!outputCsv) return new Set();

  const outputPath = path.resolve(process.cwd(), outputCsv);
  if (!fs.existsSync(outputPath)) return new Set();

  const rows = parseCsv(fs.readFileSync(outputPath, 'utf8'));
  return new Set(
    rows
      .filter((row) => row.status === 'completed')
      .map((row) => getCsvRowKey(row))
  );
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

  const hasExistingRows =
    fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;

  if (!hasExistingRows) {
    fs.appendFileSync(outputPath, `${columns.join(',')}\n`, 'utf8');
  }

  return {
    outputPath,
    write(row) {
      const line = columns.map((column) => csvEscape(row[column])).join(',');
      fs.appendFileSync(outputPath, `${line}\n`, 'utf8');
    },
    close() {
      return Promise.resolve();
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

async function createScoreRunsByPersona({
  scoringVersion,
  personas,
  time,
  delayMs,
  sourceMetadata,
  writeDb
}) {
  if (!writeDb) return new Map();

  const runIdsByPersona = new Map();

  for (const persona of personas) {
    const runId = await createScoreRun({
      scoringVersion,
      persona,
      time,
      delayMs,
      sourceMetadata: {
        ...sourceMetadata,
        personas
      }
    });
    runIdsByPersona.set(persona, runId);
  }

  return runIdsByPersona;
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

function cloneScoreForPersona(score, persona) {
  return {
    ...score,
    persona
  };
}

async function getBaseSuburbScores({
  suburb,
  time,
  personas,
  poiDelayMs,
  suburbScoreCache
}) {
  const cacheKey = getSuburbCacheKey(suburb);
  const cached = suburbScoreCache.get(cacheKey);
  if (cached) return cached;

  const params = {
    lat: suburb.latitude,
    lng: suburb.longitude,
    time
  };

  const accessibilityByPersona = await getAccessibilityScoresForPersonas({
    ...params,
    personas,
    sequentialPois: true,
    requestDelayMs: poiDelayMs
  });
  const rawSafety = await getSafetyScore({
    ...params,
    persona: 'default'
  });
  const environment = await getEnvironmentScore({
    ...params,
    persona: 'default'
  });

  const baseScores = {
    accessibilityByPersona,
    rawSafety,
    environment
  };

  suburbScoreCache.set(cacheKey, baseScores);
  return baseScores;
}

async function scoreSuburb({
  suburb,
  time,
  persona,
  personas,
  poiDelayMs,
  fallbackSafetyScore,
  suburbScoreCache
}) {
  const baseScores = await getBaseSuburbScores({
    suburb,
    time,
    personas,
    poiDelayMs,
    suburbScoreCache
  });

  const accessibility = baseScores.accessibilityByPersona[persona];
  const rawSafety = cloneScoreForPersona(baseScores.rawSafety, persona);
  const environment = cloneScoreForPersona(baseScores.environment, persona);
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
  const status = liveabilityScore == null ? 'failed' : 'completed';

  return {
    status,
    errorMessage: status === 'failed' ? 'Unable to calculate complete score set' : null,
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

function makeJob({ suburb, persona }) {
  return {
    suburb,
    persona,
    attempts: 0,
    lastError: null,
    result: null
  };
}

function formatJobLabel(job, index, total) {
  return `[${index + 1}/${total}] ${job.suburb.suburbLabel || job.suburb.suburbName} (${job.persona})`;
}

function makeFailedResult(error) {
  return {
    status: 'failed',
    errorMessage: error.message,
    accessibilityScore: null,
    safetyScore: null,
    environmentScore: null,
    liveabilityScore: null,
    breakdown: {
      stack: error.stack
    }
  };
}

function writeCsvResult({
  csvWriter,
  suburb,
  result,
  persona,
  time,
  scoringVersion,
  crimeLatestYear
}) {
  if (!csvWriter) return;

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
    crime_latest_year: crimeLatestYear,
    status: result.status,
    error_message: result.errorMessage,
    calculated_at: new Date().toISOString(),
    breakdown_json: result.breakdown
  });
}

async function runJob({
  job,
  time,
  personas,
  poiDelayMs,
  fallbackSafetyScore,
  suburbScoreCache
}) {
  job.attempts += 1;
  const result = await scoreSuburb({
    suburb: job.suburb,
    time,
    persona: job.persona,
    personas,
    poiDelayMs,
    fallbackSafetyScore,
    suburbScoreCache
  });

  if (result.status !== 'completed') {
    throw new Error(result.errorMessage || 'Score generation returned incomplete data');
  }

  job.result = result;
  job.lastError = null;

  return job.result;
}

async function main() {
  const args = parseArgs(process.argv);
  const limit = toInt(args.limit, 0);
  const offset = toInt(args.offset, 0);
  const time = toInt(args.time, 20);
  const delayMs = toInt(args.delayMs, DEFAULT_DELAY_MS);
  const poiDelayMs = toInt(args.poiDelayMs, DEFAULT_POI_DELAY_MS);
  const retryDelayMs = toInt(args.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const maxRetries = toInt(args.maxRetries, DEFAULT_MAX_RETRIES);
  const fallbackSafetyScore =
    args.fallbackSafetyScore === undefined
      ? null
      : toInt(args.fallbackSafetyScore, null);
  const scoringVersion = args.scoringVersion || 'suburb-score-v1';
  const stopOnError = Boolean(args.stopOnError);
  const outputCsv = args.outputCsv || args.csv || null;
  const writeDb = outputCsv ? Boolean(args.writeDb) : true;
  const personas = parsePersonas(args, outputCsv ? DEFAULT_PERSONAS : ['default']);
  const suburbNames = args.suburbs
    ? String(args.suburbs)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    : [];

  const sourceMetadata = await getSourceMetadata();
  const completedCsvRows = loadCompletedCsvRows(outputCsv);
  const csvWriter = createCsvWriter(outputCsv);
  const runSourceMetadata = {
    ...sourceMetadata,
    poiDelayMs,
    retryDelayMs,
    maxRetries,
    fallbackSafetyScore,
    limit: limit || null,
    offset,
    suburbs: suburbNames,
    outputCsv: outputCsv || null
  };
  const runIdsByPersona = await createScoreRunsByPersona({
    scoringVersion,
    personas,
    time,
    delayMs,
    sourceMetadata: runSourceMetadata,
    writeDb
  });

  let failures = 0;
  let completed = 0;
  const suburbScoreCache = new Map();

  try {
    const suburbs = suburbNames.length
      ? await fetchSuburbsByName(suburbNames)
      : await fetchSuburbs({ limit, offset });
    const jobs = personas.flatMap((persona) =>
      suburbs.map((suburb) => makeJob({ suburb, persona }))
    ).filter((job) => !completedCsvRows.has(getJobKey(job)));
    const skipped = suburbs.length * personas.length - jobs.length;

    if (writeDb) {
      const runSummary = [...runIdsByPersona.entries()]
        .map(([persona, runId]) => `${persona}:${runId}`)
        .join(', ');
      console.log(
        `Created score runs (${runSummary}). Scoring ${jobs.length} suburb/persona jobs.`
      );
    } else {
      console.log(
        `Writing CSV only. Scoring ${jobs.length} suburb/persona jobs ` +
          `(${suburbs.length} suburbs x ${personas.length} personas).`
      );
      if (skipped > 0) {
        console.log(`Skipping ${skipped} completed rows already in ${outputCsv}.`);
      }
    }

    for (let pass = 0; pass <= maxRetries; pass += 1) {
      const pendingJobs = jobs.filter((job) => !job.result);
      if (!pendingJobs.length) break;

      if (pass > 0) {
        console.log(
          `Retry pass ${pass}/${maxRetries}: waiting ${retryDelayMs}ms before ` +
            `rerunning ${pendingJobs.length} failed jobs.`
        );
        await delay(retryDelayMs);
      }

      for (let index = 0; index < pendingJobs.length; index += 1) {
        const job = pendingJobs[index];
        console.log(formatJobLabel(job, index, pendingJobs.length));

        try {
          const result = await runJob({
            job,
            time,
            personas,
            poiDelayMs,
            fallbackSafetyScore,
            suburbScoreCache
          });
          completed += 1;
          if (writeDb) {
            await saveSuburbScore({
              runId: runIdsByPersona.get(job.persona),
              suburb: job.suburb,
              result
            });
          }
          writeCsvResult({
            csvWriter,
            suburb: job.suburb,
            result,
            persona: job.persona,
            time,
            scoringVersion,
            crimeLatestYear: sourceMetadata.crimeLatestYear
          });
          console.log(
            `  scored A:${result.accessibilityScore} S:${result.safetyScore} ` +
              `E:${result.environmentScore} L:${result.liveabilityScore}`
          );
        } catch (err) {
          job.lastError = err;
          console.error(`  failed attempt ${job.attempts}/${maxRetries + 1}: ${err.message}`);
          if (stopOnError) throw err;
        }

        if (index < pendingJobs.length - 1) {
          await delay(delayMs);
        }
      }
    }

    for (const job of jobs) {
      if (job.result) continue;

      const result = makeFailedResult(job.lastError || new Error('Unknown failure'));
      failures += 1;

      if (writeDb) {
        await saveSuburbScore({
          runId: runIdsByPersona.get(job.persona),
          suburb: job.suburb,
          result
        });
      }

      writeCsvResult({
        csvWriter,
        suburb: job.suburb,
        result,
        persona: job.persona,
        time,
        scoringVersion,
        crimeLatestYear: sourceMetadata.crimeLatestYear
      });
    }

    if (writeDb) {
      for (const runId of runIdsByPersona.values()) {
        await finishScoreRun({
          runId,
          status: failures > 0 ? 'completed_with_errors' : 'completed'
        });
      }
      console.log(`Finished score runs with ${completed} completed and ${failures} failures.`);
    } else {
      console.log(`Finished CSV export with ${completed} completed and ${failures} failures.`);
    }
  } catch (err) {
    if (writeDb) {
      for (const runId of runIdsByPersona.values()) {
        await finishScoreRun({
          runId,
          status: 'failed',
          errorMessage: err.message
        });
      }
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
