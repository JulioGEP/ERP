// netlify/functions/api.ts
import { Hono } from 'hono';
import { handle } from 'hono/netlify';
import dealsRoutes from './deals';
import notesRoutes from './notes';
import calendarRoutes from './calendar';

const app = new Hono();

// Salud
app.get('/api/ping', (c) => c.json({ ok: true, t: Date.now() }));

// Montar módulos
app.route('/api/deals', dealsRoutes);
app.route('/api/notes', notesRoutes);
app.route('/api/calendar', calendarRoutes);

export const handler = handle(app);
