require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/utils/db');

const DEFAULT_INPUT_CSV = 'exports/suburb_scores_situations.csv';
const DEFAULT_SCORING_VERSION = 'suburb-score-situations-v1';
const ALLOWED_PERSONAS = new Set(['default', 'family', 'elderly', 'pet']);

function parseArgs(argv) {
  return argv.slice(2).reduce((args, arg) => {
    if (!arg.startsWith('--')) return args;

    const [rawKey, rawValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = rawValue === undefined ? true : rawValue;
    return args;
  }, {});
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

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value) {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function readRows(inputCsv) {
  const inputPath = path.resolve(process.cwd(), inputCsv);
  const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'));

  return rows
    .filter((row) => row.status === 'completed')
    .map((row) => {
      const persona = String(row.persona || 'default').toLowerCase();
      if (!ALLOWED_PERSONAS.has(persona)) {
        throw new Error(`Unknown persona in CSV: ${row.persona}`);
      }

      return {
        localityPointId: toInteger(row.locality_point_id),
        suburbName: row.suburb_name,
        suburbLabel: row.suburb_label || row.suburb_name,
        postcode: row.postcode || null,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        accessibilityScore: toInteger(row.accessibility_score),
        safetyScore: toInteger(row.safety_score),
        environmentScore: toInteger(row.environment_score),
        liveabilityScore: toInteger(row.liveability_score),
        persona,
        timeMinutes: toInteger(row.time_minutes) || 20,
        scoringVersion: row.scoring_version || DEFAULT_SCORING_VERSION,
        calculatedAt: row.calculated_at || new Date().toISOString(),
        breakdown: row.breakdown_json ? JSON.parse(row.breakdown_json) : {}
      };
    });
}

async function createScoreRun({ client, persona, timeMinutes, scoringVersion, rows, inputCsv }) {
  const result = await client.query(
    `
      insert into public.score_runs (
        scoring_version,
        persona,
        time_minutes,
        delay_ms,
        status,
        source_metadata,
        completed_at
      )
      values ($1, $2, $3, 0, 'completed', $4::jsonb, now())
      returning id;
    `,
    [
      scoringVersion,
      persona,
      timeMinutes,
      JSON.stringify({
        generatedBy: 'backend/scripts/uploadSituationScores.js',
        inputCsv,
        rowCount: rows.length
      })
    ]
  );

  return result.rows[0].id;
}

async function insertRows({ client, runId, rows }) {
  for (const row of rows) {
    await client.query(
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
          breakdown,
          calculated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, 'completed', null, $12::jsonb, $13
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
          calculated_at = excluded.calculated_at;
      `,
      [
        runId,
        row.localityPointId,
        row.suburbName,
        row.suburbLabel,
        row.postcode,
        row.latitude,
        row.longitude,
        row.accessibilityScore,
        row.safetyScore,
        row.environmentScore,
        row.liveabilityScore,
        JSON.stringify(row.breakdown),
        row.calculatedAt
      ]
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const inputCsv = args.inputCsv || DEFAULT_INPUT_CSV;
  const rows = readRows(inputCsv);

  if (!rows.length) {
    throw new Error(`No completed rows found in ${inputCsv}`);
  }

  const groups = new Map();
  for (const row of rows) {
    const key = [row.persona, row.timeMinutes, row.scoringVersion].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const client = await pool.connect();

  try {
    await client.query('begin');

    for (const groupRows of groups.values()) {
      const first = groupRows[0];
      const runId = await createScoreRun({
        client,
        persona: first.persona,
        timeMinutes: first.timeMinutes,
        scoringVersion: DEFAULT_SCORING_VERSION,
        rows: groupRows,
        inputCsv
      });

      await insertRows({ client, runId, rows: groupRows });
      console.log(
        `Uploaded ${groupRows.length} rows for ${first.persona} to score run ${runId}.`
      );
    }

    await client.query('commit');
    console.log(`Uploaded ${rows.length} completed situation score rows.`);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
