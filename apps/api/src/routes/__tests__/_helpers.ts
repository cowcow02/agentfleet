import { Hono } from "hono";
import type { AppEnv } from "../../types";

/**
 * Create a test Hono app with fake auth middleware that sets
 * organizationId, user, and session on the context.
 */
export function createTestApp(orgId = "org-test") {
  const app = new Hono<AppEnv>();

  // Fake auth middleware: sets org/user/session on all requests
  app.use("*", async (c, next) => {
    c.set("organizationId", orgId);
    c.set("user", { id: "user-1", name: "Test User", email: "test@example.com" });
    c.set("session", { activeOrganizationId: orgId });
    return next();
  });

  return app;
}

/**
 * Create a test Hono app with NO auth (simulates unauthenticated requests).
 * organizationId will be undefined.
 */
export function createUnauthenticatedApp() {
  const app = new Hono<AppEnv>();
  return app;
}
