import { describe, it, expect } from "vitest";
import {
  AgentUpdateEvent,
  DispatchUpdateEvent,
  FeedEvent,
  SseEvent,
} from "../sse";

// --- AgentUpdateEvent ---

describe("AgentUpdateEvent", () => {
  const validAgent = {
    name: "a1",
    machine: "m1",
    tags: ["backend"],
    capacity: 3,
    running: 1,
    lastHeartbeat: "2024-01-01T00:00:00Z",
  };

  it("validates a valid agent update event", () => {
    const result = AgentUpdateEvent.parse({
      event: "agent:update",
      data: { agents: [validAgent], machines: 1 },
    });
    expect(result.event).toBe("agent:update");
    expect(result.data.agents).toHaveLength(1);
    expect(result.data.machines).toBe(1);
  });

  it("validates with empty agents array", () => {
    const result = AgentUpdateEvent.parse({
      event: "agent:update",
      data: { agents: [], machines: 0 },
    });
    expect(result.data.agents).toEqual([]);
  });

  it("rejects wrong event literal", () => {
    expect(() =>
      AgentUpdateEvent.parse({
        event: "dispatch:update",
        data: { agents: [], machines: 0 },
      })
    ).toThrow();
  });

  it("rejects missing machines count", () => {
    expect(() =>
      AgentUpdateEvent.parse({
        event: "agent:update",
        data: { agents: [] },
      })
    ).toThrow();
  });
});

// --- DispatchUpdateEvent ---

describe("DispatchUpdateEvent", () => {
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

  it("validates a valid dispatch update event", () => {
    const result = DispatchUpdateEvent.parse({
      event: "dispatch:update",
      data: { dispatch: validDispatch },
    });
    expect(result.event).toBe("dispatch:update");
    expect(result.data.dispatch.id).toBe(validDispatch.id);
  });

  it("rejects wrong event literal", () => {
    expect(() =>
      DispatchUpdateEvent.parse({
        event: "agent:update",
        data: { dispatch: validDispatch },
      })
    ).toThrow();
  });

  it("rejects missing dispatch in data", () => {
    expect(() =>
      DispatchUpdateEvent.parse({
        event: "dispatch:update",
        data: {},
      })
    ).toThrow();
  });
});

// --- FeedEvent ---

describe("FeedEvent", () => {
  it("validates a valid feed event", () => {
    const result = FeedEvent.parse({
      event: "feed:event",
      data: { message: "Agent started", timestamp: "2024-01-01T00:00:00Z", type: "info" },
    });
    expect(result.event).toBe("feed:event");
    expect(result.data.message).toBe("Agent started");
  });

  it("rejects missing type in data", () => {
    expect(() =>
      FeedEvent.parse({
        event: "feed:event",
        data: { message: "msg", timestamp: "2024-01-01T00:00:00Z" },
      })
    ).toThrow();
  });

  it("rejects wrong event literal", () => {
    expect(() =>
      FeedEvent.parse({
        event: "agent:update",
        data: { message: "msg", timestamp: "2024-01-01T00:00:00Z", type: "info" },
      })
    ).toThrow();
  });
});

// --- SseEvent discriminated union ---

describe("SseEvent", () => {
  it("parses agent:update event", () => {
    const result = SseEvent.parse({
      event: "agent:update",
      data: { agents: [], machines: 0 },
    });
    expect(result.event).toBe("agent:update");
  });

  it("parses dispatch:update event", () => {
    const result = SseEvent.parse({
      event: "dispatch:update",
      data: {
        dispatch: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          organizationId: "org-1",
          ticketRef: "T-1",
          title: "T",
          description: null,
          labels: [],
          priority: "low",
          agentName: "a",
          machineName: "m",
          createdBy: null,
          source: "manual",
          status: "completed",
          exitCode: 0,
          durationMs: 1000,
          messages: [],
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      },
    });
    expect(result.event).toBe("dispatch:update");
  });

  it("parses feed:event", () => {
    const result = SseEvent.parse({
      event: "feed:event",
      data: { message: "hello", timestamp: "2024-01-01T00:00:00Z", type: "info" },
    });
    expect(result.event).toBe("feed:event");
  });

  it("rejects invalid event type", () => {
    expect(() =>
      SseEvent.parse({
        event: "invalid:event",
        data: {},
      })
    ).toThrow();
  });

  it("rejects missing event field", () => {
    expect(() => SseEvent.parse({ data: {} })).toThrow();
  });
});
