// netlify/functions/api.ts
import { Hono } from 'hono';
import { handle } from 'hono/netlify';

// ✔️ Mapa de campos centralizado (sin legacy 'site' ni 'hotel_night')
import { PIPEDRIVE_FIELDS } from '../../src/shared/pipedriveFields';

// --- Config ---
const PIPEDRIVE_BASE_URL = process.env.PIPEDRIVE_BASE_URL?.trim() || 'https://api.pipedrive.com/v1';
const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN || process.env.PIPEDRIVE_TOKEN || '';

if (!PIPEDRIVE_API_TOKEN) {
  // Aviso temprano en logs; la función seguirá respondiendo con 500 si se llama a endpoints que lo requieran
  console.warn('[api] Missing PIPEDRIVE_API_TOKEN env var');
}

const app = new Hono();

// Util: construir URL a Pipedrive con token
const pd = (path: string, searchParams?: Record<string, string | number | boolean | undefined>) => {
  const url = new URL(path.startsWith('http') ? path : `${PIPEDRIVE_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`);
  url.searchParams.set('api_token', PIPEDRIVE_API_TOKEN);
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
};

// Util: fetch JSON con manejo básico de errores
async function fetchJSON<T = any>(input: string | Request, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} - ${res.statusText} :: ${text}`);
  }
  return (await res.json()) as T;
}

// Util: mapea campos custom de un deal usando PIPEDRIVE_FIELDS
function mapDealCustomFields(anyDeal: Record<string, any>) {
  const f = PIPEDRIVE_FIELDS;
  return {
    sede: anyDeal[f.sede],
    caes: anyDeal[f.caes],
    fundae: anyDeal[f.fundae],
    hotel_pernocta: anyDeal[f.hotel_pernocta], // ✅ usar hotel_pernocta, NO 'hotel_night'
    deal_direction: anyDeal[f.deal_direction],
    horas: anyDeal[f.horas],
  };
}

// Util: separa productos de formación vs. extras
function splitTrainingVsExtras(products: any[]) {
  const isTraining = (p: any) => {
    // Pipedrive product on deal suele llegar como item con 'code' en p.product?.code o p.code según endpoint
    const code: string | undefined = p?.product?.code ?? p?.code ?? '';
    return typeof code === 'string' && code.toLowerCase().startsWith('form-');
  };
  const training = products.filter(isTraining);
  const extras = products.filter((p: any) => !isTraining(p));
  return { training, extras };
}

// ====================================================================================
// #region /deals
// GET /deals?pipelineId=3&limit=...&start=...&status=open|won|lost|all_not_deleted
// - Aplica pipeline_id=3 por defecto (sobrescribible con ?pipelineId=)
// - Filtra productos de formación por code.startsWith("form-")
// ====================================================================================

app.get('/deals', async (c) => {
  try {
    if (!PIPEDRIVE_API_TOKEN) {
      return c.json({ error: 'PIPEDRIVE_API_TOKEN is not configured' }, 500);
    }

    const query = c.req.query();
    const pipelineIdRaw = query.pipelineId ?? query.pipeline_id; // permitir ambas por compatibilidad
    const pipeline_id = pipelineIdRaw !== undefined && pipelineIdRaw !== null ? Number(pipelineIdRaw) : 3; // ✅ default 3
    const status = (query.status as string) || 'all_not_deleted';
    const limit = Number(query.limit ?? 50);
    const start = Number(query.start ?? 0);
    const sort = (query.sort as string) || 'update_time DESC';

    // 1) Traer deals con filtro de pipeline
    const dealsRes = await fetchJSON<{
      success: boolean;
      data: any[];
      additional_data?: { pagination?: { more_items_in_collection: boolean; start: number; limit: number; next_start?: number } };
    }>(
      pd('/deals', {
        pipeline_id,
        status,
        limit,
        start,
        sort,
      })
    );

    const rawDeals = Array.isArray(dealsRes.data) ? dealsRes.data : [];

    // 2) Para cada deal, traer productos y separarlos (formación vs extras)
    const deals = await Promise.all(
      rawDeals.map(async (deal) => {
        // Productos del deal
        const productsRes = await fetchJSON<{ success: boolean; data: any[] }>(
          pd(`/deals/${deal.id}/products`, { limit: 500 })
        );
        const products = Array.isArray(productsRes.data) ? productsRes.data : [];
        const { training, extras } = splitTrainingVsExtras(products);

        // Mapeo de campos custom (sin legacy 'site' ni 'hotel_night')
        const mapped = mapDealCustomFields(deal);

        return {
          id: deal.id,
          title: deal.title,
          org_id: deal.org_id?.value ?? deal.org_id, // Pipedrive alterna según expansión
          person_id: deal.person_id?.value ?? deal.person_id,
          pipeline_id: deal.pipeline_id,
          status: deal.status,
          value: deal.value,
          currency: deal.currency,
          expected_close_date: deal.expected_close_date,
          update_time: deal.update_time,
          add_time: deal.add_time,

          // Campos custom normalizados
          ...mapped,

          // Productos
          training_products: training,
          extra_products: extras,
        };
      })
    );

    return c.json({
      ok: true,
      pipeline_id,
      count: deals.length,
      deals,
      page: {
        start,
        limit,
        more: dealsRes.additional_data?.pagination?.more_items_in_collection ?? false,
        next_start: dealsRes.additional_data?.pagination?.next_start,
      },
    });
  } catch (err: any) {
    console.error('[GET /deals] error:', err);
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

// #endregion /deals

// ====================================================================================
// #region /notes
// - GET /notes?dealId=123      -> lista notas de un deal
// - POST /notes { dealId, content } -> crea nota en el deal
// ====================================================================================

app.get('/notes', async (c) => {
  try {
    if (!PIPEDRIVE_API_TOKEN) {
      return c.json({ error: 'PIPEDRIVE_API_TOKEN is not configured' }, 500);
    }
    const dealId = Number(c.req.query('dealId'));
    if (!dealId) return c.json({ ok: false, error: 'dealId is required' }, 400);

    const res = await fetchJSON<{ success: boolean; data: any[] }>(pd('/notes', { deal_id: dealId, limit: 500 }));
    return c.json({ ok: true, notes: res.data ?? [] });
  } catch (err: any) {
    console.error('[GET /notes] error:', err);
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

app.post('/notes', async (c) => {
  try {
    if (!PIPEDRIVE_API_TOKEN) {
      return c.json({ error: 'PIPEDRIVE_API_TOKEN is not configured' }, 500);
    }
    const body = await c.req.json<{ dealId?: number; content?: string }>();
    const dealId = Number(body.dealId);
    const content = (body.content || '').trim();
    if (!dealId || !content) return c.json({ ok: false, error: 'dealId and content are required' }, 400);

    const res = await fetchJSON<{ success: boolean; data: any }>(pd('/notes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId, content }),
    });

    return c.json({ ok: true, note: res.data });
  } catch (err: any) {
    console.error('[POST /notes] error:', err);
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

// #endregion /notes

// ====================================================================================
// #region /calendar/events
// Mantiene la ruta. Aquí se deja lista para conectar con tu BBDD (Drizzle + Postgres/Neon)
// Ejemplo minimal: GET /calendar/events?dealId=123&from=2025-09-01&to=2025-09-30
// ====================================================================================

app.get('/calendar/events', async (c) => {
  try {
    // Placeholder: devuelve estructura lista para integración con tu tabla Sessions
    // Integra aquí tu consulta real (Drizzle) filtrando por dealId/fechas si procede.
    const dealId = c.req.query('dealId') ? Number(c.req.query('dealId')) : undefined;
    const from = c.req.query('from') || undefined;
    const to = c.req.query('to') || undefined;

    // TODO: sustituir por SELECT real a la tabla de sesiones/eventos:
    // const events = await db.select().from(Sessions)...
    const events: Array<{
      id: string | number;
      deal_id?: number;
      title: string;
      start: string; // ISO
      end: string; // ISO
      sede?: string;
      address?: string;
      trainer_ids?: number[];
      unidad_movil_ids?: number[];
      notes?: string;
    }> = [];

    return c.json({ ok: true, filters: { dealId, from, to }, events });
  } catch (err: any) {
    console.error('[GET /calendar/events] error:', err);
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

// #endregion /calendar/events

export const handler = handle(app);
