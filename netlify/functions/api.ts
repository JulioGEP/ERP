import type { Handler } from "@netlify/functions";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getDealById } from "../../adapters/pipedrive";

type DealNote = {
  id: string;
  content: string;
  createdAt: string | null;
  authorName: string | null;
  source: "deal" | "product" | "local";
  productId: number | null;
  dealProductId: number | null;
};

type DealAttachment = {
  id: string;
  name: string;
  url: string;
  downloadUrl: string | null;
  fileType: string | null;
  addedAt: string | null;
  addedBy: string | null;
  source: "deal" | "product" | "local";
  productId: number | null;
  dealProductId: number | null;
};

type DealProduct = {
  dealProductId: number;
  productId: number | null;
  name: string;
  code: string | null;
  quantity: number;
  itemPrice: number | null;
  recommendedHours: number | null;
  recommendedHoursRaw: string | null;
  notes: DealNote[];
  attachments: DealAttachment[];
  isTraining: boolean;
};

type DealRecord = {
  id: number;
  title: string;
  clientId: number | null;
  clientName: string | null;
  sede: string | null;
  address: string | null;
  caes: string | null;
  fundae: string | null;
  hotelPernocta: string | null;
  pipelineId: number | null;
  pipelineName: string | null;
  wonDate: string | null;
  formations: string[];
  trainingProducts: DealProduct[];
  extraProducts: DealProduct[];
  notes: DealNote[];
  attachments: DealAttachment[];
};

type RelatedEntity = {
  id: number | null;
  name: string | null;
  address: string | null;
};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toStringWithFallback = (value: unknown, fallback: string): string =>
  toOptionalString(value) ?? fallback;

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normaliseRelatedEntity = (value: unknown): RelatedEntity => {
  if (value === null || value === undefined) {
    return { id: null, name: null, address: null };
  }

  if (typeof value === "number") {
    return { id: Number.isFinite(value) ? value : null, name: null, address: null };
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return { id: parsed, name: null, address: null };
    }

    return { id: null, name: toOptionalString(value), address: null };
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const id = toOptionalNumber(record.value ?? record.id);
    const name = toOptionalString(record.name);
    const address = toOptionalString(record.address);
    return { id, name, address };
  }

  return { id: null, name: null, address: null };
};

const readNestedString = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return toOptionalString(record[key]);
};

const mapPipedriveDealToRecord = (deal: Record<string, unknown>): DealRecord => {
  const dealId = toOptionalNumber(deal["id"]);

  if (dealId === null) {
    throw new Error("Pipedrive devolvió un deal sin identificador numérico");
  }

  const org = normaliseRelatedEntity(deal["org_id"]);
  const person = normaliseRelatedEntity(deal["person_id"]);

  const pipelineName =
    toOptionalString(deal["pipeline_name"]) ?? readNestedString(deal["pipeline"], "name");

  const address =
    toOptionalString(deal["org_address"]) ??
    readNestedString(deal["org_id"], "address") ??
    toOptionalString(deal["address"]);

  const clientName =
    toOptionalString(deal["org_name"]) ??
    org.name ??
    toOptionalString(deal["person_name"]) ??
    person.name;

  const wonDate =
    toOptionalString(deal["won_time"]) ??
    toOptionalString(deal["won_date"]) ??
    toOptionalString(deal["wonTime"]);

  const sede = toOptionalString(deal["sede"]);
  const caes = toOptionalString(deal["caes"]);
  const fundae = toOptionalString(deal["fundae"]);
  const hotelPernocta =
    toOptionalString(deal["hotelPernocta"]) ?? toOptionalString(deal["hotel_pernocta"]);

  return {
    id: dealId,
    title: toStringWithFallback(deal["title"], `Presupuesto #${dealId}`),
    clientId: org.id ?? person.id ?? null,
    clientName: clientName ?? null,
    sede: sede ?? null,
    address: address ?? null,
    caes: caes ?? null,
    fundae: fundae ?? null,
    hotelPernocta: hotelPernocta ?? null,
    pipelineId: toOptionalNumber(deal["pipeline_id"]),
    pipelineName: pipelineName ?? null,
    wonDate,
    formations: [],
    trainingProducts: [],
    extraProducts: [],
    notes: [],
    attachments: []
  };
};

const app = new Hono().basePath("/.netlify/functions/api");
app.use("*", cors());

const sampleDeals: DealRecord[] = [];

// Health
app.get("/health", (c) => c.json({ ok: true, at: new Date().toISOString() }));

// Listado y detalle básico de deals (sin BD, datos de ejemplo)
app.get("/deals", async (c) => {
  const url = new URL(c.req.url);
  const dealIdParam = url.searchParams.get("dealId");

  if (dealIdParam) {
    const dealId = Number.parseInt(dealIdParam, 10);

    if (!Number.isFinite(dealId)) {
      return c.json({ deal: null, message: "El identificador de presupuesto no es válido." }, 400);
    }

    try {
      const rawDeal = await getDealById(dealId);

      if (!rawDeal) {
        return c.json(
          { deal: null, message: "No se encontró el presupuesto solicitado." },
          404
        );
      }

      if (typeof rawDeal !== "object" || rawDeal === null) {
        throw new Error("Respuesta inesperada de Pipedrive al obtener un presupuesto");
      }

      const deal = mapPipedriveDealToRecord(rawDeal as Record<string, unknown>);
      return c.json({ deal });
    } catch (error) {
      console.error(`Error al consultar el deal ${dealId} en Pipedrive`, error);
      return c.json(
        { deal: null, message: "No se pudo obtener el presupuesto desde Pipedrive." },
        502
      );
    }
  }

  return c.json({ deals: sampleDeals, page: 1, limit: sampleDeals.length });
});

// Handler manual (evita el adapter y problemas de path)
export const handler: Handler = async (event) => {
  const host = event.headers["x-forwarded-host"] || event.headers["host"] || "localhost";
  const scheme = event.headers["x-forwarded-proto"] || "http";
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
        : undefined
  });

  const res = await app.fetch(req);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  const body = await res.text();
  return { statusCode: res.status, headers, body };
};
