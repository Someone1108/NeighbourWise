const fs = require('fs');
const path = require('path');
const { Pool } = require('../../backend/node_modules/pg');

const repoRoot = path.resolve(__dirname, '..', '..');
const csvPath = process.argv[2] || 'C:\\Users\\AmanRoy\\Downloads\\australian_postcodes.csv';

function readDatabaseUrl() {
  const envPath = path.join(repoRoot, 'backend', '.env');
  const env = fs.readFileSync(envPath, 'utf8');
  const line = env
    .split(/\r?\n/)
    .find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));

  if (!line) throw new Error('DATABASE_URL is missing from backend/.env');

  return line
    .replace(/^\s*DATABASE_URL\s*=\s*/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();
  return rows
    .filter((values) => values.length === header.length)
    .map((values) => Object.fromEntries(header.map((key, index) => [key, values[index]])));
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function normalizePostcode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.padStart(4, '0');
}

function unique(values) {
  return new Set(values.filter(Boolean));
}

function top(rows, key, limit = 10) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key] || '(blank)';
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

async function main() {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const vicRows = rows.filter((row) => row.state === 'VIC');
  const usableVicRows = vicRows.filter((row) => {
    const type = String(row.type || '').toLowerCase();
    return type !== 'post office boxes';
  });

  const pool = new Pool({
    connectionString: readDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    const localityResult = await pool.query(`
      select
        upper(trim("PLACE_NAME")) as name,
        count(*)::int as count
      from public.locality_point
      where "PLACE_NAME" is not null
      group by upper(trim("PLACE_NAME"))
    `);

    const poaResult = await pool.query(`
      select distinct postcode
      from public.poa_lookup
      where postcode is not null
    `);

    const localityNames = new Set(localityResult.rows.map((row) => row.name));
    const dbPostcodes = new Set(poaResult.rows.map((row) => normalizePostcode(row.postcode)));
    const csvVicPostcodes = unique(usableVicRows.map((row) => normalizePostcode(row.postcode)));
    const csvVicNames = unique(usableVicRows.map((row) => normalizeName(row.locality)));

    const matchedRows = usableVicRows.filter((row) => localityNames.has(normalizeName(row.locality)));
    const unmatchedRows = usableVicRows.filter((row) => !localityNames.has(normalizeName(row.locality)));
    const csvPostcodesNotDb = [...csvVicPostcodes].filter((postcode) => !dbPostcodes.has(postcode)).sort();
    const dbPostcodesNotCsv = [...dbPostcodes].filter((postcode) => !csvVicPostcodes.has(postcode)).sort();

    const duplicatePostcodes = [...csvVicPostcodes]
      .map((postcode) => ({
        postcode,
        localityCount: unique(
          usableVicRows
            .filter((row) => normalizePostcode(row.postcode) === postcode)
            .map((row) => normalizeName(row.locality))
        ).size,
      }))
      .filter((item) => item.localityCount > 1)
      .sort((a, b) => b.localityCount - a.localityCount);

    console.log(JSON.stringify({
      csvPath,
      totalCsvRows: rows.length,
      vicRows: vicRows.length,
      usableVicRowsExcludingPoBoxes: usableVicRows.length,
      csvVicUniquePostcodes: csvVicPostcodes.size,
      dbPoaUniquePostcodes: dbPostcodes.size,
      csvVicPostcodesNotInDbPoa: {
        count: csvPostcodesNotDb.length,
        sample: csvPostcodesNotDb.slice(0, 30),
      },
      dbPoaPostcodesNotInCsvVic: {
        count: dbPostcodesNotCsv.length,
        sample: dbPostcodesNotCsv.slice(0, 30),
      },
      csvVicUniqueLocalities: csvVicNames.size,
      dbLocalityPointUniqueNames: localityNames.size,
      csvRowsMatchingLocalityPointByName: matchedRows.length,
      csvRowsNotMatchingLocalityPointByName: unmatchedRows.length,
      csvRowsWithSa2Code: usableVicRows.filter((row) => row.SA2_CODE_2021).length,
      csvRowsWithPreciseCoordinates: usableVicRows.filter((row) => row.Lat_precise && row.Long_precise).length,
      topVicTypes: top(vicRows, 'type'),
      topDuplicatePostcodesByLocalityCount: duplicatePostcodes.slice(0, 15),
      unmatchedNameSample: unmatchedRows
        .slice(0, 25)
        .map((row) => ({
          postcode: normalizePostcode(row.postcode),
          locality: row.locality,
          type: row.type,
          sa2: row.SA2_NAME_2021,
        })),
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
