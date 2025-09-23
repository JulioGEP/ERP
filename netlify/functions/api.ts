import type { Handler } from "@netlify/functions";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono().basePath("/.netlify/functions/api");
app.use("*", cors());

const sampleDeals = [
  {
    id: 101,
    title: "Formación PRL en Altura",
    clientId: 501,
    clientName: "Aceros Ibéricos S.A.",
    sede: "GEP Arganda",
    address: "C/ Industrial 12, Arganda del Rey",
    caes: "si",
    fundae: "no",
    hotelPernocta: null,
    pipelineId: 3,
    pipelineName: "Implementación",
    wonDate: "2024-08-05",
    formations: ["Trabajo en altura"],
    trainingProducts: [
      {
        dealProductId: 5001,
        productId: 120,
        name: "Formación PRL en Altura",
        code: "PRL-ALT",
        quantity: 1,
        itemPrice: 1300,
        recommendedHours: 8,
        recommendedHoursRaw: "8h",
        notes: [],
        attachments: [],
        isTraining: true
      }
    ],
    extraProducts: [
      {
        dealProductId: 5002,
        productId: null,
        name: "Material de práctica",
        code: null,
        quantity: 1,
        itemPrice: 150,
        recommendedHours: null,
        recommendedHoursRaw: null,
        notes: [],
        attachments: [],
        isTraining: false
      }
    ],
    notes: [],
    attachments: []
  },
  {
    id: 102,
    title: "Plan Anual Brigadas Contra Incendios",
    clientId: 502,
    clientName: "Logística Mediterránea",
    sede: "In Company",
    address: "Polígono Sur, Nave 7, Valencia",
    caes: "si",
    fundae: "si",
    hotelPernocta: "no",
    pipelineId: 5,
    pipelineName: "Seguimiento",
    wonDate: "2024-07-22",
    formations: ["Extinción de incendios", "Primer interviniente"],
    trainingProducts: [
      {
        dealProductId: 5101,
        productId: 210,
        name: "Entrenamiento brigadas industriales",
        code: "BRIG-ANUAL",
        quantity: 2,
        itemPrice: 980,
        recommendedHours: 6,
        recommendedHoursRaw: "6h",
        notes: [],
        attachments: [],
        isTraining: true
      }
    ],
    extraProducts: [
      {
        dealProductId: 5102,
        productId: null,
        name: "Informe de evaluación",
        code: null,
        quantity: 1,
        itemPrice: 250,
        recommendedHours: null,
        recommendedHoursRaw: null,
        notes: [],
        attachments: [],
        isTraining: false
      }
    ],
    notes: [],
    attachments: []
  }
];

// Health
app.get("/health", (c) => c.json({ ok: true, at: new Date().toISOString() }));

// Listado y detalle básico de deals (sin BD, datos de ejemplo)
app.get("/deals", (c) => {
  const url = new URL(c.req.url);
  const dealIdParam = url.searchParams.get("dealId");

  if (dealIdParam) {
    const dealId = Number.parseInt(dealIdParam, 10);

    if (!Number.isFinite(dealId)) {
      return c.json({ deal: null, message: "El identificador de presupuesto no es válido." }, 400);
    }

    const deal = sampleDeals.find((item) => item.id === dealId) ?? null;

    if (!deal) {
      return c.json(
        { deal: null, message: "No se encontró el presupuesto solicitado." },
        404
      );
    }

    return c.json({ deal });
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
    ? `?${new URLSearchParams(event.queryStringParameters as Record<string,string>).toString()}`
    : "";
  const url = `${scheme}://${host}${path}${query}`;

  const req = new Request(url, {
    method: event.httpMethod,
    headers: event.headers as any,
    body: event.body && !["GET","HEAD"].includes(event.httpMethod)
      ? (event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body)
      : undefined,
  });

  const res = await app.fetch(req);
  const headers: Record<string,string> = {};
  res.headers.forEach((v,k) => (headers[k] = v));
  const body = await res.text();
  return { statusCode: res.status, headers, body };
};
