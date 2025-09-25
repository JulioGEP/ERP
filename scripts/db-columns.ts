import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl:{rejectUnauthorized:false}});
(async () => {
  const c = await pool.connect();
  try {
    const { rows } = await c.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name='deals'
      ORDER BY ordinal_position;
    `);
    console.table(rows);
  } finally {
    c.release();
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
