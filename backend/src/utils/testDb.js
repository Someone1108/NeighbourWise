const pool = require('./db');

async function testConnection() {
  try {
    const result = await pool.query('select now() as current_time;');
    console.log('Database connected successfully.');
    console.log(result.rows[0]);
  } catch (error) {
    console.error('Database connection failed:', error);
  } finally {
    await pool.end();
  }
}

testConnection();