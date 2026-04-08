import { Hono } from "hono";
import type { AppEnv } from "../types";
import { db, dispatches } from "@agentfleet/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import {
  CreateDispatchRequest,
  ListDispatchesQuery,
} from "@agentfleet/types";
import { createDispatch, serializeDispatch } from "../lib/dispatch";

export const dispatchesRouter = new Hono<AppEnv>();

/** GET /api/dispatches — List dispatches for active org */
dispatchesRouter.get("/api/dispatches", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const query = ListDispatchesQuery.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: query.error.message }, 400);
  }
  const { status, source, agent, limit, offset } = query.data;

  const conditions = [eq(dispatches.organizationId, orgId)];
  if (status) conditions.push(eq(dispatches.status, status));
  if (source) conditions.push(eq(dispatches.source, source));
  if (agent) conditions.push(eq(dispatches.agentName, agent));

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(dispatches)
      .where(where)
      .orderBy(desc(dispatches.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(dispatches)
      .where(where),
  ]);

  return c.json({
    dispatches: rows.map(serializeDispatch),
    total,
  });
});

/** POST /api/dispatches — Create manual dispatch */
dispatchesRouter.post("/api/dispatches", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);

  const parsed = CreateDispatchRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, 422);
  }

  const user = c.get("user") as { id: string } | null;
  const result = await createDispatch(orgId, parsed.data, "manual", user?.id);

  if ("error" in result) {
    return c.json({ error: result.error, code: result.code }, 422);
  }

  return c.json(result, 201);
});

/** GET /api/dispatches/:id — Get single dispatch */
dispatchesRouter.get("/api/dispatches/:id", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(dispatches)
    .where(and(eq(dispatches.id, id), eq(dispatches.organizationId, orgId)))
    .limit(1);

  if (!row) return c.json({ error: "Dispatch not found" }, 404);
  return c.json(serializeDispatch(row));
});
