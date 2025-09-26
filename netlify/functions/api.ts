// netlify/functions/api.ts (REEMPLAZO COMPLETO)

// ───────────────────────────────── Imports (arriba SIEMPRE)
import type { Handler } from "@netlify/functions";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";

// ───────────────────────────────── DB bootstrap
const createDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url || typeof url !== "string" || url.trim().length === 0) return null;
  try {
    return drizzle(neon(url));
  } catch (err) {
    console.error("DB bootstrap error:", err);
    return null;
  }
};
const db = createDb();
const requireDb = () => {
  if (!db) throw new Error("DATABASE_URL not configured or DB unavailable");
  return db;
};

// ───────────────────────────────── Utils (UNA SOLA VEZ)
const toOptionalText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
};
const toOptionalString = toOptionalText;
const toOptionalNumber = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toBool = (v: unknown): boolean | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  const t = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "si"].includes(t)) return true;
  if (["false", "0", "no"].includes(t)) return false;
  return null;
};
const readNestedString = (obj: unknown, key: string): string | null => {
  if (!obj || typeof obj !== "object") return null;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === "string" && val.trim().length > 0 ? val : null;
};
const normaliseArray = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value
    : value && typeof value === "object"
    ? (["items", "data", "values", "results"]
        .map((k) => (value as Record<string, unknown>)[k])
        .find((x) => Array.isArray(x)) as unknown[] | undefined) ?? []
    : [];
const ensureId = (value: unknown, prefix: string, index: number): string =>
  toOptionalText(value) ?? `${prefix}-${index}`;

// ───────────────────────────────── Index setup (guarded)
const ENABLE_DB_INDEX_SETUP =
  (process.env.ENABLE_DB_INDEX_SETUP ?? "").toString().trim().toLowerCase() === "true";

const ensurePipedriveIndexes = async () => {
  if (!db || !ENABLE_DB_INDEX_SETUP) return;
  const statements = [
    "create unique index if not exists organizations_pipedrive_id_key on organizations(pipedrive_id)",
    "create unique index if not exists persons_pipedrive_id_key on persons(pipedrive_id)",
    "create unique index if not exists deals_pipedrive_id_key on deals(pipedrive_id)",
    "create unique index if not exists notes_pipedrive_id_key on notes(pipedrive_id)",
    "create unique index if not exists documents_pipedrive_id_key on documents(pipedrive_id)",
  ];
  for (const s of statements) {
    try {
      await db.execute(sql.raw(s));
    } catch (e: any) {
      const msg = typeof e?.message === "string" ? e.message : "";
      if (!msg.toLowerCase().includes("already exists")) {
        console.error("INDEX SETUP FAIL:", s, e);
        throw e;
      }
    }
  }
};
if (db) {
  ensurePipedriveIndexes().catch((e) => {
    console.error("Pipedrive index preparation failed (guarded):", e);
  });
}

// ───────────────────────────────── Hono app (Única instancia)
const app = new Hono().basePath("/.netlify/functions/api");
app.use("*", cors());

// ───────────────────────────────── GET /deals (lee SIEMPRE de Neon)
app.get("/deals", async (c) => {
  try {
    const db = requireDb();

    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.max(0, Number(c.req.query("limit") ?? 50));
    const offset = Math.max(0, (page - 1) * (limit || 0));

    // ids?=1,2,3
    const idsParam = toOptionalText(c.req.query("ids"));
    const ids = idsParam
      ? idsParam.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n))
      : [];

    const filter = ids.length
      ? sql`where d.id in (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`
      : sql``;

    const pagination = limit > 0 ? sql`limit ${limit} offset ${offset}` : sql``;

    const res = await db.execute(sql`
      select
        d.id,
        d.pipedrive_id,
        d.org_id as client_id,
        o.name as client_name,
        d.site as sede,
        d.deal_direction as address,
        d.caes,
        d.fundae,
        d.hotel_night as hotel_pernocta,
        d.pipeline_id,
        d.updated_at
      from deals d
      left join organizations o on o.id = d.org_id
      ${filter}
      order by d.updated_at desc, d.id desc
      ${pagination}
    `);

    return c.json(
      {
        deals: (res.rows as any[]).map((r) => ({
          id: Number(r.id),
          pipedrive_id: r.pipedrive_id ? Number(r.pipedrive_id) : null,
          client_id: r.client_id ? Number(r.client_id) : null,
          client_name: r.client_name ?? null,
          sede: r.sede ?? null,
          address: r.address ?? null,
          caes: r.caes ?? null,
          fundae: r.fundae ?? null,
          hotel_pernocta: r.hotel_pernocta ?? null,
          pipeline_id: r.pipeline_id ? Number(r.pipeline_id) : null,
          updated_at: r.updated_at,
        })),
        page,
        limit,
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("GET /deals error:", message);
    return c.json({ error: "DB_ERROR", message }, 500);
  }
});

