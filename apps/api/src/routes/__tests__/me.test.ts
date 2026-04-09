import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDbSelect = vi.fn();

vi.mock("@agentfleet/db", () => {
  const authSchema = {
    user: { id: "id", name: "name", email: "email" },
    organization: { id: "id", name: "name" },
    member: { organizationId: "organization_id", userId: "user_id", role: "role" },
  };
  return {
    db: {
      select: (cols?: any) => ({
        from: () => ({
          where: (w: any) => ({
            limit: () => mockDbSelect(w),
          }),
        }),
      }),
    },
    authSchema,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    and: vi.fn((...args: any[]) => ({ _and: args })),
  };
});

import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { meRouter } from "../me";

function createMeTestApp(
  orgId: string | undefined,
  user: { id: string; name?: string; email?: string },
) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    if (orgId) c.set("organizationId", orgId);
    c.set("user", user);
    c.set("session", { activeOrganizationId: orgId });
    return next();
  });
  return app;
}

describe("me routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/me", () => {
    it("returns user and org info when fully authenticated", async () => {
      // org lookup
      mockDbSelect
        .mockResolvedValueOnce([{ name: "Test Org" }])
        .mockResolvedValueOnce([{ role: "owner" }]);

      const app = createMeTestApp("org-test", {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
      });
      app.route("/", meRouter);

      const res = await app.request("/api/me");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.member.name).toBe("Test User");
      expect(body.member.email).toBe("test@example.com");
      expect(body.member.role).toBe("owner");
      expect(body.team.name).toBe("Test Org");
      expect(body.team.id).toBe("org-test");
    });

    it("looks up full user when name/email missing (API key auth)", async () => {
      // user lookup, then org lookup, then member lookup
      mockDbSelect
        .mockResolvedValueOnce([{ name: "Looked Up User", email: "looked@up.com" }])
        .mockResolvedValueOnce([{ name: "Test Org" }])
        .mockResolvedValueOnce([{ role: "member" }]);

      const app = createMeTestApp("org-test", { id: "user-1" });
      app.route("/", meRouter);

      const res = await app.request("/api/me");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.member.name).toBe("Looked Up User");
      expect(body.member.email).toBe("looked@up.com");
    });

    it("returns team:null when no organizationId", async () => {
      const app = createMeTestApp(undefined, {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
      });
      app.route("/", meRouter);

      const res = await app.request("/api/me");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.team).toBeNull();
      expect(body.member.name).toBe("Test User");
    });

    it("handles missing org and membership gracefully", async () => {
      // org not found, member not found
      mockDbSelect.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const app = createMeTestApp("org-test", {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
      });
      app.route("/", meRouter);

      const res = await app.request("/api/me");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.team.name).toBe("Unknown");
      expect(body.member.role).toBe("member");
    });

    it("handles user lookup returning no result", async () => {
      // user lookup returns nothing, then org, then member
      mockDbSelect
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ name: "Test Org" }])
        .mockResolvedValueOnce([{ role: "admin" }]);

      const app = createMeTestApp("org-test", { id: "user-1" });
      app.route("/", meRouter);

      const res = await app.request("/api/me");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.member.name).toBeUndefined();
      expect(body.member.email).toBeUndefined();
    });
  });
});
