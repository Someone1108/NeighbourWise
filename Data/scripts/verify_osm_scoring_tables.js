const fs = require('fs');
const path = require('path');
const { Pool } = require('../../backend/node_modules/pg');

const repoRoot = path.resolve(__dirname, '..', '..');
const envPath = path.join(repoRoot, 'backend', '.env');

function readDatabaseUrl() {
  const env = fs.readFileSync(envPath, 'utf8');
  const line = env
    .split(/\r?\n/)
    .find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));

  if (!line) {
    throw new Error('DATABASE_URL is missing from backend/.env');
  }

  return line
    .replace(/^\s*DATABASE_URL\s*=\s*/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

async function main() {
  const pool = new Pool({
    connectionString: readDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  const tables = [
    'osm_activity_scoring',
    'osm_noise_scoring',
    'osm_transport_comfort_scoring',
  ];

  try {
    for (const table of tables) {
      const result = await pool.query(
        `select count(*)::int as count from public.${table}`
      );
      console.log(`${table}: ${result.rows[0].count}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