// ───────────────────────────────── Helpers UPSERT (parametrizado)
const upsertOrganization = async (
  dbi: ReturnType<typeof requireDb>,
  org: Record<string, unknown>
): Promise<number> => {
  const pipedriveId = toOptionalNumber(org.id);
  const name = toOptionalString(org.name) ?? "Sin nombre";
  const cif = toOptionalString(
    (org as any)["6d39d015a33921753410c1bab0b067ca93b8cf2c"] // CIF
  );
  const phone = toOptionalString(
    (org as any)["b4379db06dfbe0758d84c2c2dd45ef04fa093b6d"] // Teléfono Org
  );
  const address = toOptionalString(org.address);

  const res = await dbi.execute(sql`
    insert into organizations (pipedrive_id, name, cif, phone, address, created_at, updated_at)
    values (${pipedriveId}, ${name}, ${cif}, ${phone}, ${address}, now(), now())
    on conflict (pipedrive_id) do update
      set name = excluded.name,
          cif = excluded.cif,
          phone = excluded.phone,
          address = excluded.address,
          updated_at = now()
    returning id
  `);
  return Number((res.rows as any[])[0].id);
};

const upsertPerson = async (
  dbi: ReturnType<typeof requireDb>,
  person: Record<string, unknown>,
  orgId: number | null
): Promise<number> => {
  const pipedriveId = toOptionalNumber(person.id);
  const firstName = toOptionalString(person.first_name);
  const lastName = toOptionalString(person.last_name);

  // email / phone pueden venir como string o array de objetos { value, primary }
  const pickPrimary = (v: unknown): string | null => {
    if (typeof v === "string") return toOptionalString(v);
    const arr = normaliseArray(v);
    const primary = (arr.find((x: any) => x?.primary === true) ??
      arr[0]) as Record<string, unknown> | undefined;
    return primary ? toOptionalString(primary.value) : null;
  };

  const email = pickPrimary((person as any).email);
  const phone = pickPrimary((person as any).phone);

  const res = await dbi.execute(sql`
    insert into persons (pipedrive_id, org_id, first_name, last_name, email, phone, created_at, updated_at)
    values (${pipedriveId}, ${orgId}, ${firstName}, ${lastName}, ${email}, ${phone}, now(), now())
    on conflict (pipedrive_id) do update
      set org_id = excluded.org_id,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          email = excluded.email,
          phone = excluded.phone,
          updated_at = now()
    returning id
  `);
  return Number((res.rows as any[])[0].id);
};

const upsertDeal = async (
  dbi: ReturnType<typeof requireDb>,
  deal: Record<string, unknown>,
  orgId: number | null,
  personId: number | null,
  products: any[]
): Promise<number> => {
  const pipedriveId = toOptionalNumber(deal.id);
  const pipelineId = toOptionalNumber(deal.pipeline_id);
  const hours = toOptionalNumber((deal as any)["38f11c8876ecde803a027fbf3c9041fda2ae7eb7"]); // hours
  const deal_direction = toOptionalString((deal as any)["8b2a7570f5ba8aa4754f061cd9dc92fd778376a7"]); // dirección formación
  const site = toOptionalString((deal as any)["676d6bd51e52999c582c01f67c99a35ed30bf6ae"]); // sede
  const caes = toBool((deal as any)["e1971bf3a21d48737b682bf8d864ddc5eb15a351"]); // CAES
  const fundae = toBool((deal as any)["245d60d4d18aec40ba888998ef92e5d00e494583"]); // FUNDAE
  const hotel_night = toBool((deal as any)["c3a6daf8eb5b4e59c3c07cda8e01f43439101269"]); // Hotel y pernocta
  const status = toOptionalString((deal as any).status) ?? toOptionalString((deal as any).stage_id)?.toString() ?? null;

  // separar training vs extra por product.code contiene "form-"
  const prodNames = (products ?? []).map((p: any) => ({
    code: toOptionalString(p?.product?.code) ?? toOptionalString(p?.code) ?? "",
    name: toOptionalString(p?.product?.name) ?? toOptionalString(p?.name) ?? "",
    qty: toOptionalNumber(p?.quantity) ?? 0,
  }));

  const trainings = prodNames.filter(p => p.code && p.code.includes("form-")).map(p => p.name).filter(Boolean);
  const extras = prodNames.filter(p => !p.code || !p.code.includes("form-")).map(p => p.name).filter(Boolean);

  const training = trainings.join(", ");
  const prod_extra = extras.join(", ");

  const res = await dbi.execute(sql`
    insert into deals (pipedrive_id, org_id, person_id, pipeline_id, training, prod_extra, hours, deal_direction, site, caes, fundae, hotel_night, status, created_at, updated_at)
    values (${pipedriveId}, ${orgId}, ${personId}, ${pipelineId}, ${training}, ${prod_extra}, ${hours}, ${deal_direction}, ${site}, ${caes}, ${fundae}, ${hotel_night}, ${status}, now(), now())
    on conflict (pipedrive_id) do update
      set org_id = excluded.org_id,
          person_id = excluded.person_id,
          pipeline_id = excluded.pipeline_id,
          training = excluded.training,
          prod_extra = excluded.prod_extra,
          hours = excluded.hours,
          deal_direction = excluded.deal_direction,
          site = excluded.site,
          caes = excluded.caes,
          fundae = excluded.fundae,
          hotel_night = excluded.hotel_night,
          status = excluded.status,
          updated_at = now()
    returning id
  `);

  return Number((res.rows as any[])[0].id);
};

