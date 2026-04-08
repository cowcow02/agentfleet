import { Hono } from "hono";
import type { AppEnv } from "../types";
import { db, integrations } from "@agentfleet/db";
import { eq, and } from "drizzle-orm";
import { UpdateLinearConfigRequest } from "@agentfleet/types";

export const integrationsRouter = new Hono<AppEnv>();

/** GET /api/integrations/linear — Get Linear config (API key masked) */
integrationsRouter.get("/api/integrations/linear", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const [row] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.organizationId, orgId), eq(integrations.type, "linear"))
    )
    .limit(1);

  if (!row) {
    return c.json({ configured: false });
  }

  const config = row.config as { apiKey: string; triggerStatus: string; triggerLabels: string[] };
  const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 9900}`;

  return c.json({
    configured: true,
    triggerStatus: config.triggerStatus,
    triggerLabels: config.triggerLabels,
    webhookUrl: `${apiUrl}/api/webhooks/linear/${orgId}`,
  });
});

/** PUT /api/integrations/linear — Create or update Linear config */
integrationsRouter.put("/api/integrations/linear", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);

  const parsed = UpdateLinearConfigRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, 422);
  }

  const config = {
    apiKey: parsed.data.apiKey,
    triggerStatus: parsed.data.triggerStatus,
    triggerLabels: parsed.data.triggerLabels,
  };

  // Upsert: try update first, insert if not found
  const [existing] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.organizationId, orgId), eq(integrations.type, "linear"))
    )
    .limit(1);

  if (existing) {
    await db
      .update(integrations)
      .set({ config, updatedAt: new Date() })
      .where(eq(integrations.id, existing.id));
  } else {
    await db.insert(integrations).values({
      organizationId: orgId,
      type: "linear",
      config,
    });
  }

  const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 9900}`;

  return c.json({
    configured: true,
    triggerStatus: config.triggerStatus,
    triggerLabels: config.triggerLabels,
    webhookUrl: `${apiUrl}/api/webhooks/linear/${orgId}`,
  });
});

/** DELETE /api/integrations/linear — Remove Linear config */
integrationsRouter.delete("/api/integrations/linear", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  await db
    .delete(integrations)
    .where(
      and(eq(integrations.organizationId, orgId), eq(integrations.type, "linear"))
    );

  return c.json({ configured: false });
});

/** GET /api/integrations/linear/issues — Proxy fetch from Linear GraphQL API */
integrationsRouter.get("/api/integrations/linear/issues", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const [row] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.organizationId, orgId), eq(integrations.type, "linear"))
    )
    .limit(1);

  if (!row) {
    return c.json({ error: "Linear integration not configured" }, 404);
  }

  const config = row.config as { apiKey: string };

  try {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: config.apiKey,
      },
      body: JSON.stringify({
        query: `
          query {
            issues(
              filter: { state: { type: { nin: ["completed", "cancelled"] } } }
              first: 50
              orderBy: updatedAt
            ) {
              nodes {
                identifier
                title
                description
                state { name }
                labels { nodes { name } }
                priority
                assignee { name }
                url
              }
            }
          }
        `,
      }),
    });

    const data = (await response.json()) as {
      data?: {
        issues?: {
          nodes: {
            identifier: string;
            title: string;
            description: string | null;
            state: { name: string };
            labels: { nodes: { name: string }[] };
            priority: number | null;
            assignee: { name: string } | null;
            url: string;
          }[];
        };
      };
    };

    const issues = (data.data?.issues?.nodes ?? []).map((issue) => ({
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      state: issue.state.name,
      labels: issue.labels.nodes.map((l) => l.name),
      priority: issue.priority,
      assignee: issue.assignee?.name ?? null,
      url: issue.url,
    }));

    return c.json({ issues });
  } catch (err) {
    return c.json({ error: "Failed to fetch issues from Linear" }, 502);
  }
});
