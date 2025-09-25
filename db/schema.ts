import { jsonb, pgTable, timestamp, varchar, integer } from "drizzle-orm/pg-core";

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