// ───────────────────────────────── POST /deals/sync (trae PD y PERSISTE)
app.post("/deals/sync", async (c) => {
  try {
    const db = requireDb();

    const payload = await c.req.json<{ dealId: number }>().catch(() => ({} as any));
    const dealId = Number(payload?.dealId);
    if (!Number.isFinite(dealId) || dealId <= 0) {
      return c.json({ ok: false, error: "BAD_REQUEST", message: "Missing dealId" }, 400);
    }

    const baseUrl =
      process.env.PIPEDRIVE_API_URL ??
      process.env.PIPEDRIVE_API_BASE ??
      process.env.PIPEDRIVE_BASE_URL ??
      "https://api.pipedrive.com/v1";
    const token = process.env.PIPEDRIVE_API_TOKEN;
    if (!token) return c.json({ ok: false, error: "NO_TOKEN" }, 500);

    const q = (path: string) =>
      `${baseUrl}${path}${path.includes("?") ? "&" : "?"}api_token=${token}`;

    // deal
    const dealRes = await fetch(q(`/deals/${dealId}`));
    if (!dealRes.ok) throw new Error(`Pipedrive /deals/${dealId} ${dealRes.status}`);
    const deal = (await dealRes.json())?.data ?? {};

    // org
    const org =
      deal?.org_id?.value
        ? (await (await fetch(q(`/organizations/${deal.org_id.value}`))).json()).data
        : null;

    // person
    const person =
      deal?.person_id?.value
        ? (await (await fetch(q(`/persons/${deal.person_id.value}`))).json()).data
        : null;

    // products
    const prodsRes = await fetch(q(`/deals/${dealId}/products`));
    const prodsJson = await prodsRes.json().catch(() => ({}));
    const products = Array.isArray(prodsJson?.data) ? prodsJson.data : [];

    // UPSERTs
    const orgId = org ? await upsertOrganization(db, org) : null;
    const personId = person ? await upsertPerson(db, person, orgId) : null;
    const localDealId = await upsertDeal(db, deal, orgId, personId, products);

    return c.json({ ok: true, dealId: localDealId }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /deals/sync FAIL:", message);
    return c.json({ ok: false, error: "SYNC_FAIL", message }, 500);
  }
});

// ───────────────────────────────── ÚNICO handler de Netlify
export const handler: Handler = async (event) => {
  try {
    const scheme =
      (event.headers["x-forwarded-proto"] as string) ||
      (event.headers["X-Forwarded-Proto"] as string) ||
      "https";
    const host =
      (event.headers["x-forwarded-host"] as string) ||
      (event.headers["X-Forwarded-Host"] as string) ||
      (event.headers.host as string) ||
      "localhost";
    const path = event.path || "/.netlify/functions/api";
    const query = event.rawQuery
      ? `?${event.rawQuery}`
      : event.queryStringParameters
      ? `?${new URLSearchParams(event.queryStringParameters as Record<string, string>).toString()}`
      : "";

    const url = `${scheme}://${host}${path}${query}`;

    const req = new Request(url, {
      method: event.httpMethod,
      headers: event.headers as any,
      body:
        event.body && !["GET", "HEAD"].includes(event.httpMethod)
          ? event.isBase64Encoded
            ? Buffer.from(event.body, "base64")
            : event.body
          : undefined,
    });

    const res = await app.fetch(req);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    const body = await res.text();
    return { statusCode: res.status, headers, body };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("DEALS API ERROR:", message);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "INTERNAL", message }),
    };
  }
};
