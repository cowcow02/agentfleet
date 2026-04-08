import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock fetch before importing api module
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  fetchDashboardStats,
  fetchDispatches,
  fetchDispatch,
  createDispatch,
  fetchAgents,
  fetchLinearConfig,
  updateLinearConfig,
  deleteLinearConfig,
  fetchLinearIssues,
  fetchWebhookLogs,
  ApiError,
} from "../api";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: () => Promise.resolve(data),
  };
}

function errorResponse(status: number, body: { error: string; code?: string }) {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("api client", () => {
  describe("request basics", () => {
    it("passes credentials: include", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ machinesOnline: 0 }));
      await fetchDashboardStats();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: "include" }),
      );
    });

    it("sets Content-Type: application/json header", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ machinesOnline: 0 }));
      await fetchDashboardStats();
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers["Content-Type"]).toBe("application/json");
    });

    it("throws ApiError on non-ok response", async () => {
      mockFetch.mockResolvedValue(
        errorResponse(404, { error: "Not found", code: "NOT_FOUND" }),
      );
      await expect(fetchDashboardStats()).rejects.toThrow(ApiError);
      try {
        await fetchDashboardStats();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(404);
        expect((err as ApiError).code).toBe("NOT_FOUND");
        expect((err as ApiError).message).toBe("Not found");
      }
    });

    it("handles non-JSON error body gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.reject(new Error("not json")),
      });
      await expect(fetchDashboardStats()).rejects.toThrow("Internal Server Error");
    });

    it("handles 204 No Content", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        statusText: "No Content",
        json: () => Promise.reject(new Error("no body")),
      });
      const result = await deleteLinearConfig();
      expect(result).toBeUndefined();
    });
  });

  describe("fetchDashboardStats", () => {
    it("calls GET /api/dashboard/stats", async () => {
      const data = { machinesOnline: 3, agentsRegistered: 5 };
      mockFetch.mockResolvedValue(jsonResponse(data));
      const result = await fetchDashboardStats();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9900/api/dashboard/stats",
        expect.objectContaining({ credentials: "include" }),
      );
      expect(result).toEqual(data);
    });
  });

  describe("fetchDispatches", () => {
    it("calls GET /api/dispatches with no params", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ dispatches: [], total: 0 }));
      await fetchDispatches();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9900/api/dispatches",
        expect.any(Object),
      );
    });

    it("appends query params when provided", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ dispatches: [], total: 0 }));
      await fetchDispatches({ status: "running", limit: 10, offset: 5 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("status=running");
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=5");
    });

    it("omits falsy params", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ dispatches: [], total: 0 }));
      await fetchDispatches({ status: "", source: undefined });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("http://localhost:9900/api/dispatches");
    });
  });

  describe("fetchDispatch", () => {
    it("calls GET /api/dispatches/:id", async () => {
      const dispatch = { id: "abc-123", title: "Test" };
      mockFetch.mockResolvedValue(jsonResponse(dispatch));
      const result = await fetchDispatch("abc-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9900/api/dispatches/abc-123",
        expect.any(Object),
      );
      expect(result).toEqual(dispatch);
    });
  });

  describe("createDispatch", () => {
    it("calls POST /api/dispatches with JSON body", async () => {
      const body = {
        ticketRef: "KIP-1",
        title: "Test",
        labels: ["frontend"],
        priority: "medium" as const,
      };
      const response = {
        id: "uuid-1",
        agentName: "agent-1",
        machineName: "machine-1",
        status: "dispatched",
      };
      mockFetch.mockResolvedValue(jsonResponse(response));
      const result = await createDispatch(body);
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual(body);
      expect(result).toEqual(response);
    });
  });

  describe("fetchAgents", () => {
    it("calls GET /api/agents", async () => {
      const data = { agents: [], machinesOnline: 0 };
      mockFetch.mockResolvedValue(jsonResponse(data));
      const result = await fetchAgents();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9900/api/agents",
        expect.any(Object),
      );
      expect(result).toEqual(data);
    });
  });

  describe("fetchLinearConfig", () => {
    it("calls GET /api/integrations/linear", async () => {
      const data = { configured: true, triggerStatus: "In Progress" };
      mockFetch.mockResolvedValue(jsonResponse(data));
      const result = await fetchLinearConfig();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9900/api/integrations/linear",
        expect.any(Object),
      );
      expect(result).toEqual(data);
    });
  });

  describe("updateLinearConfig", () => {
    it("calls PUT /api/integrations/linear with body", async () => {
      const body = {
        apiKey: "lin_api_xyz",
        triggerStatus: "In Progress",
        triggerLabels: ["agent"],
      };
      const response = { configured: true, triggerStatus: "In Progress" };
      mockFetch.mockResolvedValue(jsonResponse(response));
      const result = await updateLinearConfig(body);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:9900/api/integrations/linear");
      expect(opts.method).toBe("PUT");
      expect(JSON.parse(opts.body)).toEqual(body);
      expect(result).toEqual(response);
    });
  });

  describe("deleteLinearConfig", () => {
    it("calls DELETE /api/integrations/linear", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        statusText: "No Content",
        json: () => Promise.reject(new Error("no body")),
      });
      await deleteLinearConfig();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:9900/api/integrations/linear");
      expect(opts.method).toBe("DELETE");
    });
  });

  describe("fetchLinearIssues", () => {
    it("calls GET /api/integrations/linear/issues", async () => {
      const data = { issues: [] };
      mockFetch.mockResolvedValue(jsonResponse(data));
      const result = await fetchLinearIssues();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9900/api/integrations/linear/issues",
        expect.any(Object),
      );
      expect(result).toEqual(data);
    });
  });

  describe("fetchWebhookLogs", () => {
    it("calls GET /api/webhook-logs with no params", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ logs: [], total: 0 }));
      await fetchWebhookLogs();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9900/api/webhook-logs",
        expect.any(Object),
      );
    });

    it("appends limit and offset params", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ logs: [], total: 0 }));
      await fetchWebhookLogs({ limit: 20, offset: 10 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("limit=20");
      expect(url).toContain("offset=10");
    });
  });
});
