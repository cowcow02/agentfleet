import { Hono } from "hono";
import type { AppEnv } from "../types";
import { db, authSchema } from "@agentfleet/db";
import { eq, and } from "drizzle-orm";

export const meRouter = new Hono<AppEnv>();

/** GET /api/me — Return current user + org info (used by CLI login) */
meRouter.get("/api/me", async (c) => {
  const user = c.get("user") as { id: string; name?: string; email?: string };
  const orgId = c.get("organizationId") as string;

  // If user details are minimal (API key auth), look up full user record
  let userName = user.name;
  let userEmail = user.email;
  if (!userName || !userEmail) {
    const [fullUser] = await db
      .select({ name: authSchema.user.name, email: authSchema.user.email })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, user.id))
      .limit(1);
    if (fullUser) {
      userName = fullUser.name;
      userEmail = fullUser.email;
    }
  }

  if (!orgId) {
    return c.json({
      member: { name: userName, email: userEmail },
      team: null,
    });
  }

  // Look up org name and member role
  const [org] = await db
    .select({ name: authSchema.organization.name })
    .from(authSchema.organization)
    .where(eq(authSchema.organization.id, orgId))
    .limit(1);

  const [membership] = await db
    .select({ role: authSchema.member.role })
    .from(authSchema.member)
    .where(and(eq(authSchema.member.organizationId, orgId), eq(authSchema.member.userId, user.id)))
    .limit(1);

  return c.json({
    member: {
      name: userName,
      email: userEmail,
      role: membership?.role ?? "member",
    },
    team: {
      name: org?.name ?? "Unknown",
      id: orgId,
    },
  });
});
