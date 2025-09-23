import type { Handler } from "@netlify/functions";
export const handler: Handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ok: true, at: new Date().toISOString() }),
});
