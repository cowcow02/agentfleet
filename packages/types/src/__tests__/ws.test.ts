import { describe, it, expect } from "vitest";
import {
  RegisterMessage,
  HeartbeatMessage,
  StatusMessage,
  CompleteMessage,
  TelemetryMessage,
  DaemonMessage,
  DispatchCommand,
  RegisteredResponse,
  ErrorWsMessage,
  AckMessage,
  HubMessage,
} from "../ws";

// --- RegisterMessage ---

describe("RegisterMessage", () => {
  it("validates a valid register message", () => {
    const result = RegisterMessage.parse({
      type: "register",
      machine: "m1",
      agents: [{ name: "a1", tags: ["backend"], capacity: 3 }],
    });
    expect(result.type).toBe("register");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].capacity).toBe(3);
  });

  it("validates with multiple agents", () => {
    const result = RegisterMessage.parse({
      type: "register",
      machine: "m1",
      agents: [
        { name: "a1", tags: [], capacity: 1 },
        { name: "a2", tags: ["python"], capacity: 5 },
      ],
    });
    expect(result.agents).toHaveLength(2);
  });

  it("validates with empty agents array", () => {
    const result = RegisterMessage.parse({
      type: "register",
      machine: "m1",
      agents: [],
    });
    expect(result.agents).toEqual([]);
  });

  it("rejects zero capacity", () => {
    expect(() =>
      RegisterMessage.parse({
        type: "register",
        machine: "m1",
        agents: [{ name: "a1", tags: [], capacity: 0 }],
      }),
    ).toThrow();
  });

  it("rejects negative capacity", () => {
    expect(() =>
      RegisterMessage.parse({
        type: "register",
        machine: "m1",
        agents: [{ name: "a1", tags: [], capacity: -1 }],
      }),
    ).toThrow();
  });

  it("rejects non-integer capacity", () => {
    expect(() =>
      RegisterMessage.parse({
        type: "register",
        machine: "m1",
        agents: [{ name: "a1", tags: [], capacity: 1.5 }],
      }),
    ).toThrow();
  });

  it("rejects wrong type literal", () => {
    expect(() =>
      RegisterMessage.parse({
        type: "heartbeat",
        machine: "m1",
        agents: [],
      }),
    ).toThrow();
  });
});

// --- HeartbeatMessage ---

describe("HeartbeatMessage", () => {
  it("validates a valid heartbeat", () => {
    const result = HeartbeatMessage.parse({ type: "heartbeat" });
    expect(result.type).toBe("heartbeat");
  });

  it("rejects wrong type", () => {
    expect(() => HeartbeatMessage.parse({ type: "register" })).toThrow();
  });
});

// --- StatusMessage ---

describe("StatusMessage", () => {
  it("validates a valid status message", () => {
    const result = StatusMessage.parse({
      type: "status",
      dispatch_id: "d-1",
      timestamp: "2024-01-01T00:00:00Z",
      message: "Running step 1",
    });
    expect(result.dispatch_id).toBe("d-1");
  });

  it("rejects missing dispatch_id", () => {
    expect(() =>
      StatusMessage.parse({
        type: "status",
        timestamp: "2024-01-01T00:00:00Z",
        message: "msg",
      }),
    ).toThrow();
  });
});

// --- CompleteMessage ---

describe("CompleteMessage", () => {
  it("validates a valid complete message", () => {
    const result = CompleteMessage.parse({
      type: "complete",
      dispatch_id: "d-1",
      success: true,
      exit_code: 0,
      duration_seconds: 42.5,
    });
    expect(result.success).toBe(true);
    expect(result.duration_seconds).toBe(42.5);
  });

  it("accepts float duration_seconds", () => {
    const result = CompleteMessage.parse({
      type: "complete",
      dispatch_id: "d-1",
      success: false,
      exit_code: 1,
      duration_seconds: 0.001,
    });
    expect(result.duration_seconds).toBe(0.001);
  });

  it("rejects non-integer exit_code", () => {
    expect(() =>
      CompleteMessage.parse({
        type: "complete",
        dispatch_id: "d-1",
        success: true,
        exit_code: 1.5,
        duration_seconds: 10,
      }),
    ).toThrow();
  });

  it("rejects missing success", () => {
    expect(() =>
      CompleteMessage.parse({
        type: "complete",
        dispatch_id: "d-1",
        exit_code: 0,
        duration_seconds: 10,
      }),
    ).toThrow();
  });
});

// --- TelemetryMessage ---

