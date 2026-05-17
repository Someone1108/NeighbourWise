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
      const columns = await pool.query(
        `
          select column_name, data_type, udt_name, is_nullable
          from information_schema.columns
          where table_schema = $1
            and table_name = $2
          order by ordinal_position
        `,
        ['public', table]
      );

      const geometry = await pool.query(
        `
          select f_geometry_column, srid, type
          from public.geometry_columns
          where f_table_schema = $1
            and f_table_name = $2
        `,
        ['public', table]
      );

      console.log(`\n${table}`);
      for (const row of columns.rows) {
        console.log(
          `${row.column_name} | ${row.data_type} | ${row.udt_name} | nullable=${row.is_nullable}`
        );
      }
      console.log(`geometry_columns: ${JSON.stringify(geometry.rows)}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
