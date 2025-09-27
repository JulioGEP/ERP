import { Hono } from 'hono'
import { getDeals } from '../../src/services/deals'

const app = new Hono()

app.get('/', async (c) => {
  try {
    const deals = await getDeals({
      pipelineId: 3, // filtro por defecto
      productPrefix: 'form-' // startsWith
    })
    return c.json(deals)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

export default app
