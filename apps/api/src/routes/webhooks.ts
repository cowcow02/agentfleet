import { Hono } from "hono";
import { db, integrations, webhookLogs } from "@agentfleet/db";
import { eq, and } from "drizzle-orm";
import { createDispatch } from "../lib/dispatch";

export const webhooksRouter = new Hono();

/**
 * POST /api/webhooks/linear/:orgId — Receive Linear webhook events.
 * Unauthenticated — excluded from auth middleware by path prefix.
 * Always returns 200 to acknowledge the webhook.
 */
webhooksRouter.post("/api/webhooks/linear/:orgId", async (c) => {
  const orgId = c.req.param("orgId");

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ ok: true });
  }

  // Load integration config
  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.organizationId, orgId), eq(integrations.type, "linear"))
    )
    .limit(1);

  if (!integration) {
    await logWebhook(orgId, "rejected", "No Linear integration configured", body);
    return c.json({ ok: true });
  }

  const config = integration.config as {
    apiKey: string;
    triggerStatus: string;
    triggerLabels: string[];
  };

  // Only process Issue events
  if (body.type !== "Issue") {
    await logWebhook(orgId, "ignored", `Event type: ${body.type}`, body);
    return c.json({ ok: true });
  }

  // Check status trigger
  const issueStatus = body.data?.state?.name ?? body.data?.status ?? "";
  if (
    config.triggerStatus &&
    issueStatus.toLowerCase() !== config.triggerStatus.toLowerCase()
  ) {
    await logWebhook(
      orgId,
      "ignored",
      `Status "${issueStatus}" does not match trigger "${config.triggerStatus}"`,
      body
    );
    return c.json({ ok: true });
  }

  // Check label trigger (if triggerLabels configured, at least one must match)
  const issueLabels: string[] =
    body.data?.labels?.map((l: { name?: string }) => l.name ?? l) ?? [];
  if (config.triggerLabels.length > 0) {
    const hasMatch = config.triggerLabels.some((tl) =>
      issueLabels.some((il) => il.toLowerCase() === tl.toLowerCase())
    );
    if (!hasMatch) {
      await logWebhook(
        orgId,
        "ignored",
        `Labels [${issueLabels.join(", ")}] don't match triggers [${config.triggerLabels.join(", ")}]`,
        body
      );
      return c.json({ ok: true });
    }
  }

  // Build dispatch request
  const ticketRef = body.data?.identifier ?? body.data?.id ?? "UNKNOWN";
  const title = body.data?.title ?? "Linear Issue";
  const description = body.data?.description ?? undefined;
  const labels =
    issueLabels.length > 0 ? issueLabels : ["linear"];
  const priority = mapLinearPriority(body.data?.priority);

  const result = await createDispatch(
    orgId,
    { ticketRef, title, description, labels, priority },
    "linear"
  );

  if ("error" in result) {
    await logWebhook(orgId, "no_match", result.error ?? null, body);
  } else {
    await logWebhook(orgId, "dispatched", `Dispatched as ${result.id}`, body, result.id);
  }

  return c.json({ ok: true });
});

async function logWebhook(
  orgId: string,
  action: string,
  reason: string | null,
  payload: unknown,
  dispatchId?: string
) {
  try {
    await db.insert(webhookLogs).values({
      organizationId: orgId,
      integration: "linear",
      action,
      reason,
      payload,
      dispatchId: dispatchId || null,
    });
  } catch {
    // Best effort logging
  }
}

function mapLinearPriority(
  priority: number | null | undefined
): "low" | "medium" | "high" | "critical" {
  switch (priority) {
    case 0:
      return "low";
    case 1:
      return "critical";
    case 2:
      return "high";
    case 3:
      return "medium";
    default:
      return "medium";
  }
}
