import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();

vi.mock("@agentfleet/db", () => {
  const projects = {
    id: "id",
    organizationId: "organization_id",
    trackerType: "tracker_type",
    trackerConfig: "tracker_config",
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
    projects,
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

const PROJECT_ID = "proj-1";
const ORG_ID = "org-1";

function linearProject(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    organizationId: ORG_ID,
    name: "My Project",
    slug: "my-project",
    trackerType: "linear",
    trackerConfig: {
      apiKey: "key",
      triggerStatus: "In Progress",
      triggerLabels: [] as string[],
    },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("POST /api/webhooks/linear/:projectId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok for invalid JSON body", async () => {
    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("logs rejected when project not found", async () => {
    mockDbSelect.mockResolvedValue([]); // no project
    mockDbInsert.mockResolvedValue(undefined);

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Issue", data: {} }),
    });
    expect(res.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "rejected" }));
  });

  it("logs rejected when project has no linear config", async () => {
    mockDbSelect.mockResolvedValue([linearProject({ trackerType: null, trackerConfig: null })]);
    mockDbInsert.mockResolvedValue(undefined);

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Issue", data: {} }),
    });
    expect(res.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rejected", organizationId: ORG_ID }),
    );
  });

  it("ignores non-Issue events", async () => {
    mockDbSelect.mockResolvedValue([linearProject()]);
    mockDbInsert.mockResolvedValue(undefined);

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Comment", data: {} }),
    });
    expect(res.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "ignored" }));
  });

  it("ignores when status does not match trigger", async () => {
    mockDbSelect.mockResolvedValue([linearProject()]);
    mockDbInsert.mockResolvedValue(undefined);

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: { state: { name: "Backlog" }, title: "Test" },
      }),
    });
    expect(res.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "ignored" }));
  });

  it("ignores when labels don't match trigger labels", async () => {
    mockDbSelect.mockResolvedValue([
      linearProject({
        trackerConfig: {
          apiKey: "key",
          triggerStatus: "In Progress",
          triggerLabels: ["critical"],
        },
      }),
    ]);
    mockDbInsert.mockResolvedValue(undefined);

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
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
    expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "ignored" }));
  });

  it("dispatches valid matching issue event with project's orgId", async () => {
    mockDbSelect.mockResolvedValue([
      linearProject({
        trackerConfig: {
          apiKey: "key",
          triggerStatus: "In Progress",
          triggerLabels: ["bug"],
        },
      }),
    ]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
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
      ORG_ID,
      expect.objectContaining({
        ticketRef: "LIN-42",
        title: "Fix a bug",
        labels: ["bug"],
        priority: "high",
      }),
      "linear",
    );
    expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "dispatched" }));
  });

  it("logs no_match when createDispatch returns error", async () => {
    mockDbSelect.mockResolvedValue([linearProject()]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      error: "No matching agent with available capacity",
      code: "NO_AGENT",
    });

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
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
    expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "no_match" }));
  });

  it("dispatches with 'linear' as label when issue has no labels", async () => {
    mockDbSelect.mockResolvedValue([
      linearProject({
        trackerConfig: {
          apiKey: "key",
          triggerStatus: "",
          triggerLabels: [],
        },
      }),
    ]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
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
      ORG_ID,
      expect.objectContaining({ labels: ["linear"] }),
      "linear",
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
    mockDbSelect.mockResolvedValue([
      linearProject({
        trackerConfig: {
          apiKey: "key",
          triggerStatus: "",
          triggerLabels: [],
        },
      }),
    ]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
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
      ORG_ID,
      expect.objectContaining({ priority: expected }),
      "linear",
    );
  });

  it("falls back to body.data.status when state.name is missing", async () => {
    mockDbSelect.mockResolvedValue([linearProject()]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          status: "In Progress",
          identifier: "LIN-5",
          title: "Test",
          labels: [{ name: "ts" }],
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(createDispatch).toHaveBeenCalled();
  });

  it("falls back to body.data.id when identifier is missing", async () => {
    mockDbSelect.mockResolvedValue([
      linearProject({
        trackerConfig: {
          apiKey: "key",
          triggerStatus: "",
          triggerLabels: [],
        },
      }),
    ]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          id: "fallback-id",
          title: "Test",
          state: { name: "" },
          labels: [{ name: "ts" }],
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(createDispatch).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ ticketRef: "fallback-id" }),
      "linear",
    );
  });

  it("uses UNKNOWN ticketRef and 'Linear Issue' title when data is missing", async () => {
    mockDbSelect.mockResolvedValue([
      linearProject({
        trackerConfig: {
          apiKey: "key",
          triggerStatus: "",
          triggerLabels: [],
        },
      }),
    ]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          state: { name: "" },
          labels: [{ name: "ts" }],
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(createDispatch).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ ticketRef: "UNKNOWN", title: "Linear Issue" }),
      "linear",
    );
  });

  it("handles labels with raw strings instead of objects", async () => {
    mockDbSelect.mockResolvedValue([
      linearProject({
        trackerConfig: {
          apiKey: "key",
          triggerStatus: "",
          triggerLabels: ["raw-label"],
        },
      }),
    ]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          identifier: "LIN-10",
          title: "Test",
          state: { name: "" },
          labels: [{ name: "raw-label" }],
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(createDispatch).toHaveBeenCalled();
  });

  it("passes through when triggerStatus is empty string", async () => {
    mockDbSelect.mockResolvedValue([
      linearProject({
        trackerConfig: {
          apiKey: "key",
          triggerStatus: "",
          triggerLabels: [],
        },
      }),
    ]);
    mockDbInsert.mockResolvedValue(undefined);

    vi.mocked(createDispatch).mockResolvedValue({
      id: "d-new",
      agentName: "agent-a",
      machineName: "m1",
      status: "dispatched",
    });

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        data: {
          identifier: "LIN-1",
          title: "Test",
          state: { name: "Any Status" },
          labels: [{ name: "ts" }],
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(createDispatch).toHaveBeenCalled();
  });

  it("handles webhook log insert failure gracefully", async () => {
    mockDbSelect.mockResolvedValue([]); // no project
    mockDbInsert.mockRejectedValue(new Error("DB error")); // log fails

    const res = await webhooksRouter.request(`/api/webhooks/linear/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Issue", data: {} }),
    });
    expect(res.status).toBe(200);
  });
});
