import { Hono } from "hono";
import { cors } from "hono/cors";
import { handle } from "hono/netlify";
import { db } from "../../shared/db";
import { deals, calendarEvents, notes } from "../../db/schema";
import { and, gte, lte } from "drizzle-orm";

const app = new Hono();
app.use("*", cors());

app.get("/deals", async (c) => {
  const page = Number(c.req.query("page") ?? "1");
  const limit = 50, offset = (page - 1) * limit;
  const rows = await db.select().from(deals).limit(limit).offset(offset);
  return c.json({ data: rows, page, limit });
});

app.post("/deals", async (c) => {
  const body = await c.req.json();
  if (!body?.title) return c.text("title is required", 400);
  const [row] = await db.insert(deals).values({
    title: body.title,
    orgId: body.orgId ?? null,
    personId: body.personId ?? null,
    pipeline: body.pipeline ?? null,
    stage: body.stage ?? null,
    value: body.value ?? null,
    currency: body.currency ?? "EUR",
    source: "manual"
  }).returning();
  return c.json({ data: row }, 201);
});

app.get("/calendar/events", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) return c.text("from/to required (ISO)", 400);
  const rows = await db.select().from(calendarEvents)
    .where(and(gte(calendarEvents.startsAt, new Date(from)), lte(calendarEvents.endsAt, new Date(to))));
  return c.json({ data: rows });
});

app.post("/notes", async (c) => {
  const body = await c.req.json();
  if (!body?.entityType || !body?.entityId || !body?.body) return c.text("invalid", 400);
  const [row] = await db.insert(notes).values(body).returning();
  return c.json({ data: row }, 201);
});

export const handler = handle(app);
