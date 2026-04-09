import { describe, it, expect } from "vitest";
import {
  PriorityEnum,
  DispatchStatusEnum,
  SourceEnum,
  IntegrationTypeEnum,
  TrackerTypeEnum,
  DispatchMessageSchema,
  DispatchSchema,
  LinearConfigSchema,
  WebhookLogEntrySchema,
  AgentSchema,
  ProjectSchema,
  ErrorResponseSchema,
} from "../entities";

// --- Enums ---

describe("PriorityEnum", () => {
  it.each(["low", "medium", "high", "critical"])("accepts '%s'", (val) => {
    expect(PriorityEnum.parse(val)).toBe(val);
  });
  it("rejects invalid value", () => {
    expect(() => PriorityEnum.parse("urgent")).toThrow();
  });
});

describe("DispatchStatusEnum", () => {
  it.each(["dispatched", "running", "completed", "failed"])("accepts '%s'", (val) => {
    expect(DispatchStatusEnum.parse(val)).toBe(val);
  });
  it("rejects invalid value", () => {
    expect(() => DispatchStatusEnum.parse("pending")).toThrow();
  });
});

describe("SourceEnum", () => {
  it.each(["manual", "linear"])("accepts '%s'", (val) => {
    expect(SourceEnum.parse(val)).toBe(val);
  });
  it("rejects invalid value", () => {
    expect(() => SourceEnum.parse("github")).toThrow();
  });
});

describe("IntegrationTypeEnum", () => {
  it("accepts 'linear'", () => {
    expect(IntegrationTypeEnum.parse("linear")).toBe("linear");
  });
  it("rejects invalid value", () => {
    expect(() => IntegrationTypeEnum.parse("jira")).toThrow();
  });
});

describe("TrackerTypeEnum", () => {
  it.each(["linear", "jira"])("accepts '%s'", (val) => {
    expect(TrackerTypeEnum.parse(val)).toBe(val);
  });
  it("rejects invalid value", () => {
    expect(() => TrackerTypeEnum.parse("github")).toThrow();
  });
});

// --- ProjectSchema ---

const validProject = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  organizationId: "org-1",
  name: "My Project",
  slug: "my-project",
  trackerType: "linear",
  trackerConfig: { teamId: "team-1" },
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("ProjectSchema", () => {
  it("validates a valid project", () => {
    const result = ProjectSchema.parse(validProject);
    expect(result.id).toBe(validProject.id);
    expect(result.name).toBe("My Project");
    expect(result.slug).toBe("my-project");
  });

  it("validates with nullable trackerType and trackerConfig", () => {
    const result = ProjectSchema.parse({
      ...validProject,
      trackerType: null,
      trackerConfig: null,
    });
    expect(result.trackerType).toBeNull();
    expect(result.trackerConfig).toBeNull();
  });

  it("rejects invalid uuid", () => {
    expect(() => ProjectSchema.parse({ ...validProject, id: "not-a-uuid" })).toThrow();
  });

  it("rejects invalid trackerType", () => {
    expect(() => ProjectSchema.parse({ ...validProject, trackerType: "github" })).toThrow();
  });

  it("rejects missing name", () => {
    const { name, ...noName } = validProject;
    expect(() => ProjectSchema.parse(noName)).toThrow();
  });

  it("rejects missing slug", () => {
    const { slug, ...noSlug } = validProject;
    expect(() => ProjectSchema.parse(noSlug)).toThrow();
  });
});

// --- DispatchMessageSchema ---

describe("DispatchMessageSchema", () => {
  it("validates a valid message", () => {
    const result = DispatchMessageSchema.parse({
      message: "hello",
      timestamp: "2024-01-01T00:00:00Z",
    });
    expect(result.message).toBe("hello");
  });
  it("rejects missing message", () => {
    expect(() => DispatchMessageSchema.parse({ timestamp: "2024-01-01T00:00:00Z" })).toThrow();
  });
  it("rejects missing timestamp", () => {
    expect(() => DispatchMessageSchema.parse({ message: "hello" })).toThrow();
  });
});

// --- DispatchSchema ---

const validDispatch = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  organizationId: "org-1",
  ticketRef: "TICKET-1",
  title: "Fix bug",
  description: null,
  labels: ["backend"],
  priority: "high",
  agentName: "agent-1",
  machineName: "machine-1",
  createdBy: null,
  source: "manual",
  status: "dispatched",
  exitCode: null,
  durationMs: null,
  messages: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("DispatchSchema", () => {
  it("validates a valid dispatch", () => {
    const result = DispatchSchema.parse(validDispatch);
    expect(result.id).toBe(validDispatch.id);
    expect(result.labels).toEqual(["backend"]);
  });

  it("validates with description and createdBy set", () => {
    const result = DispatchSchema.parse({
      ...validDispatch,
      description: "Some description",
      createdBy: "user-1",
      exitCode: 0,
      durationMs: 5000,
      messages: [{ message: "started", timestamp: "2024-01-01T00:00:00Z" }],
    });
    expect(result.description).toBe("Some description");
    expect(result.createdBy).toBe("user-1");
    expect(result.exitCode).toBe(0);
    expect(result.messages).toHaveLength(1);
  });

  it("rejects invalid uuid", () => {
    expect(() => DispatchSchema.parse({ ...validDispatch, id: "not-a-uuid" })).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => DispatchSchema.parse({ id: "550e8400-e29b-41d4-a716-446655440000" })).toThrow();
  });

  it("rejects invalid priority enum", () => {
    expect(() => DispatchSchema.parse({ ...validDispatch, priority: "urgent" })).toThrow();
  });

  it("rejects invalid status enum", () => {
    expect(() => DispatchSchema.parse({ ...validDispatch, status: "pending" })).toThrow();
  });

  it("rejects invalid source enum", () => {
    expect(() => DispatchSchema.parse({ ...validDispatch, source: "github" })).toThrow();
  });

  it("rejects non-integer exitCode", () => {
    expect(() => DispatchSchema.parse({ ...validDispatch, exitCode: 1.5 })).toThrow();
  });

  it("rejects non-integer durationMs", () => {
    expect(() => DispatchSchema.parse({ ...validDispatch, durationMs: 1.5 })).toThrow();
  });
});

