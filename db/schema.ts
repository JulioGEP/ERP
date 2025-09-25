import { sql } from "drizzle-orm";
import { pgTable, serial, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("org_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cif: varchar("cif", { length: 64 }),
  phone: varchar("telf_org", { length: 64 }),
  address: varchar("address", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const persons = pgTable("persons", {
  id: serial("id").primaryKey(),
  organizationId: integer("person_org_id").references(() => organizations.id, {
    onDelete: "set null"
  }),
  pipedriveId: varchar("person_id", { length: 64 }).notNull(),
  firstName: varchar("first_name", { length: 255 }),
  secondName: varchar("second_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("telf_person", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("deal_id", { length: 64 }).notNull(),
  organizationId: integer("deal_org_id").references(() => organizations.id, {
    onDelete: "set null"
  }),
  trainingType: varchar("training_type", { length: 255 }),
  training: jsonb("training").default(sql`'[]'::jsonb`),
  hours: integer("hours"),
  direction: varchar("deal_direction", { length: 255 }),
  sede: varchar("sede", { length: 255 }),
  caes: varchar("caes", { length: 255 }),
  fundae: varchar("fundae", { length: 255 }),
  hotelNight: varchar("hotel_night", { length: 255 }),
  students: integer("alumnos"),
  prodExtra: jsonb("prod_extra").default(sql`'[]'::jsonb`),
  notes: jsonb("notes").default(sql`'[]'::jsonb`),
  documents: jsonb("documents").default(sql`'[]'::jsonb`),
  sessionsCount: integer("seassons_num"),
  sessionIdentifiers: jsonb("seassons_id").default(sql`'[]'::jsonb`),
  documentsCount: integer("documents_num"),
  documentIdentifiers: jsonb("documents_id").default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const dealNotes = pgTable("notes", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("notes_id", { length: 64 }).notNull(),
  dealId: integer("deal_id").references(() => deals.id, { onDelete: "cascade" }).notNull(),
  comment: varchar("comment_deal", { length: 4000 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const dealDocuments = pgTable("documents", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("doc_id", { length: 64 }).notNull(),
  dealId: integer("deal_id").references(() => deals.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  document: jsonb("doc_deal").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("seasson_id", { length: 64 }),
  dealId: integer("deal_id").references(() => deals.id, { onDelete: "cascade" }).notNull(),
  status: varchar("status", { length: 255 }),
  startAt: timestamp("date_start"),
  endAt: timestamp("date_end"),
  sede: varchar("sede", { length: 255 }),
  address: varchar("seasson_address", { length: 255 }),
  fireman: varchar("seasson_fireman", { length: 255 }),
  vehicle: varchar("seasson_vehicle", { length: 255 }),
  comment: varchar("comment_seasson", { length: 4000 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const trainers = pgTable("trainers", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("trainer_id", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const mobileUnits = pgTable("mobile_units", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("um_id", { length: 64 }),
  name: varchar("um_name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const sessionTrainers = pgTable("session_trainers", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "cascade" }).notNull(),
  trainerId: integer("trainer_id").references(() => trainers.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow()
});

export const sessionUnits = pgTable("session_units", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "cascade" }).notNull(),
  unitId: integer("unit_id").references(() => mobileUnits.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow()
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

export const sharedState = pgTable("shared_state", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow()
});
