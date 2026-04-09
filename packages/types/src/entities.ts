import { z } from "zod";

// --- Enums ---

export const PriorityEnum = z.enum(["low", "medium", "high", "critical"]);
export type Priority = z.infer<typeof PriorityEnum>;

export const DispatchStatusEnum = z.enum(["dispatched", "running", "completed", "failed"]);
export type DispatchStatus = z.infer<typeof DispatchStatusEnum>;

export const SourceEnum = z.enum(["manual", "linear"]);
export type Source = z.infer<typeof SourceEnum>;

export const IntegrationTypeEnum = z.enum(["linear"]);
export type IntegrationType = z.infer<typeof IntegrationTypeEnum>;

export const TrackerTypeEnum = z.enum(["linear", "jira"]);
export type TrackerType = z.infer<typeof TrackerTypeEnum>;

// --- Entities ---

export const DispatchMessageSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
});
export type DispatchMessage = z.infer<typeof DispatchMessageSchema>;

export const DispatchSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  ticketRef: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  labels: z.array(z.string()),
  priority: PriorityEnum,
  agentName: z.string(),
  machineName: z.string(),
  createdBy: z.string().nullable(),
  source: SourceEnum,
  status: DispatchStatusEnum,
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  messages: z.array(DispatchMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Dispatch = z.infer<typeof DispatchSchema>;

export const LinearConfigSchema = z.object({
  apiKey: z.string(),
  triggerStatus: z.string(),
  triggerLabels: z.array(z.string()),
});
export type LinearConfig = z.infer<typeof LinearConfigSchema>;

export const IntegrationSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  type: IntegrationTypeEnum,
  config: z.unknown(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Integration = z.infer<typeof IntegrationSchema>;

export const WebhookLogEntrySchema = z.object({
  id: z.number(),
  organizationId: z.string(),
  integration: IntegrationTypeEnum,
  action: z.string(),
  reason: z.string().nullable(),
  payload: z.unknown().nullable(),
  dispatchId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type WebhookLogEntry = z.infer<typeof WebhookLogEntrySchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  trackerType: TrackerTypeEnum.nullable(),
  trackerConfig: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const AgentSchema = z.object({
  name: z.string(),
  machine: z.string(),
  tags: z.array(z.string()),
  capacity: z.number().int(),
  running: z.number().int(),
  lastHeartbeat: z.string(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
