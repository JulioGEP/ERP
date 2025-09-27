import { Hono } from 'hono'
import { PIPEDRIVE_FIELDS } from '../../src/shared/pipedriveFields'

const PIPEDRIVE_BASE = process.env.PIPEDRIVE_API_BASE?.replace(/\/+$/, '') || 'https://api.pipedrive.com/v1'
const PIPEDRIVE_TOKEN = process.env.PIPEDRIVE_API_TOKEN

if (!PIPEDRIVE_TOKEN) {
  console.warn('[deals] Missing PIPEDRIVE_API_TOKEN')
}

type PDDeal = {
  id: number
  title: string
  value?: number
  pipeline_id?: number
  org_id?: number | null
  person_id?: number | null
  add_time?: string
  update_time?: string
  [k: string]: any // campos custom
}

type PDProductAttachment = {
  item_price?: number
  quantity?: number
  product?: { code?: string; name?: string }
}

const app = new Hono()

function normalizeDeal(d: PDDeal) {
  return {
    ...d,
    sede: d[PIPEDRIVE_FIELDS.SEDE] ?? null,
    hotel_pernocta: d[PIPEDRIVE_FIELDS.HOTEL_PERNOCTA] ?? null,
    caes: d[PIPEDRIVE_FIELDS.CAES] ?? null,
    fundae: d[PIPEDRIVE_FIELDS.FUNDAE] ?? null,
    deal_direction: d.deal_direction ?? null,
  }
}

async function pd<T>(path: string, qs: Record<string, any> = {}) {
  const usp = new URLSearchParams({ api_token: PIPEDRIVE_TOKEN!, ...qs } as any)
  const url = `${PIPEDRIVE_BASE}${path}?${usp.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pipedrive ${path} -> ${res.status}`)
  const json = await res.json()
  return json.data as T
}

async function getDealProducts(dealId: number) {
  const items = await pd<PDProductAttachment[]>(`/deals/${dealId}/products`)
  const mapped = (items ?? []).map((i) => ({
    code: i?.product?.code ?? '',
    name: i?.product?.name ?? '',
    quantity: i?.quantity ?? 1,
  }))
  const form = mapped.filter((p) => p.code?.startsWith('form-'))
  const extras = mapped.filter((p) => !p.code?.startsWith('form-'))
  return { form, extras, all: mapped }
}

// GET /api/deals
app.get('/', async (c) => {
  try {
    const pipelineId = Number(c.req.query('pipelineId') ?? 3)
    const term = c.req.query('q')?.trim()

    let deals: PDDeal[] = []
    if (term) {
      const result = await pd<any>(`/deals/search`, { term, fields: 'title', exact_match: 0, limit: 50 })
      const items: PDDeal[] = (result?.items ?? []).map((it: any) => it.item)
      deals = items
    } else {
      const page1 = await pd<PDDeal[]>(`/deals`, { pipeline_id: pipelineId, limit: 50 })
      deals = page1 ?? []
    }

    const enriched = await Promise.all(
      (deals ?? [])
        .filter((d) => (d.pipeline_id ?? pipelineId) === pipelineId)
        .map(async (d) => {
          const norm = normalizeDeal(d)
          const products = await getDealProducts(d.id)
          return {
            ...norm,
            products: products.all,
          }
        })
    )

    const onlyWithForm = enriched.filter((d) => (d.products ?? []).some((p) => p.code?.startsWith('form-')))

    return c.json(onlyWithForm)
  } catch (err: any) {
    console.error('[GET /api/deals] error', err)
    return c.json({ error: err.message }, 500)
  }
})

// GET /api/deals/:id
app.get('/:id{[0-9]+}', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const d = await pd<PDDeal>(`/deals/${id}`)
    const norm = normalizeDeal(d)
    const products = await getDealProducts(id)

    return c.json({
      ...norm,
      products: products.all,
      products_form: products.form,
      products_extras: products.extras,
    })
  } catch (err: any) {
    console.error('[GET /api/deals/:id] error', err)
    return c.json({ error: err.message }, 500)
  }
})

// DELETE /api/deals/:id
app.delete('/:id{[0-9]+}', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    return c.json({ ok: true, id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST /api/deals/:id/sync
app.post('/:id{[0-9]+}/sync', async (c) => {
  const id = Number(c.req.param('id'))
  return c.json({ ok: true, id })
})

export default app
