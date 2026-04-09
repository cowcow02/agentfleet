import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();

vi.mock("@agentfleet/db", () => {
  const projects = {
    id: "id",
    organizationId: "organization_id",
    name: "name",
    slug: "slug",
  };
  return {
    db: {
      select: () => ({
        from: () => ({
          where: (w: any) => ({
            limit: () => mockDbSelect(w),
            orderBy: () => ({
              limit: () => ({
                offset: () => mockDbSelect(w),
              }),
            }),
          }),
        }),
      }),
      insert: () => ({
        values: (v: any) => ({
          returning: () => mockDbInsert(v),
        }),
      }),
      update: () => ({
        set: (s: any) => ({
          where: (w: any) => ({
            returning: () => mockDbUpdate(s, w),
          }),
        }),
      }),
      delete: () => ({
        where: (w: any) => mockDbDelete(w),
      }),
      $count: (table: any, where?: any) => mockDbSelect(where),
    },
    projects,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    and: vi.fn((...args: any[]) => ({ _and: args })),
  };
});

import { createTestApp, createUnauthenticatedApp } from "./_helpers";
import { projectsRouter } from "../projects";

describe("projects routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- POST /api/projects ---

  describe("POST /api/projects", () => {
    it("creates a project and returns 201", async () => {
      mockDbInsert.mockResolvedValue([
        {
          id: "proj-1",
          organizationId: "org-test",
          name: "My Project",
          slug: "my-project",
          trackerType: null,
          trackerConfig: null,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ]);

      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Project" }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.name).toBe("My Project");
      expect(body.slug).toBe("my-project");
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it("uses provided slug instead of generating one", async () => {
      mockDbInsert.mockResolvedValue([
        {
          id: "proj-1",
          organizationId: "org-test",
          name: "My Project",
          slug: "custom-slug",
          trackerType: null,
          trackerConfig: null,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ]);

      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Project", slug: "custom-slug" }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.slug).toBe("custom-slug");
    });

    it("returns 422 for invalid input", async () => {
      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });
      expect(res.status).toBe(422);
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-JSON body", async () => {
      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });
      expect(res.status).toBe(400);
    });
  });

  // --- GET /api/projects ---

  describe("GET /api/projects", () => {
    it("returns org-scoped projects with total count", async () => {
      mockDbSelect
        .mockResolvedValueOnce(5) // $count
        .mockResolvedValueOnce([
          {
            id: "proj-1",
            organizationId: "org-test",
            name: "Project 1",
            slug: "project-1",
            trackerType: null,
            trackerConfig: null,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          },
        ]);

      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.projects).toHaveLength(1);
      expect(body.total).toBe(5);
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects");
      expect(res.status).toBe(400);
    });
  });

  // --- GET /api/projects/:id ---

  describe("GET /api/projects/:id", () => {
    it("returns project by id", async () => {
      mockDbSelect.mockResolvedValue([
        {
          id: "proj-1",
          organizationId: "org-test",
          name: "Project 1",
          slug: "project-1",
          trackerType: "linear",
          trackerConfig: { teamId: "t1" },
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ]);

      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/proj-1");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe("proj-1");
      expect(body.trackerType).toBe("linear");
    });

    it("returns 404 when project not found", async () => {
      mockDbSelect.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/nonexistent");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe("Project not found");
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/proj-1");
      expect(res.status).toBe(400);
    });
  });

  // --- PATCH /api/projects/:id ---

  describe("PATCH /api/projects/:id", () => {
    it("updates project and returns updated data", async () => {
      mockDbUpdate.mockResolvedValue([
        {
          id: "proj-1",
          organizationId: "org-test",
          name: "Updated Name",
          slug: "project-1",
          trackerType: null,
          trackerConfig: null,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ]);

      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/proj-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.name).toBe("Updated Name");
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("returns 404 when project not found", async () => {
      mockDbUpdate.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/nonexistent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 422 for invalid input", async () => {
      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/proj-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackerType: "github" }),
      });
      expect(res.status).toBe(422);
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/proj-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });
      expect(res.status).toBe(400);
    });
  });

  // --- DELETE /api/projects/:id ---

  describe("DELETE /api/projects/:id", () => {
    it("deletes project and returns success", async () => {
      // First check project exists
      mockDbSelect.mockResolvedValue([{ id: "proj-1" }]);
      mockDbDelete.mockResolvedValue(undefined);

      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/proj-1", { method: "DELETE" });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockDbDelete).toHaveBeenCalled();
    });

    it("returns 404 when project not found", async () => {
      mockDbSelect.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/nonexistent", { method: "DELETE" });
      expect(res.status).toBe(404);
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", projectsRouter);

      const res = await app.request("/api/projects/proj-1", { method: "DELETE" });
      expect(res.status).toBe(400);
    });
  });
});
