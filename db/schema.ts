import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  jsonb,
  boolean,
  text
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("pipedrive_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cif: varchar("cif", { length: 64 }),
  phone: varchar("phone", { length: 64 }),
  address: varchar("address", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const persons = pgTable("persons", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id, {
    onDelete: "set null"
  }),
  pipedriveId: varchar("pipedrive_id", { length: 64 }).notNull(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("pipedrive_id", { length: 64 }).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id, {
    onDelete: "set null"
  }),
  personId: integer("person_id").references(() => persons.id, {
    onDelete: "set null"
  }),
  trainingType: varchar("training_type", { length: 255 }),
  hours: integer("hours"),
  direction: varchar("direction", { length: 255 }),
  sede: varchar("sede", { length: 255 }),
  caes: boolean("caes"),
  fundae: boolean("fundae"),
  hotelNight: boolean("hotel_night"),
  students: integer("students"),
  extraProducts: boolean("extra_products"),
  hasDocuments: boolean("has_documents"),
  hasNotes: boolean("has_notes"),
  sessionsCount: integer("sessions_count"),
  sessionIdentifier: text("session_identifier"),
  documentsCount: integer("documents_count"),
  documentIdentifier: text("document_identifier"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const dealNotes = pgTable("notes", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("pipedrive_id", { length: 64 }).notNull(),
  dealId: integer("deal_id").references(() => deals.id, { onDelete: "cascade" }).notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const dealDocuments = pgTable("documents", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("pipedrive_id", { length: 64 }).notNull(),
  dealId: integer("deal_id").references(() => deals.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("pipedrive_id", { length: 64 }),
  dealId: integer("deal_id").references(() => deals.id, { onDelete: "cascade" }).notNull(),
  status: varchar("status", { length: 255 }),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  sede: varchar("sede", { length: 255 }),
  address: varchar("address", { length: 255 }),
  fireman: varchar("fireman", { length: 255 }),
  vehicle: varchar("vehicle", { length: 255 }),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const trainers = pgTable("trainers", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("pipedrive_id", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const mobileUnits = pgTable("mobile_units", {
  id: serial("id").primaryKey(),
  pipedriveId: varchar("pipedrive_id", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const sessionTrainers = pgTable("session_trainers", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "cascade" }).notNull(),
  trainerId: integer("trainer_id").references(() => trainers.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow()
});

export const sessionMobileUnits = pgTable("session_mobile_units", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "cascade" }).notNull(),
  mobileUnitId: integer("mobile_unit_id")
    .references(() => mobileUnits.id, { onDelete: "cascade" })
    .notNull(),
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
