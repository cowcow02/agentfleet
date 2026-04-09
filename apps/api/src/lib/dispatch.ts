import { db, dispatches, transcriptEvents } from "@agentfleet/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { findAgentForDispatch, findAgentByName } from "./machines";
import { eventBus } from "./events";
import { isAdHocDispatch, type CreateDispatchRequest } from "@agentfleet/types";

/**
 * Resolve a dispatch request into DB row values: find the target agent and
 * normalize ticket metadata. Ad hoc requests get a synthetic ticketRef and
 * an empty label set; ticket-based requests flow through unchanged.
 */
function resolveDispatchTarget(orgId: string, request: CreateDispatchRequest) {
  if (isAdHocDispatch(request)) {
    const match = findAgentByName(orgId, request.machineName, request.agentName);
    if (!match) return null;
    return {
      agent: match.agent,
      machine: match.machine,
      ticketRef: `ADHOC-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: request.description?.trim().slice(0, 80) || "Ad hoc task",
      description: request.description ?? null,
      labels: [] as string[],
      priority: "medium" as const,
    };
  }

  const match = findAgentForDispatch(orgId, request.labels);
  if (!match) return null;
  return {
    agent: match.agent,
    machine: match.machine,
    ticketRef: request.ticketRef,
    title: request.title,
    description: request.description ?? null,
    labels: request.labels,
    priority: request.priority ?? "medium",
  };
}

/**
 * Find a matching agent, create a dispatch in DB, send WS dispatch command.
 * Returns the created dispatch or throws an error.
 */
export async function createDispatch(
  orgId: string,
  request: CreateDispatchRequest,
  source: "manual" | "linear",
  userId?: string | null,
) {
  const target = resolveDispatchTarget(orgId, request);
  if (!target) {
    return { error: "No matching agent with available capacity", code: "NO_AGENT" };
  }

  const { agent, machine } = target;

  // Insert dispatch into DB
  const [dispatch] = await db
    .insert(dispatches)
    .values({
      organizationId: orgId,
      ticketRef: target.ticketRef,
      title: target.title,
      description: target.description,
      labels: target.labels,
      priority: target.priority,
      agentName: agent.name,
      machineName: machine.name,
      createdBy: userId ?? null,
      source,
      status: "dispatched",
      messages: [],
    })
    .returning();

  // Increment agent running count
  agent.running++;

  // Send dispatch command via WebSocket
  const wsMessage = JSON.stringify({
    type: "dispatch",
    dispatch_id: dispatch.id,
    agent: agent.name,
    ticket: {
      id: dispatch.ticketRef,
      title: dispatch.title,
      description: dispatch.description ?? undefined,
      labels: dispatch.labels,
      priority: dispatch.priority,
    },
  });
  machine.ws.send(wsMessage);

  // Emit events
  eventBus.emitDispatchUpdate({
    orgId,
    dispatch: serializeDispatch(dispatch),
  });
  eventBus.emitFeedEvent({
    orgId,
    message: `Dispatch ${dispatch.ticketRef} sent to ${agent.name}@${machine.name}`,
    timestamp: new Date().toISOString(),
    type: "dispatch",
  });

  return {
    id: dispatch.id,
    agentName: dispatch.agentName,
    machineName: dispatch.machineName,
    status: dispatch.status,
  };
}

/** Update dispatch status message from daemon status update */
export async function appendDispatchMessage(
  dispatchId: string,
  message: string,
  timestamp: string,
) {
  const [existing] = await db
    .select()
    .from(dispatches)
    .where(eq(dispatches.id, dispatchId))
    .limit(1);

  if (!existing) return;

  const messages = [...(existing.messages || []), { message, timestamp }];
  await db
    .update(dispatches)
    .set({ messages, status: "running", updatedAt: new Date() })
    .where(eq(dispatches.id, dispatchId));

  const [updated] = await db
    .select()
    .from(dispatches)
    .where(eq(dispatches.id, dispatchId))
    .limit(1);

  if (updated) {
    eventBus.emitDispatchUpdate({
      orgId: updated.organizationId,
      dispatch: serializeDispatch(updated),
    });
  }
}

/** Complete a dispatch — update status, duration, exit code */
export async function completeDispatch(
  dispatchId: string,
  success: boolean,
  exitCode: number,
  durationSeconds: number,
) {
  const durationMs = Math.round(durationSeconds * 1000);
  const status = success ? "completed" : "failed";

  await db
    .update(dispatches)
    .set({ status, exitCode, durationMs, updatedAt: new Date() })
    .where(eq(dispatches.id, dispatchId));

  const [updated] = await db
    .select()
    .from(dispatches)
    .where(eq(dispatches.id, dispatchId))
    .limit(1);

  if (updated) {
    eventBus.emitDispatchUpdate({
      orgId: updated.organizationId,
      dispatch: serializeDispatch(updated),
    });
    eventBus.emitFeedEvent({
      orgId: updated.organizationId,
      message: `Dispatch ${updated.ticketRef} ${status} (exit ${exitCode}, ${durationSeconds}s)`,
      timestamp: new Date().toISOString(),
      type: status,
    });
  }
}

export type TranscriptEventType =
  | "user"
  | "assistant"
  | "attachment"
  | "tool_call"
  | "tool_result"
  | "usage";

/** Store a transcript event from daemon JSONL tailing */
export async function appendTranscriptEvent(
  dispatchId: string,
  orgId: string,
  sessionId: string,
  eventType: TranscriptEventType,
  data: Record<string, unknown>,
  timestamp: string,
) {
  await db.insert(transcriptEvents).values({
    dispatchId,
    organizationId: orgId,
    sessionId,
    eventType,
    data,
    timestamp: new Date(timestamp),
  });

  eventBus.emitTranscriptEvent({
    orgId,
    dispatchId,
    sessionId,
    eventType,
    data,
    timestamp,
  });
}

/** Serialize a dispatch DB row to a plain object for JSON/SSE */
export function serializeDispatch(row: typeof dispatches.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ticketRef: row.ticketRef,
    title: row.title,
    description: row.description,
    labels: row.labels,
    priority: row.priority,
    agentName: row.agentName,
    machineName: row.machineName,
    createdBy: row.createdBy,
    source: row.source,
    status: row.status,
    exitCode: row.exitCode,
    durationMs: row.durationMs,
    messages: row.messages ?? [],
    usage: row.usage ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
