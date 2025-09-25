import { Client } from "pg";

(async () => {
  console.log("SMOKE SCRIPT: org-v1");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL no definida");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const { rows: db } = await client.query("select current_database() as db");
  console.log("DB:", db[0].db);
  console.log("Now:", new Date().toISOString());

  const res = await client.query(`
    INSERT INTO organizations (pipedrive_id, name, created_at, updated_at)
    VALUES ($1,$2,now(),now())
    ON CONFLICT (pipedrive_id)
    DO UPDATE SET name=EXCLUDED.name, updated_at=now()
    RETURNING id
  `, [999999, 'SMOKE TEST ORG']);

  console.log("UPSERT organizations OK id:", res.rows[0].id);

  await client.end();
})();
