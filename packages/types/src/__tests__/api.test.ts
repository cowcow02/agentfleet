import { describe, it, expect } from "vitest";
import {
  CreateDispatchRequest,
  CreateDispatchResponse,
  ListDispatchesQuery,
  ListDispatchesResponse,
  DashboardStatsResponse,
  ListAgentsResponse,
  UpdateLinearConfigRequest,
  LinearConfigResponse,
  LinearIssueSchema,
  ListLinearIssuesResponse,
  ListWebhookLogsQuery,
  ListWebhookLogsResponse,
  CreateProjectRequest,
  UpdateProjectRequest,
  ListProjectsQuery,
  ListProjectsResponse,
  ProjectResponse,
} from "../api";

// --- CreateProjectRequest ---

describe("CreateProjectRequest", () => {
  it("validates with name only", () => {
    const result = CreateProjectRequest.parse({ name: "My Project" });
    expect(result.name).toBe("My Project");
    expect(result.slug).toBeUndefined();
  });

  it("validates with all fields", () => {
    const result = CreateProjectRequest.parse({
      name: "My Project",
      slug: "my-project",
      trackerType: "linear",
      trackerConfig: { teamId: "team-1" },
    });
    expect(result.slug).toBe("my-project");
    expect(result.trackerType).toBe("linear");
  });

  it("rejects empty name", () => {
    expect(() => CreateProjectRequest.parse({ name: "" })).toThrow();
  });

  it("rejects invalid trackerType", () => {
    expect(() => CreateProjectRequest.parse({ name: "P", trackerType: "github" })).toThrow();
  });
});

// --- UpdateProjectRequest ---

describe("UpdateProjectRequest", () => {
  it("validates partial update with name only", () => {
    const result = UpdateProjectRequest.parse({ name: "New Name" });
    expect(result.name).toBe("New Name");
  });

  it("validates empty object (no changes)", () => {
    const result = UpdateProjectRequest.parse({});
    expect(result.name).toBeUndefined();
  });

  it("validates trackerType update", () => {
    const result = UpdateProjectRequest.parse({ trackerType: "jira" });
    expect(result.trackerType).toBe("jira");
  });

  it("allows null trackerType to remove tracker", () => {
    const result = UpdateProjectRequest.parse({ trackerType: null });
    expect(result.trackerType).toBeNull();
  });

  it("rejects invalid trackerType", () => {
    expect(() => UpdateProjectRequest.parse({ trackerType: "github" })).toThrow();
  });
});

// --- ListProjectsQuery ---

