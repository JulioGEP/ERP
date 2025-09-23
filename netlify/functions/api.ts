import type { Handler } from "@netlify/functions";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("*", cors());

// Health
app.get("/health", (c) => c.json({ ok: true, at: new Date().toISOString() }));

// Ejemplo GET /deals (sin BD aún)
app.get("/deals", (c) => c.json({ data: [], page: 1, limit: 50 }));

// Handler manual (evita el bug del adapter en Dev)
export const handler: Handler = async (event) => {
  const base = "http://localhost";
  const suffix = event.path?.replace(/^\/\.netlify\/functions\/api/, "") || "";
  const query = event.rawQuery
    ? `?${event.rawQuery}`
    : event.queryStringParameters
    ? `?${new URLSearchParams(event.queryStringParameters as any).toString()}`
    : "";
  const url = `${base}/.netlify/functions/api${suffix}${query}`;

  const req = new Request(url, {
    method: event.httpMethod,
    headers: event.headers as any,
    body:
      event.body && event.httpMethod !== "GET" && event.httpMethod !== "HEAD"
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
};
