import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock better-auth
vi.mock("../../auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

import { authMiddleware } from "../auth";
import { auth } from "../../auth";

function makeApp() {
  const app = new Hono();
  app.use("*", authMiddleware);

  // Test routes
  app.get("/api/agents", (c) => c.json({ ok: true }));
  app.get("/api/auth/session", (c) => c.json({ ok: true }));
  app.post("/api/webhooks/linear/org-1", (c) => c.json({ ok: true }));
  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips /api/auth/** paths", async () => {
    const app = makeApp();
    const res = await app.request("/api/auth/session");
    expect(res.status).toBe(200);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it("skips /api/webhooks/** paths", async () => {
    const app = makeApp();
    const res = await app.request("/api/webhooks/linear/org-1", { method: "POST" });
    expect(res.status).toBe(200);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it("skips /health path", async () => {
    const app = makeApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated requests", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const app = makeApp();
    const res = await app.request("/api/agents");
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("passes with valid session and sets context variables", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1", name: "Test" },
      session: { activeOrganizationId: "org-1" },
    } as any);

    const app = new Hono();
    app.use("*", authMiddleware);
    app.get("/api/agents", (c) => {
      return c.json({
        user: c.get("user"),
        orgId: c.get("organizationId"),
      });
    });

    const res = await app.request("/api/agents");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user.id).toBe("user-1");
    expect(body.orgId).toBe("org-1");
  });
});
