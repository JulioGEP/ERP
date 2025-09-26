// netlify/functions/calendar.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

import { and, gte, lte } from 'drizzle-orm';
import { sessions, deals } from '../../db/schema';

const router = new Hono();

function getDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool);
}

// GET /api/calendar/events?from=2025-09-01&to=2025-09-30
router.get('/events', async (c) => {
  const db = getDb();

  const from = c.req.query('from') ? new Date(c.req.query('from') as string) : null;
  const to   = c.req.query('to')   ? new Date(c.req.query('to') as string)   : null;

  const where = from && to
    ? and(gte(sessions.startDate, from), lte(sessions.endDate, to))
    : undefined;

  const items = await db
    .select({
      id: sessions.id,
      dealId: sessions.dealId,
      title: deals.title,
      start: sessions.startDate,
      end: sessions.endDate,
      location: sessions.location
    })
    .from(sessions)
    .leftJoin(deals, and(deals.id.eq(sessions.dealId)))
    .where(where as any);

  // Formato tipo FullCalendar
  const events = items.map(i => ({
    id: i.id,
    title: i.title ?? `Formación #${i.dealId}`,
    start: i.start,
    end: i.end,
    extendedProps: {
      dealId: i.dealId,
      location: i.location
    }
  }));

  return c.json(events);
});

export default router;
