import type { Handler } from "@netlify/functions";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono().basePath("/.netlify/functions/api");
app.use("*", cors());

// Health
app.get("/health", (c) => c.json({ ok: true, at: new Date().toISOString() }));

// Placeholder (sin BD para comprobar despliegue)
app.get("/deals", (c) => c.json({ data: [], page: 1, limit: 50 }));

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
