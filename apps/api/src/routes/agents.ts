import { Hono } from "hono";
import type { AppEnv } from "../types";
import { getAgentsForOrg, getMachineCountForOrg } from "../lib/machines";

export const agentsRouter = new Hono<AppEnv>();

/** GET /api/agents — List connected agents for active org */
agentsRouter.get("/api/agents", (c) => {
  const orgId = c.get("organizationId") as string;
  if (!orgId) return c.json({ error: "No active organization" }, 400);

  return c.json({
    agents: getAgentsForOrg(orgId),
    machinesOnline: getMachineCountForOrg(orgId),
  });
});
