// netlify/functions/deals.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

import { and, eq, sql } from 'drizzle-orm';
import { deals, organizations, persons, products, notes, documents, sessions } from '../../db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import { DEAL_CF } from '../../src/shared/pipedriveFields';

const router = new Hono();

// DB helper
function getDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool);
}

// Util
const asBool = (v: any) => (typeof v === 'boolean' ? v : v === '1' || v === 1 || `${v}`.toLowerCase() === 'true');

type DealRow = InferSelectModel<typeof deals>;
type OrgRow = InferSelectModel<typeof organizations>;
type PersonRow = InferSelectModel<typeof persons>;
type ProductRow = InferSelectModel<typeof products>;
type NoteRow = InferSelectModel<typeof notes>;
type DocRow = InferSelectModel<typeof documents>;
type SessionRow = InferSelectModel<typeof sessions>;

function splitProducts(items: ProductRow[]) {
  const trainings = items.filter(p => p.isTraining || (p.code ?? '').toLowerCase().startsWith('form-'));
  const extras    = items.filter(p => !(p.isTraining || (p.code ?? '').toLowerCase().startsWith('form-')));
  return { trainings, extras };
}

// GET /api/deals?pipelineId=3&page=1&pageSize=50
router.get('/', async (c) => {
  const db = getDb();

  const pipelineId = Number(c.req.query('pipelineId') ?? '3') || 3;
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? '50')));
  const offset = (page - 1) * pageSize;

  // Listado básico de deals
  const list = await db
    .select()
    .from(deals)
    .where(eq(deals.pipelineId, pipelineId))
    .orderBy(sql`${deals.updatedAt} desc`)
    .limit(pageSize)
    .offset(offset);

  // Cargar relaciones en bloque
  const ids = list.map(d => d.id);
  let prods: ProductRow[] = [];
  let ns: NoteRow[] = [];
  let ds: DocRow[] = [];
  let ss: SessionRow[] = [];

  if (ids.length) {
    prods = await db.select().from(products).where(sql`${products.dealId} = any(${ids})`);
    ns    = await db.select().from(notes).where(sql`${notes.dealId} = any(${ids})`);
    ds    = await db.select().from(documents).where(sql`${documents.dealId} = any(${ids})`);
    ss    = await db.select().from(sessions).where(sql`${sessions.dealId} = any(${ids})`);
  }

  // Orgs/persons
  const orgIds = list.map(d => d.orgId).filter(Boolean) as number[];
  const personIds = list.map(d => d.personId).filter(Boolean) as number[];
  const orgs = orgIds.length ? await db.select().from(organizations).where(sql`${organizations.id} = any(${orgIds})`) : [];
  const pers = personIds.length ? await db.select().from(persons).where(sql`${persons.id} = any(${personIds})`) : [];

  const orgById = new Map(orgs.map(o => [o.id, o]));
  const perById = new Map(pers.map(p => [p.id, p]));

  const result = list.map(d => {
    const p = prods.filter(x => x.dealId === d.id);
    const { trainings, extras } = splitProducts(p);
    const nn = ns.filter(x => x.dealId === d.id);
    const dd = ds.filter(x => x.dealId === d.id);
    const se = ss.filter(x => x.dealId === d.id);

    const org = d.orgId ? orgById.get(d.orgId) : undefined;
    const per = d.personId ? perById.get(d.personId) : undefined;

    return {
      id: d.id,
      title: d.title,
      pipelineId: d.pipelineId,
      status: d.status,
      orgId: d.orgId,
      orgName: org?.name ?? null,
      personId: d.personId,
      personName: per?.name ?? null,
      sede: d.sede ?? null,
      dealDirection: d.dealDirection ?? null,
      caes: asBool(d.caes ?? false),
      fundae: asBool(d.fundae ?? false),
      hotelPernocta: asBool(d.hotelPernocta ?? false),
      updatedAt: d.updatedAt,
      trainings,
      extras,
      notes: nn,
      attachments: dd,
      sessions: se,
    };
  });

  return c.json({ page, pageSize, count: result.length, items: result });
});

// GET /api/deals/:id
router.get('/:id', async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'invalid id' }, 400);

  const d = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  if (!d.length) return c.json({ error: 'not found' }, 404);
  const deal = d[0];

  const [p, nn, dd, se] = await Promise.all([
    db.select().from(products).where(eq(products.dealId, id)),
    db.select().from(notes).where(eq(notes.dealId, id)),
    db.select().from(documents).where(eq(documents.dealId, id)),
    db.select().from(sessions).where(eq(sessions.dealId, id)),
  ]);

  const org = deal.orgId ? (await db.select().from(organizations).where(eq(organizations.id, deal.orgId)).limit(1))[0] : null;
  const per = deal.personId ? (await db.select().from(persons).where(eq(persons.id, deal.personId)).limit(1))[0] : null;

  const { trainings, extras } = splitProducts(p);

  return c.json({
    id: deal.id,
    title: deal.title,
    pipelineId: deal.pipelineId,
    status: deal.status,
    orgId: deal.orgId,
    orgName: org?.name ?? null,
    personId: deal.personId,
    personName: per?.name ?? null,
    sede: deal.sede ?? null,
    dealDirection: deal.dealDirection ?? null,
    caes: asBool(deal.caes ?? false),
    fundae: asBool(deal.fundae ?? false),
    hotelPernocta: asBool(deal.hotelPernocta ?? false),
    updatedAt: deal.updatedAt,
    trainings,
    extras,
    notes: nn,
    attachments: dd,
    sessions: se,
  });
});

export default router;
