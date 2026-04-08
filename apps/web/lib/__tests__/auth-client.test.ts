import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock better-auth/react
vi.mock("better-auth/react", () => ({
  createAuthClient: vi.fn(() => ({
    useSession: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    organization: vi.fn(),
  })),
}));

vi.mock("better-auth/client/plugins", () => ({
  organizationClient: vi.fn(() => ({})),
}));

import { apiKey } from "../auth-client";

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("auth-client", () => {
  describe("apiKey.listApiKeys", () => {
    it("calls GET /api/auth/api-key/list with credentials", async () => {
      mockFetch.mockResolvedValue(jsonResponse([{ id: "k1", name: "test" }]));
      const result = await apiKey.listApiKeys();

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/api-key/list", { credentials: "include" });
      expect(result.data).toEqual([{ id: "k1", name: "test" }]);
      expect(result.error).toBeNull();
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, false));
      const result = await apiKey.listApiKeys();

      expect(result.data).toBeNull();
      expect(result.error).toEqual({ message: "Failed to list API keys" });
    });
  });

  describe("apiKey.createApiKey", () => {
    it("calls POST /api/auth/api-key/create with body", async () => {
      const created = { id: "k2", name: "new-key", key: "sk_abc" };
      mockFetch.mockResolvedValue(jsonResponse(created));

      const result = await apiKey.createApiKey({ name: "new-key" });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/api-key/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "new-key" }),
      });
      expect(result.data).toEqual(created);
      expect(result.error).toBeNull();
    });

    it("passes expiresIn param", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: "k3" }));
      await apiKey.createApiKey({ name: "temp", expiresIn: 86400 });

      const [, opts] = mockFetch.mock.calls[0];
      expect(JSON.parse(opts.body)).toEqual({ name: "temp", expiresIn: 86400 });
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, false));
      const result = await apiKey.createApiKey({ name: "test" });

      expect(result.data).toBeNull();
      expect(result.error).toEqual({ message: "Failed to create API key" });
    });
  });

  describe("apiKey.deleteApiKey", () => {
    it("calls POST /api/auth/api-key/delete with keyId", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ success: true }));

      const result = await apiKey.deleteApiKey({ keyId: "k1" });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/api-key/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: "k1" }),
      });
      expect(result.data).toEqual({ success: true });
      expect(result.error).toBeNull();
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, false));
      const result = await apiKey.deleteApiKey({ keyId: "k1" });

      expect(result.data).toBeNull();
      expect(result.error).toEqual({ message: "Failed to delete API key" });
    });
  });
});
