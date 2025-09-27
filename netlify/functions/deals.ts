import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { desc, eq, inArray } from 'drizzle-orm'
import { PIPEDRIVE_FIELDS } from '../../src/shared/pipedriveFields'
import * as schema from '../../db/schema'

type DealRow = typeof schema.deals.$inferSelect
type ProductRow = typeof schema.products.$inferSelect
type OrganizationRow = typeof schema.organizations.$inferSelect
type PersonRow = typeof schema.persons.$inferSelect

const PIPEDRIVE_BASE = process.env.PIPEDRIVE_API_BASE?.replace(/\/+$/, '') || 'https://api.pipedrive.com/v1'
const PIPEDRIVE_TOKEN = process.env.PIPEDRIVE_API_TOKEN

if (!PIPEDRIVE_TOKEN) {
  console.warn('[deals] Missing PIPEDRIVE_API_TOKEN')
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.warn('[deals] Missing DATABASE_URL')
}

const sql = DATABASE_URL ? neon(DATABASE_URL) : undefined
const db = sql ? drizzle(sql, { schema }) : undefined

type PDDeal = {
  id: number
  title: string
  value?: number
  pipeline_id?: number
  org_id?: number | null
  person_id?: number | null
  add_time?: string
  update_time?: string
  org_name?: string | null
  person_name?: string | null
  [k: string]: any // campos custom
}

type PDProductAttachment = {
  id?: number
  item_price?: number
  quantity?: number
  product?: { code?: string; name?: string }
}

type PDOrganization = {
  id: number
  name?: string | null
  address?: string | null
}

type PDPerson = {
  id: number
  name?: string | null
  email?: string | null
  phone?: string | null
  org_id?: number | null
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

async function getOrganization(organizationId: number) {
  if (!organizationId) return null
  try {
    return await pd<PDOrganization>(`/organizations/${organizationId}`)
  } catch (error) {
    console.error('[deals] No se pudo cargar la organización', organizationId, error)
    return null
  }
}

async function getPerson(personId: number) {
  if (!personId) return null
  try {
    return await pd<PDPerson>(`/persons/${personId}`)
  } catch (error) {
    console.error('[deals] No se pudo cargar la persona', personId, error)
    return null
  }
}

const parseBooleanField = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null
    }

    return value === 1
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return null
    if (['1', 'true', 't', 'si', 'sí', 'yes'].includes(normalized)) return true
    if (['0', 'false', 'f', 'no'].includes(normalized)) return false
  }

  return null
}

const extractEntityId = (entity: unknown): number | null => {
  if (typeof entity === 'number') {
    return entity
  }

  if (entity && typeof entity === 'object') {
    const candidate = entity as { id?: unknown; value?: unknown }
    if (typeof candidate.id === 'number') {
      return candidate.id
    }

    if (typeof candidate.value === 'number') {
      return candidate.value
    }
  }

  return null
}

const buildStoredDeal = (
  deal: DealRow,
  { organization, person, products }: {
    organization?: OrganizationRow | null
    person?: PersonRow | null
    products?: ProductRow[]
  } = {}
) => ({
  id: deal.id,
  pipedriveId: deal.pipedriveId,
  title: deal.title,
  clientName: organization?.name ?? person?.name ?? null,
  products: (products ?? []).map((product) => ({
    code: product.code ?? '',
    name: product.name ?? '',
    quantity: product.quantity ?? 1,
  })),
})

app.get('/imported', async (c) => {
  try {
    if (!db) throw new Error('DB not initialized')

    const rows = await db
      .select({
        deal: schema.deals,
        organization: schema.organizations,
        person: schema.persons,
      })
      .from(schema.deals)
      .leftJoin(schema.organizations, eq(schema.deals.orgId, schema.organizations.id))
      .leftJoin(schema.persons, eq(schema.deals.personId, schema.persons.id))
      .orderBy(desc(schema.deals.updatedAt))

    const dealIds = rows.map((row) => row.deal.id)

    const products = dealIds.length
      ? await db
          .select()
          .from(schema.products)
          .where(inArray(schema.products.dealId, dealIds))
      : []

    const productMap = products.reduce<Record<number, ProductRow[]>>((acc, product) => {
      if (product.dealId == null) {
        return acc
      }

      const bucket = acc[product.dealId] ?? []
      bucket.push(product)
      acc[product.dealId] = bucket
      return acc
    }, {})

    const response = rows.map((row) =>
      buildStoredDeal(row.deal, {
        organization: row.organization,
        person: row.person,
        products: productMap[row.deal.id] ?? [],
      })
    )

    return c.json(response)
  } catch (err: any) {
    console.error('[GET /api/deals/imported] error', err)
    return c.json({ error: err.message }, 500)
  }
})

