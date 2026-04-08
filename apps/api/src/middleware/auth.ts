import type { Context, Next } from "hono";
import { auth } from "../auth";

/**
 * Auth middleware for /api/* routes.
 * Skips: /api/auth/**, /api/webhooks/**, /health
 * Tries session cookie first, then Bearer token via Better Auth.
 * Sets organizationId, user, session on context.
 */
export async function authMiddleware(c: Context, next: Next) {
  const path = c.req.path;

  // Skip paths that don't require auth
  if (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/webhooks/") ||
    path === "/health"
  ) {
    return next();
  }

  // Better Auth handles both cookie sessions and Bearer tokens
  // (the bearer plugin converts Bearer tokens to session lookups)
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) {
    c.set("user", session.user);
    c.set("session", session.session);
    c.set("organizationId", (session.session as any).activeOrganizationId);
    return next();
  }

  return c.json({ error: "Unauthorized" }, 401);
}