describe("ListProjectsQuery", () => {
  it("applies defaults for limit and offset", () => {
    const result = ListProjectsQuery.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("coerces string numbers", () => {
    const result = ListProjectsQuery.parse({ limit: "10", offset: "5" });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
  });

  it("rejects limit below 1", () => {
    expect(() => ListProjectsQuery.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit above 100", () => {
    expect(() => ListProjectsQuery.parse({ limit: 101 })).toThrow();
  });
});

// --- ListProjectsResponse ---

describe("ListProjectsResponse", () => {
  it("validates empty projects list", () => {
    const result = ListProjectsResponse.parse({ projects: [], total: 0 });
    expect(result.projects).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// --- ProjectResponse ---

describe("ProjectResponse", () => {
  it("validates a full project response", () => {
    const result = ProjectResponse.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      organizationId: "org-1",
      name: "My Project",
      slug: "my-project",
      trackerType: "linear",
      trackerConfig: { teamId: "t1" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });
    expect(result.name).toBe("My Project");
  });
});

// --- CreateDispatchRequest ---

describe("CreateDispatchRequest", () => {
  it("validates a valid request", () => {
    const result = CreateDispatchRequest.parse({
      ticketRef: "TICKET-1",
      title: "Fix bug",
      labels: ["backend"],
    });
    expect(result.ticketRef).toBe("TICKET-1");
    expect(result.priority).toBe("medium"); // default
  });

  it("applies default priority of medium", () => {
    const result = CreateDispatchRequest.parse({
      ticketRef: "T-1",
      title: "Title",
      labels: ["label"],
    });
    expect(result.priority).toBe("medium");
  });

  it("allows explicit priority", () => {
    const result = CreateDispatchRequest.parse({
      ticketRef: "T-1",
      title: "Title",
      labels: ["label"],
      priority: "critical",
    });
    expect(result.priority).toBe("critical");
  });

  it("allows optional description", () => {
    const result = CreateDispatchRequest.parse({
      ticketRef: "T-1",
      title: "Title",
      labels: ["label"],
      description: "Details here",
    });
    expect(result.description).toBe("Details here");
  });

  it("description is undefined when omitted", () => {
    const result = CreateDispatchRequest.parse({
      ticketRef: "T-1",
      title: "Title",
      labels: ["label"],
    });
    expect(result.description).toBeUndefined();
  });

  it("rejects empty labels array", () => {
    expect(() =>
      CreateDispatchRequest.parse({
        ticketRef: "T-1",
        title: "Title",
        labels: [],
      }),
    ).toThrow("At least one label");
  });

  it("rejects empty ticketRef", () => {
    expect(() =>
      CreateDispatchRequest.parse({
        ticketRef: "",
        title: "Title",
        labels: ["label"],
      }),
    ).toThrow();
  });

  it("rejects empty title", () => {
    expect(() =>
      CreateDispatchRequest.parse({
        ticketRef: "T-1",
        title: "",
        labels: ["label"],
      }),
    ).toThrow();
  });

  it("rejects invalid priority", () => {
    expect(() =>
      CreateDispatchRequest.parse({
        ticketRef: "T-1",
        title: "Title",
        labels: ["label"],
        priority: "urgent",
      }),
    ).toThrow();
  });
});

// --- CreateDispatchResponse ---

describe("CreateDispatchResponse", () => {
  it("validates a valid response", () => {
    const result = CreateDispatchResponse.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      agentName: "agent-1",
      machineName: "m1",
      status: "dispatched",
    });
    expect(result.status).toBe("dispatched");
  });

  it("rejects invalid uuid", () => {
    expect(() =>
      CreateDispatchResponse.parse({
        id: "bad",
        agentName: "agent-1",
        machineName: "m1",
        status: "dispatched",
      }),
    ).toThrow();
  });
});

// --- ListDispatchesQuery ---

describe("ListDispatchesQuery", () => {
  it("applies defaults for limit and offset", () => {
    const result = ListDispatchesQuery.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("coerces string numbers for limit and offset", () => {
    const result = ListDispatchesQuery.parse({ limit: "10", offset: "5" });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
  });

  it("accepts optional status filter", () => {
    const result = ListDispatchesQuery.parse({ status: "running" });
    expect(result.status).toBe("running");
  });

  it("accepts optional source filter", () => {
    const result = ListDispatchesQuery.parse({ source: "linear" });
    expect(result.source).toBe("linear");
  });

  it("accepts optional agent filter", () => {
    const result = ListDispatchesQuery.parse({ agent: "my-agent" });
    expect(result.agent).toBe("my-agent");
  });

  it("rejects limit below 1", () => {
    expect(() => ListDispatchesQuery.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit above 100", () => {
    expect(() => ListDispatchesQuery.parse({ limit: 101 })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => ListDispatchesQuery.parse({ offset: -1 })).toThrow();
  });
});

// --- ListDispatchesResponse ---

describe("ListDispatchesResponse", () => {
  it("validates a valid response with empty dispatches", () => {
    const result = ListDispatchesResponse.parse({ dispatches: [], total: 0 });
    expect(result.dispatches).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// --- DashboardStatsResponse ---

describe("DashboardStatsResponse", () => {
  const validStats = {
    machinesOnline: 2,
    agentsRegistered: 5,
    runningJobs: 3,
    totalDispatches: 100,
    completed: 90,
    failed: 10,
    avgDurationSeconds: 45.5,
    totalAgentSeconds: 4550,
  };

  it("validates a full stats object", () => {
    const result = DashboardStatsResponse.parse(validStats);
    expect(result.machinesOnline).toBe(2);
    expect(result.avgDurationSeconds).toBe(45.5);
  });

  it("rejects missing fields", () => {
    expect(() => DashboardStatsResponse.parse({ machinesOnline: 1 })).toThrow();
  });

  it("rejects non-number values", () => {
    expect(() => DashboardStatsResponse.parse({ ...validStats, machinesOnline: "two" })).toThrow();
  });
});

// --- ListAgentsResponse ---

describe("ListAgentsResponse", () => {
  it("validates a valid response", () => {
    const result = ListAgentsResponse.parse({
      agents: [
        {
          name: "a1",
          machine: "m1",
          tags: [],
          capacity: 1,
          running: 0,
          lastHeartbeat: "2024-01-01T00:00:00Z",
        },
      ],
      machinesOnline: 1,
    });
    expect(result.agents).toHaveLength(1);
  });

  it("validates empty agents list", () => {
    const result = ListAgentsResponse.parse({ agents: [], machinesOnline: 0 });
    expect(result.agents).toEqual([]);
  });
});

// --- UpdateLinearConfigRequest ---

describe("UpdateLinearConfigRequest", () => {
  it("validates a valid request", () => {
    const result = UpdateLinearConfigRequest.parse({
      apiKey: "lin_key",
      triggerStatus: "In Progress",
      triggerLabels: ["bug"],
    });
    expect(result.apiKey).toBe("lin_key");
  });

  it("applies default empty array for triggerLabels", () => {
    const result = UpdateLinearConfigRequest.parse({
      apiKey: "key",
      triggerStatus: "status",
    });
    expect(result.triggerLabels).toEqual([]);
  });

  it("rejects empty apiKey", () => {
    expect(() =>
      UpdateLinearConfigRequest.parse({
        apiKey: "",
        triggerStatus: "status",
      }),
    ).toThrow();
  });

  it("rejects empty triggerStatus", () => {
    expect(() =>
      UpdateLinearConfigRequest.parse({
        apiKey: "key",
        triggerStatus: "",
      }),
    ).toThrow();
  });
});

// --- LinearConfigResponse ---

describe("LinearConfigResponse", () => {
  it("validates configured response", () => {
    const result = LinearConfigResponse.parse({
      configured: true,
      triggerStatus: "In Progress",
      triggerLabels: ["bug"],
      webhookUrl: "https://example.com/webhook",
    });
    expect(result.configured).toBe(true);
  });

  it("validates unconfigured response with minimal fields", () => {
    const result = LinearConfigResponse.parse({ configured: false });
    expect(result.triggerStatus).toBeUndefined();
  });
});

// --- LinearIssueSchema ---

describe("LinearIssueSchema", () => {
  it("validates a valid issue", () => {
    const result = LinearIssueSchema.parse({
      identifier: "LIN-1",
      title: "Bug fix",
      description: "Details",
      state: "In Progress",
      labels: ["bug"],
      priority: 2,
      assignee: "user-1",
      url: "https://linear.app/issue/LIN-1",
    });
    expect(result.identifier).toBe("LIN-1");
  });

  it("validates with nullable fields as null", () => {
    const result = LinearIssueSchema.parse({
      identifier: "LIN-1",
      title: "Bug fix",
      description: null,
      state: "Backlog",
      labels: [],
      priority: null,
      assignee: null,
      url: "https://linear.app/issue/LIN-1",
    });
    expect(result.description).toBeNull();
    expect(result.priority).toBeNull();
    expect(result.assignee).toBeNull();
  });
});

// --- ListLinearIssuesResponse ---

describe("ListLinearIssuesResponse", () => {
  it("validates with empty issues", () => {
    const result = ListLinearIssuesResponse.parse({ issues: [] });
    expect(result.issues).toEqual([]);
  });
});

// --- ListWebhookLogsQuery ---

describe("ListWebhookLogsQuery", () => {
  it("applies defaults for limit and offset", () => {
    const result = ListWebhookLogsQuery.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("coerces string numbers", () => {
    const result = ListWebhookLogsQuery.parse({ limit: "25", offset: "10" });
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(10);
  });

  it("rejects limit below 1", () => {
    expect(() => ListWebhookLogsQuery.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit above 100", () => {
    expect(() => ListWebhookLogsQuery.parse({ limit: 101 })).toThrow();
  });
});

// --- ListWebhookLogsResponse ---

describe("ListWebhookLogsResponse", () => {
  it("validates valid response", () => {
    const result = ListWebhookLogsResponse.parse({ logs: [], total: 0 });
    expect(result.total).toBe(0);
  });
});
