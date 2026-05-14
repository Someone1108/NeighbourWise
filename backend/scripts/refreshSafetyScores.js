require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/utils/db');
const { getSafetyScore } = require('../src/services/safetyScoreService');

const PERSONA_WEIGHTS = {
  default: { A: 0.4, S: 0.35, E: 0.25 },
  family: { A: 0.35, S: 0.4, E: 0.25 },
  elderly: { A: 0.45, S: 0.4, E: 0.15 },
  pet: { A: 0.3, S: 0.25, E: 0.45 }
};

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

function calculateLiveabilityScore({
  accessibilityScore,
  safetyScore,
  environmentScore,
  persona
}) {
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
  const headers = rawHeaders.map((header) => header.replace(/^\uFEFF/, ''));
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] || '']))
  );
}

function readScoresFromCsv(inputCsv, { limit, offset }) {
  const inputPath = path.resolve(process.cwd(), inputCsv);
  const rows = parseCsv(fs.readFileSync(inputPath, 'utf8')).map((row) => ({
    ...row,
    score_run_id: row.score_run_id ? Number(row.score_run_id) : null,
    locality_point_id: row.locality_point_id ? Number(row.locality_point_id) : null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accessibility_score: row.accessibility_score ? Number(row.accessibility_score) : null,
    safety_score: row.safety_score ? Number(row.safety_score) : null,
    environment_score: row.environment_score ? Number(row.environment_score) : null,
    liveability_score: row.liveability_score ? Number(row.liveability_score) : null,
    breakdown: row.breakdown ? JSON.parse(row.breakdown) : {}
  }));

  return limit > 0 ? rows.slice(offset, offset + limit) : rows.slice(offset);
}

function createCsvWriter(outputCsv, columns) {
  if (!outputCsv) return null;

  const outputPath = path.resolve(process.cwd(), outputCsv);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const stream = fs.createWriteStream(outputPath, { encoding: 'utf8' });
  stream.write(`${columns.join(',')}\n`);

  return {
    outputPath,
    write(row) {
      stream.write(`${columns.map((column) => csvEscape(row[column])).join(',')}\n`);
    },
    close() {
      return new Promise((resolve, reject) => {
        stream.end(resolve);
        stream.on('error', reject);
      });
    }
  };
}

async function getLatestScores({ limit, offset }) {
  const limitClause = limit > 0 ? 'limit $1 offset $2' : '';
  const params = limit > 0 ? [limit, offset] : [];

  const result = await pool.query(
    `
      select
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
        breakdown
      from public.latest_suburb_scores
      where status = 'completed'
      order by suburb_name
      ${limitClause};
    `,
    params
  );

  return result.rows;
}

