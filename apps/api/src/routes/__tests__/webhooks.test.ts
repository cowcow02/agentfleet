import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();

vi.mock("@agentfleet/db", () => {
  const integrations = {
    organizationId: "organization_id",
    type: "type",
  };
  const webhookLogs = {};
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
    },
    integrations,
    webhookLogs,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    and: vi.fn((...args: any[]) => ({ _and: args })),
  };
});

// Mock dispatch
vi.mock("../../lib/dispatch", () => ({
  createDispatch: vi.fn(),
}));

import { webhooksRouter } from "../webhooks";
import { createDispatch } from "../../lib/dispatch";

describe("POST /api/webhooks/linear/:orgId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok for invalid JSON body", async () => {
    const res = await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("logs rejected when no integration configured", async () => {
    mockDbSelect.mockResolvedValue([]); // no integration
    mockDbInsert.mockResolvedValue(undefined);

    const res = await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Issue", data: {} }),
    });
    expect(res.status).toBe(200);
    // Should have logged the webhook
    expect(mockDbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rejected" })
    );
  });

  it("ignores non-Issue events", async () => {
    mockDbSelect.mockResolvedValue([{
      id: "int-1",
      config: { apiKey: "key", triggerStatus: "In Progress", triggerLabels: [] },
    }]);
    mockDbInsert.mockResolvedValue(undefined);

    const res = await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Comment", data: {} }),
    });
    expect(res.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ignored" })
    );
  });

  it("ignores when status does not match trigger", async () => {
    mockDbSelect.mockResolvedValue([{
      id: "int-1",
      config: { apiKey: "key", triggerStatus: "In Progress", triggerLabels: [] },
    }]);
    mockDbInsert.mockResolvedValue(undefined);

    const res = await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: { state: { name: "Backlog" }, title: "Test" },
      }),
    });
    expect(res.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ignored" })
    );
  });

  it("ignores when labels don't match trigger labels", async () => {
    mockDbSelect.mockResolvedValue([{
      id: "int-1",
      config: { apiKey: "key", triggerStatus: "In Progress", triggerLabels: ["critical"] },
    }]);
    mockDbInsert.mockResolvedValue(undefined);

    const res = await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          state: { name: "In Progress" },
          labels: [{ name: "enhancement" }],
          title: "Test",
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ignored" })
    );
  });

  it("dispatches valid matching issue event", async () => {
    mockDbSelect.mockResolvedValue([{
      id: "int-1",
      config: { apiKey: "key", triggerStatus: "In Progress", triggerLabels: ["bug"] },
    }]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    const res = await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          identifier: "LIN-42",
          title: "Fix a bug",
          description: "Some desc",
          state: { name: "In Progress" },
          labels: [{ name: "bug" }],
          priority: 2,
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(createDispatch).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        ticketRef: "LIN-42",
        title: "Fix a bug",
        labels: ["bug"],
        priority: "high", // priority 2 maps to high
      }),
      "linear"
    );
    expect(mockDbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "dispatched" })
    );
  });

  it("logs no_match when createDispatch returns error", async () => {
    mockDbSelect.mockResolvedValue([{
      id: "int-1",
      config: { apiKey: "key", triggerStatus: "In Progress", triggerLabels: [] },
    }]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      error: "No matching agent with available capacity",
      code: "NO_AGENT",
    });

    const res = await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          identifier: "LIN-1",
          title: "Test",
          state: { name: "In Progress" },
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "no_match" })
    );
  });

  it("dispatches with 'linear' as label when issue has no labels", async () => {
    mockDbSelect.mockResolvedValue([{
      id: "int-1",
      config: { apiKey: "key", triggerStatus: "", triggerLabels: [] },
    }]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    const res = await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          identifier: "LIN-1",
          title: "Test",
          state: { name: "" },
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(createDispatch).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ labels: ["linear"] }),
      "linear"
    );
  });

  it.each([
    { priority: 0, expected: "low" },
    { priority: 1, expected: "critical" },
    { priority: 2, expected: "high" },
    { priority: 3, expected: "medium" },
    { priority: null, expected: "medium" },
    { priority: undefined, expected: "medium" },
    { priority: 99, expected: "medium" },
  ])("maps Linear priority $priority to $expected", async ({ priority, expected }) => {
    mockDbSelect.mockResolvedValue([{
      id: "int-1",
      config: { apiKey: "key", triggerStatus: "", triggerLabels: [] },
    }]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          identifier: "LIN-1",
          title: "Test",
          state: { name: "" },
          labels: [{ name: "ts" }],
          priority,
        },
      }),
    });

    expect(createDispatch).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ priority: expected }),
      "linear"
    );
  });

  it("handles webhook log insert failure gracefully", async () => {
    mockDbSelect.mockResolvedValue([]); // no integration
    mockDbInsert.mockRejectedValue(new Error("DB error")); // log fails

    const res = await webhooksRouter.request("/api/webhooks/linear/org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Issue", data: {} }),
    });
    // Should still return 200 even if logging fails
    expect(res.status).toBe(200);
  });
});
