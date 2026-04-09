import { z } from "zod";

// --- Daemon → Hub ---

export const RegisterMessage = z.object({
  type: z.literal("register"),
  machine: z.string(),
  agents: z.array(
    z.object({
      name: z.string(),
      tags: z.array(z.string()),
      capacity: z.number().int().positive(),
    }),
  ),
});
export type RegisterMessage = z.infer<typeof RegisterMessage>;

export const HeartbeatMessage = z.object({
  type: z.literal("heartbeat"),
});
export type HeartbeatMessage = z.infer<typeof HeartbeatMessage>;

export const StatusMessage = z.object({
  type: z.literal("status"),
  dispatch_id: z.string(),
  timestamp: z.string(),
  message: z.string(),
});
export type StatusMessage = z.infer<typeof StatusMessage>;

export const CompleteMessage = z.object({
  type: z.literal("complete"),
  dispatch_id: z.string(),
  success: z.boolean(),
  exit_code: z.number().int(),
  duration_seconds: z.number(),
});
export type CompleteMessage = z.infer<typeof CompleteMessage>;

export const TelemetryMessage = z.object({
  type: z.literal("telemetry"),
  dispatch_id: z.string(),
  session_id: z.string(),
  event_type: z.enum(["user", "assistant", "attachment", "tool_call", "tool_result", "usage"]),
  data: z.record(z.unknown()),
  timestamp: z.string(),
});
export type TelemetryMessage = z.infer<typeof TelemetryMessage>;

export const DaemonMessage = z.discriminatedUnion("type", [
  RegisterMessage,
  HeartbeatMessage,
  StatusMessage,
  CompleteMessage,
  TelemetryMessage,
]);
export type DaemonMessage = z.infer<typeof DaemonMessage>;

// --- Hub → Daemon ---

export const DispatchCommand = z.object({
  type: z.literal("dispatch"),
  dispatch_id: z.string(),
  agent: z.string(),
  ticket: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    labels: z.array(z.string()),
    priority: z.string(),
  }),
});
export type DispatchCommand = z.infer<typeof DispatchCommand>;

export const RegisteredResponse = z.object({
  type: z.literal("registered"),
  machine: z.string(),
  agents: z.number(),
});
export type RegisteredResponse = z.infer<typeof RegisteredResponse>;

export const ErrorWsMessage = z.object({
  type: z.literal("error"),
  message: z.string(),
});
export type ErrorWsMessage = z.infer<typeof ErrorWsMessage>;

export const AckMessage = z.object({
  type: z.literal("ack"),
  dispatch_id: z.string(),
});
export type AckMessage = z.infer<typeof AckMessage>;

export const HubMessage = z.discriminatedUnion("type", [
  DispatchCommand,
  RegisteredResponse,
  ErrorWsMessage,
  AckMessage,
]);
export type HubMessage = z.infer<typeof HubMessage>;
