import { z } from "zod";
import {
  DispatchSchema,
  DispatchStatusEnum,
  SourceEnum,
  PriorityEnum,
  TrackerTypeEnum,
  AgentSchema,
  ProjectSchema,
  WebhookLogEntrySchema,
  DispatchUsageSchema,
} from "./entities";

// --- POST /api/projects ---

export const CreateProjectRequest = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  trackerType: TrackerTypeEnum.optional(),
  trackerConfig: z.unknown().optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

// --- PATCH /api/projects/:id ---

export const UpdateProjectRequest = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  trackerType: TrackerTypeEnum.nullable().optional(),
  trackerConfig: z.unknown().optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequest>;

// --- GET /api/projects ---

export const ListProjectsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type ListProjectsQuery = z.infer<typeof ListProjectsQuery>;

export const ListProjectsResponse = z.object({
  projects: z.array(ProjectSchema),
  total: z.number(),
});
export type ListProjectsResponse = z.infer<typeof ListProjectsResponse>;

// --- GET /api/projects/:id ---

export const ProjectResponse = ProjectSchema;
export type ProjectResponse = z.infer<typeof ProjectResponse>;

// --- POST /api/dispatches ---

export const CreateDispatchRequest = z.object({
  ticketRef: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  labels: z.array(z.string()).min(1, "At least one label required for agent matching"),
  priority: PriorityEnum.optional().default("medium"),
});
export type CreateDispatchRequest = z.infer<typeof CreateDispatchRequest>;

export const CreateDispatchResponse = z.object({
  id: z.string().uuid(),
  agentName: z.string(),
  machineName: z.string(),
  status: DispatchStatusEnum,
});
export type CreateDispatchResponse = z.infer<typeof CreateDispatchResponse>;

// --- GET /api/dispatches ---

export const ListDispatchesQuery = z.object({
  status: DispatchStatusEnum.optional(),
  source: SourceEnum.optional(),
  agent: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type ListDispatchesQuery = z.infer<typeof ListDispatchesQuery>;

export const ListDispatchesResponse = z.object({
  dispatches: z.array(DispatchSchema),
  total: z.number(),
});
export type ListDispatchesResponse = z.infer<typeof ListDispatchesResponse>;

// --- GET /api/dashboard/stats ---

export const DashboardStatsResponse = z.object({
  machinesOnline: z.number(),
  agentsRegistered: z.number(),
  runningJobs: z.number(),
  totalDispatches: z.number(),
  completed: z.number(),
  failed: z.number(),
  avgDurationSeconds: z.number(),
  totalAgentSeconds: z.number(),
});
export type DashboardStatsResponse = z.infer<typeof DashboardStatsResponse>;

// --- GET /api/agents ---

export const ListAgentsResponse = z.object({
  agents: z.array(AgentSchema),
  machinesOnline: z.number(),
});
export type ListAgentsResponse = z.infer<typeof ListAgentsResponse>;

// --- PUT /api/integrations/linear ---

export const UpdateLinearConfigRequest = z.object({
  apiKey: z.string().min(1),
  triggerStatus: z.string().min(1),
  triggerLabels: z.array(z.string()).default([]),
});
export type UpdateLinearConfigRequest = z.infer<typeof UpdateLinearConfigRequest>;

export const LinearConfigResponse = z.object({
  configured: z.boolean(),
  triggerStatus: z.string().optional(),
  triggerLabels: z.array(z.string()).optional(),
  webhookUrl: z.string().optional(),
});
export type LinearConfigResponse = z.infer<typeof LinearConfigResponse>;

// --- GET /api/integrations/linear/issues ---

export const LinearIssueSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  state: z.string(),
  labels: z.array(z.string()),
  priority: z.number().nullable(),
  assignee: z.string().nullable(),
  url: z.string(),
});
export type LinearIssue = z.infer<typeof LinearIssueSchema>;

export const ListLinearIssuesResponse = z.object({
  issues: z.array(LinearIssueSchema),
});
export type ListLinearIssuesResponse = z.infer<typeof ListLinearIssuesResponse>;

