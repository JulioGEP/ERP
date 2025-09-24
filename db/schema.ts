import { pgTable, serial, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  cif: varchar("cif", { length: 32 }),
  pipedriveId: varchar("pipedrive_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const persons = pgTable("persons", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").references(() => organizations.id),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 64 }),
  pipedriveId: varchar("pipedrive_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").references(() => organizations.id),
  personId: integer("person_id").references(() => persons.id),
  title: varchar("title", { length: 255 }).notNull(),
  pipeline: varchar("pipeline", { length: 64 }),
  stage: varchar("stage", { length: 64 }),
  value: integer("value"),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  status: varchar("status", { length: 32 }).default("open"),
  source: varchar("source", { length: 16 }).default("manual"), // 'pipedrive'|'manual'|'hidden'
  pipedriveId: varchar("pipedrive_id", { length: 64 }),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const pipedriveDeals = pgTable("pipedrive_deals", {
  dealId: integer("deal_id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  clientName: varchar("client_name", { length: 255 }),
  pipelineId: integer("pipeline_id"),
  pipelineName: varchar("pipeline_name", { length: 255 }),
  wonDate: varchar("won_date", { length: 128 }),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id),
  orgId: integer("org_id").references(() => organizations.id),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  type: varchar("type", { length: 64 }),        // p.ej. training, inspection...
  location: varchar("location", { length: 255 }),
  instructors: jsonb("instructors"),            // lista flexible
  visibility: varchar("visibility", { length: 16 }).default("internal"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type", { length: 16 }).notNull(), // 'deal'|'org'|'person'
  entityId: integer("entity_id").notNull(),
  authorId: integer("author_id"),
  body: varchar("body", { length: 4000 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type", { length: 16 }).notNull(),
  entityId: integer("entity_id").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 128 }),
  size: integer("size"),
  s3Key: varchar("s3_key", { length: 512 }),
  s3Bucket: varchar("s3_bucket", { length: 128 }),
  signedUntil: timestamp("signed_until"),
  createdAt: timestamp("created_at").defaultNow()
});

export const sharedState = pgTable("shared_state", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow()
});
