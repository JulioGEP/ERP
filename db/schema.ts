// db/schema.ts
import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core'

// Tabla deals normalizada
export const deals = pgTable('deals', {
  id: serial('id').primaryKey(),
  title: text('title'),
  value: integer('value'),
  pipeline_id: integer('pipeline_id'),
  org_id: integer('org_id'),
  person_id: integer('person_id'),
  add_time: timestamp('add_time', { withTimezone: true }),
  update_time: timestamp('update_time', { withTimezone: true }),

  // ✅ Campos normalizados
  sede: text('sede'),
  hotel_pernocta: boolean('hotel_pernocta'),
  deal_direction: text('deal_direction'), // podemos tipar como enum 'in' | 'out'
})

// Ejemplo de otra tabla ya existente (sessions)
export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  dealId: integer('deal_id').references(() => deals.id),
  trainerId: integer('trainer_id'),
  sede: text('sede'),
  startAt: timestamp('start_at', { withTimezone: true }),
  endAt: timestamp('end_at', { withTimezone: true }),
})
