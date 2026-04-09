import { Hono } from "hono";
import type { AppEnv } from "../types";
import { db, projects } from "@agentfleet/db";
import { eq, and } from "drizzle-orm";
import { CreateProjectRequest, UpdateProjectRequest, ListProjectsQuery } from "@agentfleet/types";

export const projectsRouter = new Hono<AppEnv>();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** POST /api/projects — Create a new project */
projectsRouter.post("/api/projects", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);

  const parsed = CreateProjectRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, 422);
  }

  const slug = parsed.data.slug || slugify(parsed.data.name);

  const [project] = await db
    .insert(projects)
    .values({
      organizationId: orgId,
      name: parsed.data.name,
      slug,
      trackerType: parsed.data.trackerType ?? null,
      trackerConfig: parsed.data.trackerConfig ?? null,
    })
    .returning();

  return c.json(project, 201);
});

/** GET /api/projects — List projects for the organization */
projectsRouter.get("/api/projects", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const query = ListProjectsQuery.parse(c.req.query());

  const total = await db.$count(projects, eq(projects.organizationId, orgId));

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, orgId))
    .orderBy(projects.createdAt)
    .limit(query.limit)
    .offset(query.offset);

  return c.json({ projects: rows, total });
});

/** GET /api/projects/:id — Get a single project */
projectsRouter.get("/api/projects/:id", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, c.req.param("id")), eq(projects.organizationId, orgId)))
    .limit(1);

  if (!project) return c.json({ error: "Project not found" }, 404);

  return c.json(project);
});

/** PATCH /api/projects/:id — Update a project */
projectsRouter.patch("/api/projects/:id", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);

  const parsed = UpdateProjectRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, 422);
  }

  const [updated] = await db
    .update(projects)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(projects.id, c.req.param("id")), eq(projects.organizationId, orgId)))
    .returning();

  if (!updated) return c.json({ error: "Project not found" }, 404);

  return c.json(updated);
});

/** DELETE /api/projects/:id — Delete a project */
projectsRouter.delete("/api/projects/:id", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const [existing] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, c.req.param("id")), eq(projects.organizationId, orgId)))
    .limit(1);

  if (!existing) return c.json({ error: "Project not found" }, 404);

  await db
    .delete(projects)
    .where(and(eq(projects.id, c.req.param("id")), eq(projects.organizationId, orgId)));

  return c.json({ success: true });
});
