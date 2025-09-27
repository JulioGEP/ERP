import { Hono } from 'hono'
import deals from './deals'
import notes from './notes'
import calendar from './calendar'

const app = new Hono()

app.get('/api/ping', (c) => c.json({ ok: true, msg: 'pong' }))
app.route('/api/deals', deals)
app.route('/api/notes', notes)
app.route('/api/calendar', calendar)

export default app
