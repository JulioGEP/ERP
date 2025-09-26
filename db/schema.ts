// db/schema.ts
import {
  pgTable,
  text,
  bigint,
  boolean,
  integer,
  timestamp,
  serial,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ========== ORGANIZATIONS ==========
export const organizations = pgTable("organizations", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ========== PERSONS ==========
export const persons = pgTable("persons", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  orgId: bigint("org_id", { mode: "number" }).references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ========== DEALS (PRESUPUESTOS / CURSOS) ==========
export const deals = pgTable(
  "deals",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    pipedriveId: bigint("pipedrive_id", { mode: "number" }).notNull(),
    title: text("title").notNull(),
    pipelineId: integer("pipeline_id").notNull(),
    status: text("status"),
    orgId: bigint("org_id", { mode: "number" }).references(() => organizations.id),
    personId: bigint("person_id", { mode: "number" }).references(() => persons.id),

    // 🔄 Campos normalizados
    sede: text("sede"),
    dealDirection: text("deal_direction"),
    caes: boolean("caes"),
    fundae: boolean("fundae"),
    hotelPernocta: boolean("hotel_pernocta"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxPipeline: index("idx_deals_pipeline").on(table.pipelineId),
    idxUpdated: index("idx_deals_updated_at").on(table.updatedAt),
    uniqPipedrive: uniqueIndex("uniq_deals_pipedrive").on(table.pipedriveId),
  })
);

// ========== PRODUCTS ==========
export const products = pgTable("products", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  price: integer("price"),
  dealId: bigint("deal_id", { mode: "number" }).references(() => deals.id),

  // Nuevo flag: producto de formación
  isTraining: boolean("is_training").default(false),

  createdAt: timestamp("created_at").defaultNow(),
});

// ========== NOTES ==========
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  dealId: bigint("deal_id", { mode: "number" }).references(() => deals.id),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ========== DOCUMENTS ==========
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  dealId: bigint("deal_id", { mode: "number" }).references(() => deals.id),
  name: text("name"),
  url: text("url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ========== SESSIONS (FORMACIONES PLANIFICADAS) ==========
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  dealId: bigint("deal_id", { mode: "number" }).references(() => deals.id),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  trainerId: bigint("trainer_id", { mode: "number" }),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ========== TRAINERS ==========
export const trainers = pgTable("trainers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ========== UNIDADES MÓVILES ==========
export const unidadesMoviles = pgTable("unidades_moviles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});
