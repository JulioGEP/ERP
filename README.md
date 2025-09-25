# GEP App Starter (Netlify + Hono + Drizzle + Neon)

Arquitectura mínima para que puedas seguir trabajando con Codex sin depender de nadie.

## Requisitos
- Node 18+
- Cuenta Netlify + Netlify CLI (`npm i -g netlify-cli`)
- Base de datos Postgres (Neon recomendado)

## Pasos rápidos
1. Copia `.env.example` a `.env` y rellena `DATABASE_URL`, `PIPEDRIVE_API_TOKEN`, etc.
2. Instala deps: `npm i`
3. Arranca funciones en local:
   - `netlify dev`
   - Endpoints: `http://localhost:8888/.netlify/functions/api/deals`
4. Deploy en Netlify:
   - `netlify deploy` (o `netlify init` primero)

## Endpoints v1
- `GET /.netlify/functions/api/deals?page=1`
- `POST /.netlify/functions/api/deals` `{ "title": "Curso Extinción X" }`
- `GET /.netlify/functions/api/calendar/events?from=2025-09-01T00:00:00.000Z&to=2025-09-30T23:59:59.999Z`
- `POST /.netlify/functions/api/notes`

## Sincronización Pipedrive (demo)
- Función programada `syncDeals` cada 30 minutos (ver `netlify.toml`).
- Implementa el upsert real por `pipedriveId` según tus campos.

## Estructura clave
- `db/schema.ts` — Tipos de tablas utilizados por Drizzle
- `netlify/functions/api.ts` — Endpoints (Hono)
- `adapters/pipedrive.ts` — Llamadas a Pipedrive
- `openapi.yaml` — Contrato de API

## Flujo sugerido (Codex-first)
1. Ajusta `openapi.yaml`
2. Añade/ajusta handlers en `netlify/functions/api.ts`
3. Prueba con Netlify Dev y React Query

---

**Tip**: mantén los nombres simples y consistentes para que Codex te genere código que encaje a la primera.