// --- GET /api/webhook-logs ---

export const ListWebhookLogsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type ListWebhookLogsQuery = z.infer<typeof ListWebhookLogsQuery>;

export const ListWebhookLogsResponse = z.object({
  logs: z.array(WebhookLogEntrySchema),
  total: z.number(),
});
export type ListWebhookLogsResponse = z.infer<typeof ListWebhookLogsResponse>;

// --- OTLP Telemetry ---

// Minimal OTLP key-value attribute
const OtlpAnyValue = z.union([
  z.object({ stringValue: z.string() }),
  z.object({ intValue: z.union([z.string(), z.number()]) }),
  z.object({ doubleValue: z.number() }),
  z.object({ boolValue: z.boolean() }),
  z.object({ arrayValue: z.object({ values: z.array(z.any()) }) }),
  z.object({ kvlistValue: z.object({ values: z.array(z.any()) }) }),
]);

const OtlpKeyValue = z.object({
  key: z.string(),
  value: OtlpAnyValue.optional(),
});

const OtlpResource = z
  .object({
    attributes: z.array(OtlpKeyValue).optional(),
  })
  .optional();

// POST /v1/logs
const OtlpLogRecord = z.object({
  timeUnixNano: z.union([z.string(), z.number()]).optional(),
  severityText: z.string().optional(),
  severityNumber: z.number().optional(),
  body: z.any().optional(),
  attributes: z.array(OtlpKeyValue).optional(),
});

const OtlpScopeLog = z.object({
  logRecords: z.array(OtlpLogRecord).optional().default([]),
});

const OtlpResourceLog = z.object({
  resource: OtlpResource,
  scopeLogs: z.array(OtlpScopeLog).optional().default([]),
});

export const OtlpLogsRequest = z.object({
  resourceLogs: z.array(OtlpResourceLog).optional().default([]),
});
export type OtlpLogsRequest = z.infer<typeof OtlpLogsRequest>;

// POST /v1/metrics
const OtlpNumberDataPoint = z.object({
  timeUnixNano: z.union([z.string(), z.number()]).optional(),
  asInt: z.union([z.string(), z.number()]).optional(),
  asDouble: z.number().optional(),
  attributes: z.array(OtlpKeyValue).optional(),
});

const OtlpMetric = z.object({
  name: z.string(),
  unit: z.string().optional(),
  sum: z.object({ dataPoints: z.array(OtlpNumberDataPoint).optional().default([]) }).optional(),
  gauge: z.object({ dataPoints: z.array(OtlpNumberDataPoint).optional().default([]) }).optional(),
});

const OtlpScopeMetric = z.object({
  metrics: z.array(OtlpMetric).optional().default([]),
});

const OtlpResourceMetric = z.object({
  resource: OtlpResource,
  scopeMetrics: z.array(OtlpScopeMetric).optional().default([]),
});

export const OtlpMetricsRequest = z.object({
  resourceMetrics: z.array(OtlpResourceMetric).optional().default([]),
});
export type OtlpMetricsRequest = z.infer<typeof OtlpMetricsRequest>;

// POST /v1/traces
const OtlpSpan = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  kind: z.number().optional(),
  startTimeUnixNano: z.union([z.string(), z.number()]).optional(),
  endTimeUnixNano: z.union([z.string(), z.number()]).optional(),
  attributes: z.array(OtlpKeyValue).optional(),
  status: z.object({ code: z.number().optional(), message: z.string().optional() }).optional(),
});

const OtlpScopeSpan = z.object({
  spans: z.array(OtlpSpan).optional().default([]),
});

const OtlpResourceSpan = z.object({
  resource: OtlpResource,
  scopeSpans: z.array(OtlpScopeSpan).optional().default([]),
});

export const OtlpTracesRequest = z.object({
  resourceSpans: z.array(OtlpResourceSpan).optional().default([]),
});
export type OtlpTracesRequest = z.infer<typeof OtlpTracesRequest>;

// Reexport DispatchUsageSchema for convenience
export { DispatchUsageSchema };
