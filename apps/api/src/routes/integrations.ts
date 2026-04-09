import { Hono } from "hono";
import type { AppEnv } from "../types";
import { db, projects } from "@agentfleet/db";
import { eq, and } from "drizzle-orm";
import { UpdateLinearConfigRequest, type LinearConfig } from "@agentfleet/types";

export const integrationsRouter = new Hono<AppEnv>();

/**
 * Look up a project owned by the current org. Returns the row or null.
 */
async function getProject(projectId: string, orgId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

function webhookUrlFor(projectId: string): string {
  const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 9900}`;
  return `${apiUrl}/api/webhooks/linear/${projectId}`;
}

/** GET /api/projects/:projectId/integrations/linear — Get Linear config (API key masked) */
integrationsRouter.get("/api/projects/:projectId/integrations/linear", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const projectId = c.req.param("projectId");
  const project = await getProject(projectId, orgId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  if (project.trackerType !== "linear" || !project.trackerConfig) {
    return c.json({ configured: false });
  }

  const config = project.trackerConfig as LinearConfig;

  return c.json({
    configured: true,
    triggerStatus: config.triggerStatus,
    triggerLabels: config.triggerLabels,
    webhookUrl: webhookUrlFor(projectId),
  });
});

/** PUT /api/projects/:projectId/integrations/linear — Create or update Linear config */
integrationsRouter.put("/api/projects/:projectId/integrations/linear", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);

  const parsed = UpdateLinearConfigRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, 422);
  }

  const projectId = c.req.param("projectId");
  const project = await getProject(projectId, orgId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const config: LinearConfig = {
    apiKey: parsed.data.apiKey,
    triggerStatus: parsed.data.triggerStatus,
    triggerLabels: parsed.data.triggerLabels,
  };

  await db
    .update(projects)
    .set({ trackerType: "linear", trackerConfig: config, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));

  return c.json({
    configured: true,
    triggerStatus: config.triggerStatus,
    triggerLabels: config.triggerLabels,
    webhookUrl: webhookUrlFor(projectId),
  });
});

/** DELETE /api/projects/:projectId/integrations/linear — Remove Linear config */
integrationsRouter.delete("/api/projects/:projectId/integrations/linear", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const projectId = c.req.param("projectId");
  const project = await getProject(projectId, orgId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  await db
    .update(projects)
    .set({ trackerType: null, trackerConfig: null, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));

  return c.json({ configured: false });
});

/** GET /api/projects/:projectId/integrations/linear/issues — Proxy fetch from Linear GraphQL API */
integrationsRouter.get("/api/projects/:projectId/integrations/linear/issues", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const projectId = c.req.param("projectId");
  const project = await getProject(projectId, orgId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  if (project.trackerType !== "linear" || !project.trackerConfig) {
    return c.json({ error: "Linear integration not configured" }, 404);
  }

  const config = project.trackerConfig as LinearConfig;

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
