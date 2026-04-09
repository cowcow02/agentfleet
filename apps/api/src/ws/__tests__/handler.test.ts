import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth
vi.mock("../../auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock machines
vi.mock("../../lib/machines", () => ({
  registerMachine: vi.fn(),
  removeMachine: vi.fn(),
  updateHeartbeat: vi.fn(),
  getMachineByWs: vi.fn(),
  getAgentsForOrg: vi.fn().mockReturnValue([]),
  getMachineCountForOrg: vi.fn().mockReturnValue(0),
}));

// Mock dispatch
vi.mock("../../lib/dispatch", () => ({
  appendDispatchMessage: vi.fn(),
  appendTranscriptEvent: vi.fn(),
  completeDispatch: vi.fn(),
}));

// Mock events
vi.mock("../../lib/events", () => ({
  eventBus: {
    emitAgentUpdate: vi.fn(),
    emitDispatchUpdate: vi.fn(),
    emitFeedEvent: vi.fn(),
    emitTranscriptEvent: vi.fn(),
  },
}));

import { createWsHandler } from "../handler";
import { auth } from "../../auth";
import {
  registerMachine,
  removeMachine,
  updateHeartbeat,
  getMachineByWs,
} from "../../lib/machines";
import { appendDispatchMessage, appendTranscriptEvent, completeDispatch } from "../../lib/dispatch";
import { eventBus } from "../../lib/events";

// Helper to create mock WebSocket with event handlers
function createMockWs() {
  const handlers: Record<string, Function[]> = {};
  const ws: any = {
    readyState: 1,
    OPEN: 1,
    send: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    close: vi.fn(),
  };
  return {
    ws,
    handlers,
    emit(event: string, ...args: any[]) {
      (handlers[event] || []).forEach((h) => h(...args));
    },
  };
}

function createMockSocket() {
  return {
    write: vi.fn(),
    destroy: vi.fn(),
  };
}

function createMockWss() {
  const connections: { ws: any; req: any }[] = [];
  return {
    handleUpgrade: vi.fn((req: any, socket: any, head: any, cb: Function) => {
      const { ws } = createMockWs();
      cb(ws);
    }),
    emit: vi.fn(),
    _connections: connections,
  };
}

describe("WebSocket handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleUpgrade (auth)", () => {
    it("rejects connection without Authorization header", async () => {
      const wss = createMockWss();
      const handler = createWsHandler(wss as any);
      const socket = createMockSocket();

      await handler({ headers: {} } as any, socket as any, Buffer.alloc(0));

      expect(socket.write).toHaveBeenCalledWith("HTTP/1.1 401 Unauthorized\r\n\r\n");
      expect(socket.destroy).toHaveBeenCalled();
    });

    it("rejects connection without Bearer prefix", async () => {
      const wss = createMockWss();
      const handler = createWsHandler(wss as any);
      const socket = createMockSocket();

      await handler(
        { headers: { authorization: "Basic abc" } } as any,
        socket as any,
        Buffer.alloc(0),
      );

      expect(socket.write).toHaveBeenCalledWith("HTTP/1.1 401 Unauthorized\r\n\r\n");
    });

    it("rejects when session lookup returns null", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const wss = createMockWss();
      const handler = createWsHandler(wss as any);
      const socket = createMockSocket();

      await handler(
        { headers: { authorization: "Bearer token123" } } as any,
        socket as any,
        Buffer.alloc(0),
      );

      expect(socket.write).toHaveBeenCalledWith("HTTP/1.1 401 Unauthorized\r\n\r\n");
    });

    it("rejects when session has no activeOrganizationId", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "u1" },
        session: {},
      } as any);

      const wss = createMockWss();
      const handler = createWsHandler(wss as any);
      const socket = createMockSocket();

      await handler(
        { headers: { authorization: "Bearer token123" } } as any,
        socket as any,
        Buffer.alloc(0),
      );

      expect(socket.write).toHaveBeenCalledWith("HTTP/1.1 401 Unauthorized\r\n\r\n");
    });

    it("rejects when getSession throws an error", async () => {
      vi.mocked(auth.api.getSession).mockRejectedValue(new Error("auth service down"));

      const wss = createMockWss();
      const handler = createWsHandler(wss as any);
      const socket = createMockSocket();

      await handler(
        { headers: { authorization: "Bearer token123" } } as any,
        socket as any,
        Buffer.alloc(0),
      );

      expect(socket.write).toHaveBeenCalledWith("HTTP/1.1 401 Unauthorized\r\n\r\n");
      expect(socket.destroy).toHaveBeenCalled();
    });

    it("accepts valid session and completes upgrade", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "u1" },
        session: { activeOrganizationId: "org-1" },
      } as any);

      const mockWsInstance = createMockWs();
      const wss = {
        handleUpgrade: vi.fn((req: any, socket: any, head: any, cb: Function) => {
          cb(mockWsInstance.ws);
        }),
        emit: vi.fn(),
      };

      const handler = createWsHandler(wss as any);
      const socket = createMockSocket();

      await handler(
        { headers: { authorization: "Bearer valid-token" } } as any,
        socket as any,
        Buffer.alloc(0),
      );

      expect(wss.handleUpgrade).toHaveBeenCalled();
      expect(wss.emit).toHaveBeenCalledWith("connection", mockWsInstance.ws, expect.anything());
    });
  });

  describe("handleConnection message handling", () => {
    // Helper to get a connected WS with message handlers
    async function connectWs() {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "u1" },
        session: { activeOrganizationId: "org-1" },
      } as any);

      const mockWsInstance = createMockWs();
      const wss = {
        handleUpgrade: vi.fn((req: any, socket: any, head: any, cb: Function) => {
          cb(mockWsInstance.ws);
        }),
        emit: vi.fn(),
      };

      const handler = createWsHandler(wss as any);
      const socket = createMockSocket();

      await handler(
        { headers: { authorization: "Bearer token" } } as any,
        socket as any,
        Buffer.alloc(0),
      );

      return mockWsInstance;
    }

    it("handles register message", async () => {
      const { ws, emit } = await connectWs();

      emit(
        "message",
        JSON.stringify({
          type: "register",
          machine: "m1",
          agents: [{ name: "a1", tags: ["ts"], capacity: 2 }],
        }),
      );

      // Need to wait for async handler
      await vi.waitFor(() => {
        expect(registerMachine).toHaveBeenCalledWith("org-1", "m1", ws, [
          { name: "a1", tags: ["ts"], capacity: 2 },
        ]);
      });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "registered", machine: "m1", agents: 1 }),
      );
    });

    it("handles heartbeat message", async () => {
      const { emit } = await connectWs();

      // Must register first to set machineName
      emit(
        "message",
        JSON.stringify({
          type: "register",
          machine: "m1",
          agents: [{ name: "a1", tags: ["ts"], capacity: 1 }],
        }),
      );

      await vi.waitFor(() => {
        expect(registerMachine).toHaveBeenCalled();
      });

      vi.clearAllMocks();
      emit("message", JSON.stringify({ type: "heartbeat" }));

      await vi.waitFor(() => {
        expect(updateHeartbeat).toHaveBeenCalledWith("org-1", "m1");
      });
    });

    it("handles status message", async () => {
      const { ws, emit } = await connectWs();

      emit(
        "message",
        JSON.stringify({
          type: "status",
          dispatch_id: "d-1",
          message: "Running step 1",
          timestamp: "2024-01-01T00:00:00Z",
        }),
      );

      await vi.waitFor(() => {
        expect(appendDispatchMessage).toHaveBeenCalledWith(
          "d-1",
          "Running step 1",
          "2024-01-01T00:00:00Z",
        );
      });

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ack", dispatch_id: "d-1" }));
    });

    it("handles telemetry message", async () => {
      const { ws, emit } = await connectWs();

      emit(
        "message",
        JSON.stringify({
          type: "telemetry",
          dispatch_id: "d-1",
          session_id: "sess-abc",
          event_type: "tool_call",
          data: { name: "Read", input: { file_path: "/foo" } },
          timestamp: "2024-01-01T00:00:00Z",
        }),
      );

      await vi.waitFor(() => {
        expect(appendTranscriptEvent).toHaveBeenCalledWith(
          "d-1",
          "org-1",
          "sess-abc",
          "tool_call",
          { name: "Read", input: { file_path: "/foo" } },
          "2024-01-01T00:00:00Z",
        );
      });

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ack", dispatch_id: "d-1" }));
    });

    it("handles complete message with duration conversion", async () => {
      const { ws, emit } = await connectWs();

      vi.mocked(getMachineByWs).mockReturnValue({
        orgId: "org-1",
        name: "m1",
        ws,
        agents: new Map([["a1", { name: "a1", tags: ["ts"], capacity: 2, running: 1 }]]),
        lastHeartbeat: new Date(),
      } as any);

      emit(
        "message",
        JSON.stringify({
          type: "complete",
          dispatch_id: "d-1",
          success: true,
          exit_code: 0,
          duration_seconds: 5.5,
        }),
      );

      await vi.waitFor(() => {
        expect(completeDispatch).toHaveBeenCalledWith("d-1", true, 0, 5.5);
      });

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ack", dispatch_id: "d-1" }));
    });

    it("decrements agent running count on complete", async () => {
      const { ws, emit } = await connectWs();

      const agent = { name: "a1", tags: ["ts"], capacity: 2, running: 1 };
      vi.mocked(getMachineByWs).mockReturnValue({
        orgId: "org-1",
        name: "m1",
        ws,
        agents: new Map([["a1", agent]]),
        lastHeartbeat: new Date(),
      } as any);

      emit(
        "message",
        JSON.stringify({
          type: "complete",
          dispatch_id: "d-1",
          success: true,
          exit_code: 0,
          duration_seconds: 1,
        }),
      );

      await vi.waitFor(() => {
        expect(agent.running).toBe(0);
      });

      expect(eventBus.emitAgentUpdate).toHaveBeenCalled();
    });

    it("sends error for invalid JSON", async () => {
      const { ws, emit } = await connectWs();

      emit("message", "not-json{{{");

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalledWith(
          JSON.stringify({ type: "error", message: "Invalid JSON" }),
        );
      });
    });

    it("sends error for invalid message schema", async () => {
      const { ws, emit } = await connectWs();

      emit("message", JSON.stringify({ type: "unknown_type" }));

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
      });
    });

    it("ignores heartbeat when not registered (machineName is null)", async () => {
      const { emit } = await connectWs();

      // Send heartbeat without registering first
      emit("message", JSON.stringify({ type: "heartbeat" }));

      // Wait a tick
      await vi.waitFor(() => {
        // updateHeartbeat should NOT be called since machineName is null
        expect(updateHeartbeat).not.toHaveBeenCalled();
      });
    });

    it("handles complete when getMachineByWs returns null", async () => {
      const { ws, emit } = await connectWs();

      vi.mocked(getMachineByWs).mockReturnValue(undefined);

      emit(
        "message",
        JSON.stringify({
          type: "complete",
          dispatch_id: "d-1",
          success: true,
          exit_code: 0,
          duration_seconds: 1.0,
        }),
      );

      await vi.waitFor(() => {
        expect(completeDispatch).toHaveBeenCalledWith("d-1", true, 0, 1.0);
      });

      // emitAgentUpdate should NOT be called since there's no machine
      expect(eventBus.emitAgentUpdate).not.toHaveBeenCalled();
    });

    it("handles ws error event", async () => {
      const { emit } = await connectWs();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      emit("error", new Error("connection reset"));

      expect(consoleSpy).toHaveBeenCalledWith("[WS] Error:", "connection reset");
      consoleSpy.mockRestore();
    });

    it("does not call removeMachine on close if not registered", async () => {
      const { emit } = await connectWs();

      emit("close");

      expect(removeMachine).not.toHaveBeenCalled();
    });

    it("removes machine on close", async () => {
      const { emit } = await connectWs();

      // Register first
      emit(
        "message",
        JSON.stringify({
          type: "register",
          machine: "m1",
          agents: [{ name: "a1", tags: ["ts"], capacity: 1 }],
        }),
      );

      await vi.waitFor(() => {
        expect(registerMachine).toHaveBeenCalled();
      });

      vi.clearAllMocks();
      emit("close");

      expect(removeMachine).toHaveBeenCalledWith("org-1", "m1");
    });
  });
});
