import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL environment variable is not defined.");
  process.exit(1);
}

const sql = neon(connectionString);

const statements = [
  `CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    cif VARCHAR(64),
    telf_org VARCHAR(64),
    address VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS persons (
    id SERIAL PRIMARY KEY,
    person_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    person_id VARCHAR(64) NOT NULL,
    first_name VARCHAR(255),
    second_name VARCHAR(255),
    email VARCHAR(255),
    telf_person VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS deals (
    id SERIAL PRIMARY KEY,
    deal_id VARCHAR(64) NOT NULL,
    deal_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    training_type VARCHAR(255),
    training JSONB DEFAULT '[]'::jsonb,
    hours INTEGER,
    deal_direction VARCHAR(255),
    sede VARCHAR(255),
    caes VARCHAR(255),
    fundae VARCHAR(255),
    hotel_night VARCHAR(255),
    alumnos INTEGER,
    prod_extra JSONB DEFAULT '[]'::jsonb,
    notes JSONB DEFAULT '[]'::jsonb,
    documents JSONB DEFAULT '[]'::jsonb,
    seassons_num INTEGER,
    seassons_id JSONB DEFAULT '[]'::jsonb,
    documents_num INTEGER,
    documents_id JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    notes_id VARCHAR(64) NOT NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
    comment_deal VARCHAR(4000) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    doc_id VARCHAR(64) NOT NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    doc_deal JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    seasson_id VARCHAR(64),
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(255),
    date_start TIMESTAMPTZ,
    date_end TIMESTAMPTZ,
    sede VARCHAR(255),
    seasson_address VARCHAR(255),
    seasson_fireman VARCHAR(255),
    seasson_vehicle VARCHAR(255),
    comment_seasson VARCHAR(4000),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS trainers (
    id SERIAL PRIMARY KEY,
    trainer_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS mobile_units (
    id SERIAL PRIMARY KEY,
    um_id VARCHAR(64),
    um_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS session_trainers (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
    trainer_id INTEGER REFERENCES trainers(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS session_units (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
    unit_id INTEGER REFERENCES mobile_units(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS pipedrive_deals (
    deal_id INTEGER PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    client_name VARCHAR(255),
    pipeline_id INTEGER,
    pipeline_name VARCHAR(255),
    won_date VARCHAR(128),
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS shared_state (
    key VARCHAR(128) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`
];

(async () => {
  try {
    for (const statement of statements) {
      console.log(`Executing SQL statement:\n${statement}`);
      await sql.query(statement);
    }

    console.log("Database schema synchronized successfully.");
  } catch (error) {
    console.error("Error while initializing database schema:", error);
    process.exitCode = 1;
  }
})();
