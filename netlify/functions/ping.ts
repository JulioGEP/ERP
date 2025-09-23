mkdir -p netlify/functions
cat > netlify/functions/ping.ts <<'TS'
import type { Handler } from "@netlify/functions";
export const handler: Handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ok: true, at: new Date().toISOString() }),
});
TS
