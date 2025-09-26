// netlify/functions/notes.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

import { eq } from 'drizzle-orm';
import { notes } from '../../db/schema';

const router = new Hono();

function getDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool);
}

// GET /api/notes?dealId=123
router.get('/', async (c) => {
  const db = getDb();
  const dealId = Number(c.req.query('dealId'));
  if (!dealId) return c.json({ error: 'dealId is required' }, 400);

  const list = await db.select().from(notes).where(eq(notes.dealId, dealId)).orderBy(notes.createdAt);
  return c.json(list);
});

// POST /api/notes { dealId, content }
router.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json().catch(() => ({}));

  const dealId = Number(body?.dealId);
  const content = (body?.content ?? '').toString().trim();
  if (!dealId || !content) return c.json({ error: 'dealId and content are required' }, 400);

  const inserted = await db.insert(notes).values({ dealId, content }).returning();
  return c.json(inserted[0]);
});

export default router;