describe("TelemetryMessage", () => {
  const validTelemetry = {
    type: "telemetry" as const,
    dispatch_id: "d-1",
    session_id: "sess-abc",
    event_type: "assistant" as const,
    data: { content: [{ type: "text", text: "hello" }] },
    timestamp: "2024-01-01T00:00:00Z",
  };

  it("validates a valid telemetry message", () => {
    const result = TelemetryMessage.parse(validTelemetry);
    expect(result.type).toBe("telemetry");
    expect(result.event_type).toBe("assistant");
    expect(result.session_id).toBe("sess-abc");
  });

  it("validates all event types", () => {
    for (const eventType of [
      "user",
      "assistant",
      "attachment",
      "tool_call",
      "tool_result",
      "usage",
    ]) {
      const result = TelemetryMessage.parse({ ...validTelemetry, event_type: eventType });
      expect(result.event_type).toBe(eventType);
    }
  });

  it("rejects invalid event_type", () => {
    expect(() => TelemetryMessage.parse({ ...validTelemetry, event_type: "unknown" })).toThrow();
  });

  it("rejects missing dispatch_id", () => {
    const { dispatch_id, ...rest } = validTelemetry;
    expect(() => TelemetryMessage.parse(rest)).toThrow();
  });

  it("rejects missing session_id", () => {
    const { session_id, ...rest } = validTelemetry;
    expect(() => TelemetryMessage.parse(rest)).toThrow();
  });

  it("rejects missing data", () => {
    const { data, ...rest } = validTelemetry;
    expect(() => TelemetryMessage.parse(rest)).toThrow();
  });

  it("accepts empty data object", () => {
    const result = TelemetryMessage.parse({ ...validTelemetry, data: {} });
    expect(result.data).toEqual({});
  });

  it("accepts nested data objects", () => {
    const result = TelemetryMessage.parse({
      ...validTelemetry,
      data: {
        tool_name: "Read",
        input: { file_path: "/foo/bar.ts" },
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });
    expect(result.data.tool_name).toBe("Read");
  });
});

// --- DaemonMessage discriminated union ---

describe("DaemonMessage", () => {
  it("parses register message", () => {
    const result = DaemonMessage.parse({
      type: "register",
      machine: "m1",
      agents: [],
    });
    expect(result.type).toBe("register");
  });

  it("parses heartbeat message", () => {
    const result = DaemonMessage.parse({ type: "heartbeat" });
    expect(result.type).toBe("heartbeat");
  });

  it("parses status message", () => {
    const result = DaemonMessage.parse({
      type: "status",
      dispatch_id: "d-1",
      timestamp: "2024-01-01T00:00:00Z",
      message: "msg",
    });
    expect(result.type).toBe("status");
  });

  it("parses complete message", () => {
    const result = DaemonMessage.parse({
      type: "complete",
      dispatch_id: "d-1",
      success: true,
      exit_code: 0,
      duration_seconds: 5,
    });
    expect(result.type).toBe("complete");
  });

  it("parses telemetry message", () => {
    const result = DaemonMessage.parse({
      type: "telemetry",
      dispatch_id: "d-1",
      session_id: "sess-1",
      event_type: "tool_call",
      data: { name: "Read" },
      timestamp: "2024-01-01T00:00:00Z",
    });
    expect(result.type).toBe("telemetry");
  });

  it("rejects unknown message type", () => {
    expect(() => DaemonMessage.parse({ type: "unknown" })).toThrow();
  });

  it("rejects missing type", () => {
    expect(() => DaemonMessage.parse({ machine: "m1" })).toThrow();
  });
});

// --- DispatchCommand ---

describe("DispatchCommand", () => {
  const validDispatchCmd = {
    type: "dispatch" as const,
    dispatch_id: "d-1",
    agent: "agent-1",
    ticket: {
      id: "T-1",
      title: "Fix bug",
      labels: ["backend"],
      priority: "high",
    },
  };

  it("validates a valid dispatch command", () => {
    const result = DispatchCommand.parse(validDispatchCmd);
    expect(result.type).toBe("dispatch");
    expect(result.ticket.title).toBe("Fix bug");
  });

  it("validates with optional description", () => {
    const result = DispatchCommand.parse({
      ...validDispatchCmd,
      ticket: { ...validDispatchCmd.ticket, description: "Details" },
    });
    expect(result.ticket.description).toBe("Details");
  });

  it("description is undefined when omitted", () => {
    const result = DispatchCommand.parse(validDispatchCmd);
    expect(result.ticket.description).toBeUndefined();
  });

  it("rejects missing ticket", () => {
    expect(() =>
      DispatchCommand.parse({ type: "dispatch", dispatch_id: "d-1", agent: "a1" }),
    ).toThrow();
  });
});

// --- RegisteredResponse ---

describe("RegisteredResponse", () => {
  it("validates a valid response", () => {
    const result = RegisteredResponse.parse({
      type: "registered",
      machine: "m1",
      agents: 3,
    });
    expect(result.agents).toBe(3);
  });

  it("rejects non-number agents", () => {
    expect(() =>
      RegisteredResponse.parse({ type: "registered", machine: "m1", agents: "three" }),
    ).toThrow();
  });
});

// --- ErrorWsMessage ---

describe("ErrorWsMessage", () => {
  it("validates a valid error message", () => {
    const result = ErrorWsMessage.parse({ type: "error", message: "Bad request" });
    expect(result.message).toBe("Bad request");
  });

  it("rejects missing message", () => {
    expect(() => ErrorWsMessage.parse({ type: "error" })).toThrow();
  });
});

// --- AckMessage ---

describe("AckMessage", () => {
  it("validates a valid ack", () => {
    const result = AckMessage.parse({ type: "ack", dispatch_id: "d-1" });
    expect(result.dispatch_id).toBe("d-1");
  });

  it("rejects missing dispatch_id", () => {
    expect(() => AckMessage.parse({ type: "ack" })).toThrow();
  });
});

// --- HubMessage discriminated union ---

describe("HubMessage", () => {
  it("parses dispatch command", () => {
    const result = HubMessage.parse({
      type: "dispatch",
      dispatch_id: "d-1",
      agent: "a1",
      ticket: { id: "T-1", title: "T", labels: [], priority: "low" },
    });
    expect(result.type).toBe("dispatch");
  });

  it("parses registered response", () => {
    const result = HubMessage.parse({ type: "registered", machine: "m1", agents: 2 });
    expect(result.type).toBe("registered");
  });

  it("parses error message", () => {
    const result = HubMessage.parse({ type: "error", message: "fail" });
    expect(result.type).toBe("error");
  });

  it("parses ack message", () => {
    const result = HubMessage.parse({ type: "ack", dispatch_id: "d-1" });
    expect(result.type).toBe("ack");
  });

  it("rejects unknown message type", () => {
    expect(() => HubMessage.parse({ type: "unknown" })).toThrow();
  });
});
