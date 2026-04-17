import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@agentfleet/db", () => {
  const projects = {
    id: "id",
    organizationId: "organization_id",
    trackerType: "tracker_type",
    trackerConfig: "tracker_config",
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
      update: () => ({
        set: (s: any) => ({
          where: (w: any) => mockDbUpdate(s, w),
        }),
      }),
    },
    projects,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    and: vi.fn((...args: any[]) => ({ _and: args })),
  };
});

import { createTestApp, createUnauthenticatedApp } from "./_helpers";
import { integrationsRouter } from "../integrations";

const PROJECT_ID = "proj-1";

function linearProject(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    organizationId: "org-test",
    name: "My Project",
    slug: "my-project",
    trackerType: "linear",
    trackerConfig: {
      apiKey: "lin_secret_123",
      triggerStatus: "In Progress",
      triggerLabels: ["bug"],
    },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("integrations routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/projects/:projectId/integrations/linear", () => {
    it("returns configured:false when project has no tracker config", async () => {
      mockDbSelect.mockResolvedValue([linearProject({ trackerType: null, trackerConfig: null })]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.configured).toBe(false);
    });

    it("returns config with webhook URL when project has linear config", async () => {
      mockDbSelect.mockResolvedValue([linearProject()]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.configured).toBe(true);
      expect(body.triggerStatus).toBe("In Progress");
      expect(body.triggerLabels).toEqual(["bug"]);
      expect(body.webhookUrl).toContain(`/api/webhooks/linear/${PROJECT_ID}`);
    });

    it("returns 404 when project not found", async () => {
      mockDbSelect.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/nonexistent/integrations/linear`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe("Project not found");
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`);
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/projects/:projectId/integrations/linear", () => {
    it("writes linear config to project.trackerConfig", async () => {
      mockDbSelect.mockResolvedValue([linearProject({ trackerType: null, trackerConfig: null })]);
      mockDbUpdate.mockResolvedValue(undefined);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`, {
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
      expect(mockDbUpdate).toHaveBeenCalled();

      const [setArg] = mockDbUpdate.mock.calls[0];
      expect(setArg.trackerType).toBe("linear");
      expect(setArg.trackerConfig).toEqual({
        apiKey: "lin_api_key",
        triggerStatus: "In Progress",
        triggerLabels: ["bug"],
      });
    });

    it("updates existing project config", async () => {
      mockDbSelect.mockResolvedValue([linearProject()]);
      mockDbUpdate.mockResolvedValue(undefined);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`, {
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

    it("returns 404 when project not found", async () => {
      mockDbSelect.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/nonexistent/integrations/linear`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: "lin_api_key",
          triggerStatus: "In Progress",
          triggerLabels: [],
        }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 422 for invalid input", async () => {
      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "", triggerStatus: "" }),
      });
      expect(res.status).toBe(422);
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`, {
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

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/projects/:projectId/integrations/linear", () => {
    it("clears tracker config and returns configured:false", async () => {
      mockDbSelect.mockResolvedValue([linearProject()]);
      mockDbUpdate.mockResolvedValue(undefined);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.configured).toBe(false);
      expect(mockDbUpdate).toHaveBeenCalled();
      const [setArg] = mockDbUpdate.mock.calls[0];
      expect(setArg.trackerType).toBeNull();
      expect(setArg.trackerConfig).toBeNull();
    });

    it("returns 404 when project not found", async () => {
      mockDbSelect.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/nonexistent/integrations/linear`, {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear`, {
        method: "DELETE",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/projects/:projectId/integrations/linear/issues", () => {
    it("returns 404 when project not found", async () => {
      mockDbSelect.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/nonexistent/integrations/linear/issues`);
      expect(res.status).toBe(404);
    });

    it("returns 404 when project has no linear config", async () => {
      mockDbSelect.mockResolvedValue([linearProject({ trackerType: null, trackerConfig: null })]);

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear/issues`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe("Linear integration not configured");
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear/issues`);
      expect(res.status).toBe(400);
    });

    it("fetches and transforms issues from Linear API", async () => {
      mockDbSelect.mockResolvedValue([linearProject()]);

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

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear/issues`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.issues).toHaveLength(1);
      expect(body.issues[0].identifier).toBe("LIN-1");
      expect(body.issues[0].labels).toEqual(["bug"]);
      expect(body.issues[0].assignee).toBe("Dev");

      mockFetch.mockRestore();
    });

    it("returns 502 when Linear API call fails", async () => {
      mockDbSelect.mockResolvedValue([linearProject()]);

      const mockFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear/issues`);
      expect(res.status).toBe(502);

      const body = await res.json();
      expect(body.error).toBe("Failed to fetch issues from Linear");

      mockFetch.mockRestore();
    });

    it("handles empty issues response", async () => {
      mockDbSelect.mockResolvedValue([linearProject()]);

      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ data: { issues: { nodes: [] } } })));

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear/issues`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.issues).toEqual([]);

      mockFetch.mockRestore();
    });

    it("handles missing data.issues in Linear API response", async () => {
      mockDbSelect.mockResolvedValue([linearProject()]);

      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ data: {} })));

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear/issues`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.issues).toEqual([]);

      mockFetch.mockRestore();
    });

    it("handles completely missing data field in Linear API response", async () => {
      mockDbSelect.mockResolvedValue([linearProject()]);

      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({})));

      const app = createTestApp("org-test");
      app.route("/", integrationsRouter);

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear/issues`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.issues).toEqual([]);

      mockFetch.mockRestore();
    });

    it("handles null assignee", async () => {
      mockDbSelect.mockResolvedValue([linearProject()]);

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

      const res = await app.request(`/api/projects/${PROJECT_ID}/integrations/linear/issues`);
      const body = await res.json();

      expect(body.issues[0].assignee).toBeNull();
      expect(body.issues[0].description).toBeNull();

      mockFetch.mockRestore();
    });
  });
});
