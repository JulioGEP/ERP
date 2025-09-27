// db/schema.ts
import {
  bigint,
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const deals = pgTable(
  'deals',
  {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    pipedriveId: bigint('pipedrive_id', { mode: 'number' }).notNull(),
    title: text('title').notNull(),
    pipelineId: integer('pipeline_id').notNull(),
    status: text('status'),
    orgId: bigint('org_id', { mode: 'number' }),
    personId: bigint('person_id', { mode: 'number' }),
    sede: text('sede'),
    dealDirection: text('deal_direction'),
    caes: boolean('caes'),
    fundae: boolean('fundae'),
    hotelPernocta: boolean('hotel_pernocta'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pipedriveIdIdx: uniqueIndex('uniq_deals_pipedrive').on(table.pipedriveId),
  })
)

export const organizations = pgTable('organizations', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const persons = pgTable('persons', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  orgId: bigint('org_id', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const products = pgTable('products', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  price: integer('price'),
  dealId: bigint('deal_id', { mode: 'number' }),
  isTraining: boolean('is_training').default(false),
  quantity: integer('quantity'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  dealId: bigint('deal_id', { mode: 'number' }).references(() => deals.id),
  trainerId: integer('trainer_id'),
  sede: text('sede'),
  startAt: timestamp('start_at', { withTimezone: true }),
  endAt: timestamp('end_at', { withTimezone: true }),
})
