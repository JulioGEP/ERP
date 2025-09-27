// netlify/functions/calendar.ts
import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema' // Debe exportar sessions

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.warn('[calendar] Missing DATABASE_URL')
}

const sql = DATABASE_URL ? neon(DATABASE_URL) : undefined
const db = sql ? drizzle(sql, { schema }) : undefined

const app = new Hono()

app.get('/events', async (c) => {
  try {
    if (!db) throw new Error('DB not initialized')
    const data = await db.select().from(schema.sessions)
    return c.json(data)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/sessions', async (c) => {
  try {
    if (!db) throw new Error('DB not initialized')
    const body = await c.req.json()
    const inserted = await db.insert(schema.sessions).values(body).returning()
    return c.json(inserted[0])
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.delete('/sessions/:id{[0-9]+}', async (c) => {
  try {
    if (!db) throw new Error('DB not initialized')
    const id = Number(c.req.param('id'))
    const deleted = await db.delete(schema.sessions).where(eq(schema.sessions.id, id)).returning()
    return c.json({ ok: true, deleted })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

export default app
