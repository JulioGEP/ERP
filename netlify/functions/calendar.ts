import { Hono } from 'hono'
import { db } from '../../src/db'
import { sessions } from '../../db/schema'

const app = new Hono()

// Lista de eventos
app.get('/events', async (c) => {
  try {
    const data = await db.select().from(sessions)
    return c.json(data)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// Crear nueva sesión
app.post('/sessions', async (c) => {
  try {
    const body = await c.req.json()
    const inserted = await db.insert(sessions).values(body).returning()
    return c.json(inserted[0])
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

export default app
