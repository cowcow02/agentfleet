import {
  pgTable,
  text,
  uuid,
  integer,
  serial,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- dispatches ---

export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    ticketRef: text("ticket_ref").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    labels: text("labels").array().notNull().default([]),
    priority: text("priority", {
      enum: ["low", "medium", "high", "critical"],
    })
      .notNull()
      .default("medium"),
    agentName: text("agent_name").notNull(),
    machineName: text("machine_name").notNull(),
    createdBy: text("created_by"),
    source: text("source", { enum: ["manual", "linear"] })
      .notNull()
      .default("manual"),
    status: text("status", {
      enum: ["dispatched", "running", "completed", "failed"],
    })
      .notNull()
      .default("dispatched"),
    exitCode: integer("exit_code"),
    durationMs: integer("duration_ms"),
    messages: jsonb("messages").$type<{ message: string; timestamp: string }[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_dispatches_org").on(table.organizationId),
    index("idx_dispatches_status").on(table.status),
  ],
);

// --- integrations ---

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    type: text("type", { enum: ["linear"] }).notNull(),
    config: jsonb("config").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_integrations_org_type").on(table.organizationId, table.type)],
);

// --- api_keys ---

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_api_keys_org").on(table.organizationId),
    uniqueIndex("idx_api_keys_hash").on(table.keyHash),
  ],
);

// --- webhook_logs ---

export const webhookLogs = pgTable(
  "webhook_logs",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    integration: text("integration", { enum: ["linear"] }).notNull(),
    action: text("action").notNull(),
    reason: text("reason"),
    payload: jsonb("payload"),
    dispatchId: uuid("dispatch_id").references(() => dispatches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_webhook_logs_org").on(table.organizationId)],
);
