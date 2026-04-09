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
  doublePrecision,
  bigint,
} from "drizzle-orm/pg-core";

// --- projects ---

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    trackerType: text("tracker_type", { enum: ["linear", "jira"] }),
    trackerConfig: jsonb("tracker_config"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_projects_org").on(table.organizationId),
    uniqueIndex("idx_projects_org_slug").on(table.organizationId, table.slug),
  ],
);

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
    usage: jsonb("usage").$type<{
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens: number;
      cache_creation_input_tokens: number;
      cost_usd: number;
      model_requests: number;
      tool_calls: number;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_dispatches_org").on(table.organizationId),
    index("idx_dispatches_status").on(table.status),
  ],
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

// --- telemetry_events (OTLP log records) ---

export const telemetryEvents = pgTable(
  "telemetry_events",
  {
    id: serial("id").primaryKey(),
    dispatchId: uuid("dispatch_id")
      .references(() => dispatches.id)
      .notNull(),
    organizationId: text("organization_id").notNull(),
    eventType: text("event_type").notNull(), // user_prompt, tool_result, api_request, api_error, tool_decision
    severity: text("severity"), // OTLP severity text
    body: jsonb("body").notNull(), // full OTLP log record body
    attributes: jsonb("attributes"), // OTLP resource/log attributes
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_telemetry_events_dispatch").on(table.dispatchId),
    index("idx_telemetry_events_org").on(table.organizationId),
    index("idx_telemetry_events_type").on(table.eventType),
  ],
);

// --- telemetry_metrics (OTLP metrics) ---

export const telemetryMetrics = pgTable(
  "telemetry_metrics",
  {
    id: serial("id").primaryKey(),
    dispatchId: uuid("dispatch_id")
      .references(() => dispatches.id)
      .notNull(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(), // token.usage, cost.usage, etc.
    value: doublePrecision("value").notNull(),
    unit: text("unit"),
    attributes: jsonb("attributes"), // OTLP metric attributes (model, type, etc.)
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_telemetry_metrics_dispatch").on(table.dispatchId),
    index("idx_telemetry_metrics_org").on(table.organizationId),
    index("idx_telemetry_metrics_name").on(table.name),
  ],
);

// --- telemetry_spans (OTLP trace spans) ---

export const telemetrySpans = pgTable(
  "telemetry_spans",
  {
    id: serial("id").primaryKey(),
    dispatchId: uuid("dispatch_id")
      .references(() => dispatches.id)
      .notNull(),
    organizationId: text("organization_id").notNull(),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    parentSpanId: text("parent_span_id"),
    name: text("name").notNull(),
    kind: integer("kind"), // OTLP SpanKind
    status: jsonb("status"), // { code, message }
    attributes: jsonb("attributes"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_telemetry_spans_dispatch").on(table.dispatchId),
    index("idx_telemetry_spans_org").on(table.organizationId),
    index("idx_telemetry_spans_trace").on(table.traceId),
  ],
);
