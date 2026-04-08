import { Hono } from "hono";
import type { AppEnv } from "../types";
import { db, webhookLogs } from "@agentfleet/db";
import { eq, desc, count } from "drizzle-orm";
import { ListWebhookLogsQuery } from "@agentfleet/types";

export const webhookLogsRouter = new Hono<AppEnv>();

/** GET /api/webhook-logs — List webhook events for active org */
webhookLogsRouter.get("/api/webhook-logs", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const query = ListWebhookLogsQuery.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: query.error.message }, 400);
  }
  const { limit, offset } = query.data;

  const where = eq(webhookLogs.organizationId, orgId);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(webhookLogs)
      .where(where)
      .orderBy(desc(webhookLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(webhookLogs).where(where),
  ]);

  return c.json({
    logs: rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      integration: row.integration,
      action: row.action,
      reason: row.reason,
      payload: row.payload,
      dispatchId: row.dispatchId,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
  });
});
