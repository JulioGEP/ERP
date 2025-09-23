import type { Handler } from "@netlify/functions";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono().basePath("/.netlify/functions/api"); // 👈 clave
app.use("*", cors());

// Health
app.get("/health", (c) => c.json({ ok: true, at: new Date().toISOString() }));

// Ejemplo simple sin BD
app.get("/deals", (c) => c.json({ data: [], page: 1, limit: 50 }));

// Handler manual (sin adapter)
export const handler: Handler = async (event) => {
  // Reconstruimos la URL conservando el prefix de Netlify Functions
  const host =
    event.headers["x-forwarded-host"] ||
    event.headers["host"] ||
    "localhost";
  const scheme = event.headers["x-forwarded-proto"] || "http";

  // event.path llega como "/.netlify/functions/api/health" etc.
  const path = event.path || "/.netlify/functions/api";
  const query =
    event.rawQuery
      ? `?${event.rawQuery}`
      : event.queryStringParameters
      ? `?${new URLSearchParams(
          event.queryStringParameters as Record<string, string>
        ).toString()}`
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
};
