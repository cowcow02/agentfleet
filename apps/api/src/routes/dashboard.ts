import { Hono } from "hono";
import type { AppEnv } from "../types";
import { db, dispatches } from "@agentfleet/db";
import { eq, and, count, avg, sum, sql } from "drizzle-orm";
import {
  getMachineCountForOrg,
  getAgentsForOrg,
  getRunningJobsForOrg,
} from "../lib/machines";

export const dashboardRouter = new Hono<AppEnv>();

/** GET /api/dashboard/stats — Aggregate dashboard view */
dashboardRouter.get("/api/dashboard/stats", async (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  const orgFilter = eq(dispatches.organizationId, orgId);

  const [stats] = await db
    .select({
      totalDispatches: count(),
      completed: count(
        sql`CASE WHEN ${dispatches.status} = 'completed' THEN 1 END`
      ),
      failed: count(
        sql`CASE WHEN ${dispatches.status} = 'failed' THEN 1 END`
      ),
      avgDurationMs: avg(dispatches.durationMs),
      totalDurationMs: sum(dispatches.durationMs),
    })
    .from(dispatches)
    .where(orgFilter);

  const avgDurationMs = Number(stats.avgDurationMs) || 0;
  const totalDurationMs = Number(stats.totalDurationMs) || 0;

  return c.json({
    machinesOnline: getMachineCountForOrg(orgId),
    agentsRegistered: getAgentsForOrg(orgId).length,
    runningJobs: getRunningJobsForOrg(orgId),
    totalDispatches: stats.totalDispatches,
    completed: stats.completed,
    failed: stats.failed,
    avgDurationSeconds: Math.round(avgDurationMs / 1000),
    totalAgentSeconds: Math.round(totalDurationMs / 1000),
  });
});
