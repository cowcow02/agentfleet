import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();

vi.mock("@agentfleet/db", () => {
  const integrations = {
    id: "id",
    organizationId: "organization_id",
    type: "type",
  };
  return {
    db: {
      select: () => ({
        from: () => ({
          where: (w: any) => ({
            limit: () => mockDbSelect(w),
          }),
        }),
      }),
      insert: () => ({
        values: (v: any) => mockDbInsert(v),
      }),
      update: () => ({
        set: (s: any) => ({
          where: (w: any) => mockDbUpdate(s, w),
        }),
      }),
      delete: () => ({
        where: (w: any) => mockDbDelete(w),
      }),
    },
    integrations,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    and: vi.fn((...args: any[]) => ({ _and: args })),
  };
});

import { createTestApp, createUnauthenticatedApp } from "./_helpers";
import { integrationsRouter } from "../integrations";

describe("integrations routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/integrations/linear", () => {
    it("returns configured:false when no integration exists", async () => {
      mockDbSelect.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.configured).toBe(false);
    });

    it("returns config with masked data when integration exists", async () => {
      mockDbSelect.mockResolvedValue([
        {
          id: "int-1",
          organizationId: "org-test",
          type: "linear",
          config: {
            apiKey: "lin_secret_123",
            triggerStatus: "In Progress",
            triggerLabels: ["bug"],
          },
        },
      ]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.configured).toBe(true);
      expect(body.triggerStatus).toBe("In Progress");
      expect(body.triggerLabels).toEqual(["bug"]);
      expect(body.webhookUrl).toContain("/api/webhooks/linear/org-test");
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear");
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/integrations/linear", () => {
    it("creates new integration when none exists", async () => {
      mockDbSelect.mockResolvedValue([]); // no existing
      mockDbInsert.mockResolvedValue(undefined);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: "lin_api_key",
          triggerStatus: "In Progress",
          triggerLabels: ["bug"],
        }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.configured).toBe(true);
      expect(body.triggerStatus).toBe("In Progress");
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it("updates existing integration", async () => {
      mockDbSelect.mockResolvedValue([{ id: "int-1" }]); // existing
      mockDbUpdate.mockResolvedValue(undefined);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: "lin_api_key",
          triggerStatus: "Done",
          triggerLabels: [],
        }),
      });
      expect(res.status).toBe(200);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("returns 422 for invalid input", async () => {
      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "", triggerStatus: "" }),
      });
      expect(res.status).toBe(422);
    });

    it("returns 400 when no organizationId on PUT", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: "lin_api_key",
          triggerStatus: "In Progress",
          triggerLabels: [],
        }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-JSON body", async () => {
      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear", {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/integrations/linear", () => {
    it("removes integration and returns configured:false", async () => {
      mockDbDelete.mockResolvedValue(undefined);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear", { method: "DELETE" });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.configured).toBe(false);
      expect(mockDbDelete).toHaveBeenCalled();
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear", { method: "DELETE" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/integrations/linear/issues", () => {
    it("returns 404 when no integration configured", async () => {
      mockDbSelect.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear/issues");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe("Linear integration not configured");
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear/issues");
      expect(res.status).toBe(400);
    });

    it("fetches and transforms issues from Linear API", async () => {
      mockDbSelect.mockResolvedValue([
        {
          id: "int-1",
          config: { apiKey: "lin_key_123" },
        },
      ]);

      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              issues: {
                nodes: [
                  {
                    identifier: "LIN-1",
                    title: "Fix bug",
                    description: "A bug",
                    state: { name: "In Progress" },
                    labels: { nodes: [{ name: "bug" }] },
                    priority: 2,
                    assignee: { name: "Dev" },
                    url: "https://linear.app/issue/LIN-1",
                  },
                ],
              },
            },
          }),
        ),
      );

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear/issues");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.issues).toHaveLength(1);
      expect(body.issues[0].identifier).toBe("LIN-1");
      expect(body.issues[0].labels).toEqual(["bug"]);
      expect(body.issues[0].assignee).toBe("Dev");

      mockFetch.mockRestore();
    });

    it("returns 502 when Linear API call fails", async () => {
      mockDbSelect.mockResolvedValue([
        {
          id: "int-1",
          config: { apiKey: "lin_key_123" },
        },
      ]);

      const mockFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear/issues");
      expect(res.status).toBe(502);

      const body = await res.json();
      expect(body.error).toBe("Failed to fetch issues from Linear");

      mockFetch.mockRestore();
    });

    it("handles empty issues response", async () => {
      mockDbSelect.mockResolvedValue([
        {
          id: "int-1",
          config: { apiKey: "lin_key_123" },
        },
      ]);

      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ data: { issues: { nodes: [] } } })));

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear/issues");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.issues).toEqual([]);

      mockFetch.mockRestore();
    });

    it("handles missing data.issues in Linear API response", async () => {
      mockDbSelect.mockResolvedValue([
        {
          id: "int-1",
          config: { apiKey: "lin_key_123" },
        },
      ]);

      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ data: {} })));

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear/issues");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.issues).toEqual([]);

      mockFetch.mockRestore();
    });

    it("handles completely missing data field in Linear API response", async () => {
      mockDbSelect.mockResolvedValue([
        {
          id: "int-1",
          config: { apiKey: "lin_key_123" },
        },
      ]);

      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({})));

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear/issues");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.issues).toEqual([]);

      mockFetch.mockRestore();
    });

    it("returns 400 when no organizationId on GET issues", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear/issues");
      expect(res.status).toBe(400);
    });

    it("handles null assignee", async () => {
      mockDbSelect.mockResolvedValue([
        {
          id: "int-1",
          config: { apiKey: "lin_key_123" },
        },
      ]);

      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              issues: {
                nodes: [
                  {
                    identifier: "LIN-2",
                    title: "Task",
                    description: null,
                    state: { name: "Todo" },
                    labels: { nodes: [] },
                    priority: null,
                    assignee: null,
                    url: "https://linear.app/issue/LIN-2",
                  },
                ],
              },
            },
          }),
        ),
      );

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request("/api/integrations/linear/issues");
      const body = await res.json();

      expect(body.issues[0].assignee).toBeNull();
      expect(body.issues[0].description).toBeNull();

      mockFetch.mockRestore();
    });
  });
});
