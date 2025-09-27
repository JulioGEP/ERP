// netlify/functions/notes.ts
import { Hono } from 'hono'

const PIPEDRIVE_BASE = process.env.PIPEDRIVE_API_BASE?.replace(/\/+$/, '') || 'https://api.pipedrive.com/v1'
const PIPEDRIVE_TOKEN = process.env.PIPEDRIVE_API_TOKEN

type PDNote = {
  id: number
  deal_id?: number
  content?: string
  user_id?: number
  add_time?: string
  update_time?: string
}

async function pd<T>(path: string, qs: Record<string, any> = {}) {
  const usp = new URLSearchParams({ api_token: PIPEDRIVE_TOKEN!, ...qs } as any)
  const url = `${PIPEDRIVE_BASE}${path}?${usp.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pipedrive ${path} -> ${res.status}`)
  const json = await res.json()
  return json.data as T
}

const app = new Hono()

// GET /api/notes?dealId=123
app.get('/', async (c) => {
  const dealId = c.req.query('dealId')
  if (!dealId) return c.json({ error: 'Missing dealId' }, 400)
  try {
    const notes = await pd<PDNote[]>(`/notes`, { deal_id: Number(dealId), limit: 100 })
    return c.json(notes ?? [])
  } catch (err: any) {
    console.error('[GET /api/notes] error', err)
    return c.json({ error: err.message }, 500)
  }
})

export default app
