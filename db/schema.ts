import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  bigint
} from "drizzle-orm/pg-core";

export const deals = pgTable("deals", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  title: text("title").notNull(),
  clientId: integer("client_id"),
  clientName: text("client_name"),
  sede: text("sede"),
  address: text("address"),
  caes: text("caes"),
  fundae: text("fundae"),
  hotelPernocta: text("hotel_pernocta"),
  pipelineId: integer("pipeline_id"),
  pipelineName: text("pipeline_name"),
  wonDate: text("won_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const dealFormations = pgTable("deal_formations", {
  id: serial("id").primaryKey(),
  dealId: bigint("deal_id", { mode: "number" }).references(() => deals.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow()
});

export const dealProducts = pgTable("deal_products", {
  dealProductId: integer("deal_product_id").primaryKey(),
  dealId: bigint("deal_id", { mode: "number" }).references(() => deals.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  name: text("name").notNull(),
  code: text("code"),
  quantity: doublePrecision("quantity"),
  itemPrice: doublePrecision("item_price"),
  recommendedHours: doublePrecision("recommended_hours"),
  recommendedHoursRaw: text("recommended_hours_raw"),
  isTraining: boolean("is_training").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const dealNotes = pgTable("deal_notes", {
  noteId: varchar("note_id", { length: 255 }).primaryKey(),
  dealId: bigint("deal_id", { mode: "number" }).references(() => deals.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAtText: text("created_at_text"),
  authorName: text("author_name"),
  source: varchar("source", { length: 32 }).notNull().default("deal"),
  productId: integer("product_id"),
  dealProductId: integer("deal_product_id"),
  position: integer("position").notNull().default(0),
  productPosition: integer("product_position"),
  createdAt: timestamp("created_at").defaultNow()
});

export const dealAttachments = pgTable("deal_attachments", {
  attachmentId: varchar("attachment_id", { length: 255 }).primaryKey(),
  dealId: bigint("deal_id", { mode: "number" }).references(() => deals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  downloadUrl: text("download_url"),
  fileType: text("file_type"),
  addedAtText: text("added_at_text"),
  addedBy: text("added_by"),
  source: varchar("source", { length: 32 }).notNull().default("deal"),
  productId: integer("product_id"),
  dealProductId: integer("deal_product_id"),
  position: integer("position").notNull().default(0),
  productPosition: integer("product_position"),
  createdAt: timestamp("created_at").defaultNow()
});

export const sharedState = pgTable("shared_state", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow()
});
