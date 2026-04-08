import { z } from "zod";
import { AgentSchema, DispatchSchema } from "./entities";

export const AgentUpdateEvent = z.object({
  event: z.literal("agent:update"),
  data: z.object({
    agents: z.array(AgentSchema),
    machines: z.number(),
  }),
});
export type AgentUpdateEvent = z.infer<typeof AgentUpdateEvent>;

export const DispatchUpdateEvent = z.object({
  event: z.literal("dispatch:update"),
  data: z.object({
    dispatch: DispatchSchema,
  }),
});
export type DispatchUpdateEvent = z.infer<typeof DispatchUpdateEvent>;

export const FeedEvent = z.object({
  event: z.literal("feed:event"),
  data: z.object({
    message: z.string(),
    timestamp: z.string(),
    type: z.string(),
  }),
});
export type FeedEvent = z.infer<typeof FeedEvent>;

export const SseEvent = z.discriminatedUnion("event", [
  AgentUpdateEvent,
  DispatchUpdateEvent,
  FeedEvent,
]);
export type SseEvent = z.infer<typeof SseEvent>;
