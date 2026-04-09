import { Hono } from "hono";
import type { AppEnv } from "../types";
import { streamSSE } from "hono/streaming";
import { eventBus } from "../lib/events";
import type {
  AgentUpdatePayload,
  DispatchUpdatePayload,
  FeedEventPayload,
  TelemetryEventPayload,
} from "../lib/events";

export const sseRouter = new Hono<AppEnv>();

/** GET /api/sse — Server-Sent Events stream scoped to active org */
sseRouter.get("/api/sse", (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  return streamSSE(c, async (stream) => {
    let closed = false;

    const onAgentUpdate = (payload: AgentUpdatePayload) => {
      if (payload.orgId !== orgId || closed) return;
      stream
        .writeSSE({
          event: "agent:update",
          data: JSON.stringify({ agents: payload.agents, machines: payload.machines }),
        })
        .catch(() => {
          closed = true;
        });
    };

    const onDispatchUpdate = (payload: DispatchUpdatePayload) => {
      if (payload.orgId !== orgId || closed) return;
      stream
        .writeSSE({
          event: "dispatch:update",
          data: JSON.stringify({ dispatch: payload.dispatch }),
        })
        .catch(() => {
          closed = true;
        });
    };

    const onFeedEvent = (payload: FeedEventPayload) => {
      if (payload.orgId !== orgId || closed) return;
      stream
        .writeSSE({
          event: "feed:event",
          data: JSON.stringify({
            message: payload.message,
            timestamp: payload.timestamp,
            type: payload.type,
          }),
        })
        .catch(() => {
          closed = true;
        });
    };

    const onTelemetryEvent = (payload: TelemetryEventPayload) => {
      if (payload.orgId !== orgId || closed) return;
      stream
        .writeSSE({
          event: "telemetry:event",
          data: JSON.stringify({
            dispatchId: payload.dispatchId,
            sessionId: payload.sessionId,
            eventType: payload.eventType,
            data: payload.data,
            timestamp: payload.timestamp,
          }),
        })
        .catch(() => {
          closed = true;
        });
    };

    eventBus.on("agent:update", onAgentUpdate);
    eventBus.on("dispatch:update", onDispatchUpdate);
    eventBus.on("feed:event", onFeedEvent);
    eventBus.on("telemetry:event", onTelemetryEvent);

    // Send heartbeat comment every 30s to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (closed) {
        clearInterval(heartbeatInterval);
        return;
      }
      stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => {
        closed = true;
      });
    }, 30_000);

    // Wait until stream is aborted
    stream.onAbort(() => {
      closed = true;
      clearInterval(heartbeatInterval);
      eventBus.off("agent:update", onAgentUpdate);
      eventBus.off("dispatch:update", onDispatchUpdate);
      eventBus.off("feed:event", onFeedEvent);
      eventBus.off("telemetry:event", onTelemetryEvent);
    });

    // Keep the stream open by waiting indefinitely
    while (!closed) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});