app.post('/import', async (c) => {
  try {
    if (!db) throw new Error('DB not initialized')

    const body = await c.req.json()
    const rawDealId = body?.dealId ?? body?.id ?? body?.pipedriveId
    const dealId = Number(rawDealId)

    if (!Number.isFinite(dealId) || dealId <= 0) {
      return c.json({ error: 'Debe indicar un número de presupuesto válido.' }, 400)
    }

    const deal = normalizeDeal(await pd<PDDeal>(`/deals/${dealId}`))
    const organizationId = extractEntityId(deal.org_id)
    const personId = extractEntityId(deal.person_id)

    const [organization, person, productAttachments] = await Promise.all([
      organizationId ? getOrganization(organizationId) : Promise.resolve(null),
      personId ? getPerson(personId) : Promise.resolve(null),
      getDealProducts(deal.id),
    ])

    const clientName = organization?.name ?? deal.org_name ?? person?.name ?? deal.person_name ?? null

    if (organizationId && (organization || clientName)) {
      const name = organization?.name ?? deal.org_name ?? clientName ?? ''

      await db
        .insert(schema.organizations)
        .values({
          id: organizationId,
          name,
          address: organization?.address ?? null,
        })
        .onConflictDoUpdate({
          target: schema.organizations.id,
          set: {
            name,
            address: organization?.address ?? null,
          },
        })
    }

    if (personId && (person || deal.person_name)) {
      const name = person?.name ?? deal.person_name ?? ''
      await db
        .insert(schema.persons)
        .values({
          id: personId,
          name,
          email: person?.email ?? null,
          phone: person?.phone ?? null,
          orgId: person?.org_id ?? organizationId ?? null,
        })
        .onConflictDoUpdate({
          target: schema.persons.id,
          set: {
            name,
            email: person?.email ?? null,
            phone: person?.phone ?? null,
            orgId: person?.org_id ?? organizationId ?? null,
          },
        })
    }

    const storedDealValues = {
      id: deal.id,
      pipedriveId: deal.id,
      title: deal.title ?? `Presupuesto ${deal.id}`,
      pipelineId: deal.pipeline_id ?? 0,
      status: deal.status ?? null,
      orgId: organizationId ?? null,
      personId: personId ?? null,
      sede: (deal as Record<string, unknown>)[PIPEDRIVE_FIELDS.SEDE] as string | null,
      dealDirection: typeof deal.deal_direction === 'string' ? deal.deal_direction : null,
      caes: parseBooleanField((deal as Record<string, unknown>)[PIPEDRIVE_FIELDS.CAES]),
      fundae: parseBooleanField((deal as Record<string, unknown>)[PIPEDRIVE_FIELDS.FUNDAE]),
      hotelPernocta: parseBooleanField((deal as Record<string, unknown>)[PIPEDRIVE_FIELDS.HOTEL_PERNOCTA]),
    }

    const [storedDeal] = await db
      .insert(schema.deals)
      .values(storedDealValues)
      .onConflictDoUpdate({
        target: schema.deals.id,
        set: storedDealValues,
      })
      .returning()

    await db.delete(schema.products).where(eq(schema.products.dealId, storedDeal.id))

    const allProducts = productAttachments.all ?? []
    if (allProducts.length > 0) {
      const productRows = allProducts
        .filter((item) => item.id != null)
        .map((item) => ({
          id: item.id!,
          dealId: storedDeal.id,
          code: item.product?.code ?? '',
          name: item.product?.name ?? '',
          price: item.item_price != null ? Number(item.item_price) : null,
          isTraining: item.product?.code?.startsWith('form-') ?? false,
          quantity: item.quantity != null ? Number(item.quantity) : null,
        }))

      if (productRows.length > 0) {
        for (const row of productRows) {
          await db
            .insert(schema.products)
            .values(row)
            .onConflictDoUpdate({
              target: schema.products.id,
              set: {
                dealId: row.dealId,
                code: row.code,
                name: row.name,
                price: row.price,
                isTraining: row.isTraining,
                quantity: row.quantity,
              },
            })
        }
      }
    }

    const [row] = await db
      .select({
        deal: schema.deals,
        organization: schema.organizations,
        person: schema.persons,
      })
      .from(schema.deals)
      .leftJoin(schema.organizations, eq(schema.deals.orgId, schema.organizations.id))
      .leftJoin(schema.persons, eq(schema.deals.personId, schema.persons.id))
      .where(eq(schema.deals.id, storedDeal.id))
      .limit(1)

    const latestProducts = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.dealId, storedDeal.id))

    if (!row) {
      throw new Error('No se pudo recuperar el presupuesto importado')
    }

    const response = buildStoredDeal(row.deal, {
      organization: row.organization,
      person: row.person,
      products: latestProducts,
    })

    return c.json(response)
  } catch (err: any) {
    console.error('[POST /api/deals/import] error', err)
    return c.json({ error: err.message ?? 'No se pudo importar el presupuesto.' }, 500)
  }
})

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
