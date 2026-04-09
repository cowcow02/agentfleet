import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock crypto
vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => Buffer.from("a".repeat(24))),
  createHash: vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => "mocked-hash"),
    })),
  })),
}));

// Mock DB
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbDelete = vi.fn();

vi.mock("@agentfleet/db", () => {
  const apiKeys = {
    id: "id",
    organizationId: "organization_id",
    name: "name",
    prefix: "prefix",
    createdAt: "created_at",
  };
  return {
    db: {
      select: (cols?: any) => ({
        from: () => ({
          where: (w: any) => mockDbSelect(w),
        }),
      }),
      insert: () => ({
        values: (v: any) => ({
          returning: () => mockDbInsert(v),
        }),
      }),
      delete: () => ({
        where: (w: any) => mockDbDelete(w),
      }),
    },
    apiKeys,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    and: vi.fn((...args: any[]) => ({ _and: args })),
  };
});

import { createTestApp, createUnauthenticatedApp } from "./_helpers";
import { apiKeysRouter } from "../api-keys";

describe("api-keys routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/api-keys/create", () => {
    it("creates an API key and returns it", async () => {
      mockDbInsert.mockResolvedValue([
        {
          id: "key-1",
          name: "My Key",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ]);

      const app = createTestApp("org-test");
      app.route("/", apiKeysRouter);

      const res = await app.request("/api/api-keys/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Key" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.key).toMatch(/^afk_/);
      expect(body.id).toBe("key-1");
      expect(body.name).toBe("My Key");
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it("returns 400 when name is missing", async () => {
      const app = createTestApp("org-test");
      app.route("/", apiKeysRouter);

      const res = await app.request("/api/api-keys/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Name is required");
    });
  });

  describe("GET /api/api-keys/list", () => {
    it("returns list of API keys for the org", async () => {
      mockDbSelect.mockResolvedValue([
        { id: "key-1", name: "Key 1", prefix: "afk_abc123", createdAt: "2024-01-01T00:00:00Z" },
      ]);

      const app = createTestApp("org-test");
      app.route("/", apiKeysRouter);

      const res = await app.request("/api/api-keys/list");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe("Key 1");
    });

    it("returns empty array when no keys exist", async () => {
      mockDbSelect.mockResolvedValue([]);

      const app = createTestApp("org-test");
      app.route("/", apiKeysRouter);

      const res = await app.request("/api/api-keys/list");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual([]);
    });
  });

  describe("POST /api/api-keys/delete", () => {
    it("deletes an API key and returns success", async () => {
      mockDbDelete.mockResolvedValue(undefined);

      const app = createTestApp("org-test");
      app.route("/", apiKeysRouter);

      const res = await app.request("/api/api-keys/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: "key-1" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockDbDelete).toHaveBeenCalled();
    });

    it("returns 400 when keyId is missing", async () => {
      const app = createTestApp("org-test");
      app.route("/", apiKeysRouter);

      const res = await app.request("/api/api-keys/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: "" }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("keyId is required");
    });
  });
});