// --- LinearConfigSchema ---

describe("LinearConfigSchema", () => {
  it("validates a valid config", () => {
    const result = LinearConfigSchema.parse({
      apiKey: "lin_key_123",
      triggerStatus: "In Progress",
      triggerLabels: ["bug"],
    });
    expect(result.apiKey).toBe("lin_key_123");
  });

  it("validates with empty triggerLabels", () => {
    const result = LinearConfigSchema.parse({
      apiKey: "key",
      triggerStatus: "status",
      triggerLabels: [],
    });
    expect(result.triggerLabels).toEqual([]);
  });

  it("rejects missing apiKey", () => {
    expect(() =>
      LinearConfigSchema.parse({ triggerStatus: "In Progress", triggerLabels: [] }),
    ).toThrow();
  });

  it("rejects missing triggerStatus", () => {
    expect(() => LinearConfigSchema.parse({ apiKey: "key", triggerLabels: [] })).toThrow();
  });
});

// --- WebhookLogEntrySchema ---

describe("WebhookLogEntrySchema", () => {
  const validEntry = {
    id: 1,
    organizationId: "org-1",
    integration: "linear",
    action: "dispatch_created",
    reason: null,
    payload: { foo: "bar" },
    dispatchId: "550e8400-e29b-41d4-a716-446655440000",
    createdAt: "2024-01-01T00:00:00Z",
  };

  it("validates a valid entry", () => {
    const result = WebhookLogEntrySchema.parse(validEntry);
    expect(result.id).toBe(1);
    expect(result.action).toBe("dispatch_created");
  });

  it("validates with nullable fields set to null", () => {
    const result = WebhookLogEntrySchema.parse({
      ...validEntry,
      reason: null,
      payload: null,
      dispatchId: null,
    });
    expect(result.reason).toBeNull();
    expect(result.payload).toBeNull();
    expect(result.dispatchId).toBeNull();
  });

  it("validates with reason string", () => {
    const result = WebhookLogEntrySchema.parse({ ...validEntry, reason: "no matching label" });
    expect(result.reason).toBe("no matching label");
  });

  it("rejects invalid dispatchId (non-uuid)", () => {
    expect(() => WebhookLogEntrySchema.parse({ ...validEntry, dispatchId: "bad-id" })).toThrow();
  });

  it("rejects missing integration", () => {
    const { integration, ...noIntegration } = validEntry;
    expect(() => WebhookLogEntrySchema.parse(noIntegration)).toThrow();
  });
});

// --- AgentSchema ---

describe("AgentSchema", () => {
  const validAgent = {
    name: "claude-agent",
    machine: "m1",
    tags: ["backend", "python"],
    capacity: 3,
    running: 1,
    lastHeartbeat: "2024-01-01T00:00:00Z",
  };

  it("validates a valid agent", () => {
    const result = AgentSchema.parse(validAgent);
    expect(result.name).toBe("claude-agent");
    expect(result.tags).toEqual(["backend", "python"]);
  });

  it("validates with empty tags", () => {
    const result = AgentSchema.parse({ ...validAgent, tags: [] });
    expect(result.tags).toEqual([]);
  });

  it("rejects non-integer capacity", () => {
    expect(() => AgentSchema.parse({ ...validAgent, capacity: 1.5 })).toThrow();
  });

  it("rejects non-integer running", () => {
    expect(() => AgentSchema.parse({ ...validAgent, running: 0.5 })).toThrow();
  });

  it("rejects missing name", () => {
    const { name, ...noName } = validAgent;
    expect(() => AgentSchema.parse(noName)).toThrow();
  });

  it("rejects missing machine", () => {
    const { machine, ...noMachine } = validAgent;
    expect(() => AgentSchema.parse(noMachine)).toThrow();
  });
});

// --- ErrorResponseSchema ---

describe("ErrorResponseSchema", () => {
  it("validates with error only", () => {
    const result = ErrorResponseSchema.parse({ error: "Something went wrong" });
    expect(result.error).toBe("Something went wrong");
    expect(result.code).toBeUndefined();
  });

  it("validates with optional code", () => {
    const result = ErrorResponseSchema.parse({ error: "Not found", code: "NOT_FOUND" });
    expect(result.code).toBe("NOT_FOUND");
  });

  it("rejects missing error", () => {
    expect(() => ErrorResponseSchema.parse({})).toThrow();
  });

  it("rejects non-string error", () => {
    expect(() => ErrorResponseSchema.parse({ error: 123 })).toThrow();
  });
});
