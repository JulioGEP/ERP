import { Hono } from 'hono'
import { getNotesByDealId } from '../../src/services/notes'

const app = new Hono()

app.get('/', async (c) => {
  const dealId = c.req.query('dealId')
  if (!dealId) return c.json({ error: 'Missing dealId' }, 400)

  try {
    const notes = await getNotesByDealId(dealId)
    return c.json(notes)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

export default app