async function createScoreRun({
  scoringVersion,
  persona,
  time,
  delayMs,
  rows
}) {
  const previousRunIds = [
    ...new Set(rows.map((row) => row.score_run_id).filter(Boolean))
  ];

  const result = await pool.query(
    `
      insert into public.score_runs (
        scoring_version,
        persona,
        time_minutes,
        delay_ms,
        status,
        source_metadata
      )
      values ($1, $2, $3, $4, 'running', $5::jsonb)
      returning id;
    `,
    [
      scoringVersion,
      persona,
      time,
      delayMs,
      JSON.stringify({
        generatedBy: 'backend/scripts/refreshSafetyScores.js',
        updateType: 'safety-only-refresh',
        previousRunIds,
        rowCount: rows.length
      })
    ]
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

function mergeBreakdown(previousBreakdown, safetyBreakdown) {
  const breakdown = previousBreakdown && typeof previousBreakdown === 'object'
    ? previousBreakdown
    : {};

  return {
    ...breakdown,
    safety: safetyBreakdown
  };
}

async function insertRefreshedScore({ runId, row, refreshed }) {
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
      );
    `,
    [
      runId,
      row.locality_point_id,
      row.suburb_name,
      row.suburb_label,
      row.postcode,
      row.latitude,
      row.longitude,
      refreshed.accessibilityScore,
      refreshed.safetyScore,
      refreshed.environmentScore,
      refreshed.liveabilityScore,
      refreshed.status,
      refreshed.errorMessage,
      JSON.stringify(refreshed.breakdown || {})
    ]
  );
}

async function refreshRow({ row, persona, time, fallbackSafetyScore }) {
  const accessibilityScore = Number(row.accessibility_score);
  const environmentScore = Number(row.environment_score);
  const oldSafetyScore =
    row.safety_score === null || row.safety_score === undefined
      ? null
      : Number(row.safety_score);
  const oldLiveabilityScore =
    row.liveability_score === null || row.liveability_score === undefined
      ? null
      : Number(row.liveability_score);

  const safety = await getSafetyScore({
    lat: row.latitude,
    lng: row.longitude,
    time,
    persona
  });

  const safetyScore = safety.safetyScore ?? fallbackSafetyScore;
  const safetyBreakdown = safety.safetyScore == null && fallbackSafetyScore != null
    ? {
        ...safety,
        safetyScore,
        fallbackApplied: true,
        fallbackReason: safety.message || 'No safety score returned'
      }
    : safety;

  const liveabilityScore = calculateLiveabilityScore({
    accessibilityScore,
    safetyScore,
    environmentScore,
    persona
  });

  return {
    previousScoreRunId: row.score_run_id,
    accessibilityScore,
    oldSafetyScore,
    safetyScore,
    environmentScore,
    oldLiveabilityScore,
    liveabilityScore,
    status: liveabilityScore == null ? 'failed' : 'completed',
    errorMessage: liveabilityScore == null
      ? 'Unable to calculate liveability after safety refresh'
      : null,
    breakdown: mergeBreakdown(row.breakdown, safetyBreakdown)
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const limit = toInt(args.limit, 0);
  const offset = toInt(args.offset, 0);
  const time = toInt(args.time, 20);
  const delayMs = toInt(args.delayMs, 0);
  const persona = args.persona || 'default';
  const scoringVersion = args.scoringVersion || 'safety-score-v2';
  const inputCsv = args.inputCsv || null;
  const outputCsv =
    args.outputCsv || args.csv || 'exports/safety_scores_refresh.csv';
  const writeDb = Boolean(args.writeDb);
  const fallbackSafetyScore =
    args.fallbackSafetyScore === undefined
      ? null
      : toInt(args.fallbackSafetyScore, null);

  const uploadColumns = [
    'score_run_id',
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
    'status',
    'error_message',
    'breakdown',
    'calculated_at'
  ];
  const comparisonColumns = [
    'score_run_id',
    'previous_score_run_id',
    'locality_point_id',
    'suburb_name',
    'suburb_label',
    'postcode',
    'latitude',
    'longitude',
    'accessibility_score',
    'old_safety_score',
    'safety_score',
    'environment_score',
    'old_liveability_score',
    'liveability_score',
    'status',
    'error_message',
    'breakdown'
  ];
  const csvWriter = createCsvWriter(
    outputCsv,
    inputCsv ? uploadColumns : comparisonColumns
  );
  let runId = args.scoreRunId ? toInt(args.scoreRunId, null) : null;
  let failures = 0;

  try {
    const rows = inputCsv
      ? readScoresFromCsv(inputCsv, { limit, offset })
      : await getLatestScores({ limit, offset });
    console.log(`Refreshing safety scores for ${rows.length} suburbs.`);

    if (writeDb && runId == null) {
      runId = await createScoreRun({
        scoringVersion,
        persona,
        time,
        delayMs,
        rows
      });
      console.log(`Created score run ${runId}.`);
    } else if (writeDb) {
      console.log(`Writing rows to existing score run ${runId}.`);
    } else {
      console.log('CSV-only mode: no database rows will be inserted.');
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      console.log(`[${index + 1}/${rows.length}] ${row.suburb_label || row.suburb_name}`);

      try {
        const refreshed = await refreshRow({
          row,
          persona,
          time,
          fallbackSafetyScore
        });

        if (refreshed.status !== 'completed') failures += 1;

        if (writeDb) {
          await insertRefreshedScore({ runId, row, refreshed });
        }

        if (csvWriter) {
          if (inputCsv) {
            csvWriter.write({
              score_run_id: runId ?? row.score_run_id,
              locality_point_id: row.locality_point_id,
              suburb_name: row.suburb_name,
              suburb_label: row.suburb_label,
              postcode: row.postcode,
              latitude: row.latitude,
              longitude: row.longitude,
              accessibility_score: refreshed.accessibilityScore,
              safety_score: refreshed.safetyScore,
              environment_score: refreshed.environmentScore,
              liveability_score: refreshed.liveabilityScore,
              status: refreshed.status,
              error_message: refreshed.errorMessage,
              breakdown: refreshed.breakdown,
              calculated_at: new Date().toISOString()
            });
          } else {
            csvWriter.write({
              score_run_id: runId,
              previous_score_run_id: refreshed.previousScoreRunId,
              locality_point_id: row.locality_point_id,
              suburb_name: row.suburb_name,
              suburb_label: row.suburb_label,
              postcode: row.postcode,
              latitude: row.latitude,
              longitude: row.longitude,
              accessibility_score: refreshed.accessibilityScore,
              old_safety_score: refreshed.oldSafetyScore,
              safety_score: refreshed.safetyScore,
              environment_score: refreshed.environmentScore,
              old_liveability_score: refreshed.oldLiveabilityScore,
              liveability_score: refreshed.liveabilityScore,
              status: refreshed.status,
              error_message: refreshed.errorMessage,
              breakdown: refreshed.breakdown
            });
          }
        }

        console.log(
          `  safety ${refreshed.oldSafetyScore} -> ${refreshed.safetyScore}; liveability ${refreshed.oldLiveabilityScore} -> ${refreshed.liveabilityScore}`
        );
      } catch (err) {
        failures += 1;
        console.error(`  failed: ${err.message}`);
      }

      if (delayMs > 0 && index < rows.length - 1) {
        await delay(delayMs);
      }
    }

    if (writeDb) {
      await finishScoreRun({
        runId,
        status: failures > 0 ? 'completed_with_errors' : 'completed'
      });
    }

    console.log(`Finished safety refresh with ${failures} failures.`);
  } catch (err) {
    if (runId) {
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
