import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

vi.mock("@agentfleet/db", () => {
  const dispatches = { id: "dispatches", organizationId: "org_id", status: "status" };
  return {
    db: {
      insert: () => ({ values: (v: any) => ({ returning: () => mockInsert(v) }) }),
      update: () => ({ set: (v: any) => ({ where: (w: any) => mockUpdate(v, w) }) }),
      select: () => ({ from: () => ({ where: (w: any) => ({ limit: () => mockSelect(w) }) }) }),
    },
    dispatches,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    and: vi.fn((...args: any[]) => ({ _and: args })),
  };
});

// Mock machines
vi.mock("../machines", () => ({
  findAgentForDispatch: vi.fn(),
}));

// Mock events
vi.mock("../events", () => ({
  eventBus: {
    emitDispatchUpdate: vi.fn(),
    emitFeedEvent: vi.fn(),
    emitAgentUpdate: vi.fn(),
  },
}));

import {
  createDispatch,
  completeDispatch,
  appendDispatchMessage,
  serializeDispatch,
} from "../dispatch";
import { findAgentForDispatch } from "../machines";
import { eventBus } from "../events";

const now = new Date("2024-06-01T12:00:00Z");

function makeFakeDispatchRow(overrides: Record<string, any> = {}) {
  return {
    id: "d-123",
    organizationId: "org1",
    ticketRef: "TICK-1",
    title: "Fix bug",
    description: "desc",
    labels: ["ts"],
    priority: "medium",
    agentName: "agent-a",
    machineName: "m1",
    createdBy: "user1",
    source: "manual",
    status: "dispatched",
    exitCode: null,
    durationMs: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createDispatch", () => {
    it("finds agent, inserts row, sends WS message, emits event", async () => {
      const ws = { send: vi.fn() };
      const agent = { name: "agent-a", tags: ["ts"], capacity: 2, running: 0 };
      const machine = { name: "m1", ws, orgId: "org1", agents: new Map() };
      vi.mocked(findAgentForDispatch).mockReturnValue({ agent, machine: machine as any });

      const fakeRow = makeFakeDispatchRow();
      mockInsert.mockResolvedValue([fakeRow]);

      const result = await createDispatch(
        "org1",
        {
          ticketRef: "TICK-1",
          title: "Fix bug",
          description: "desc",
          labels: ["ts"],
          priority: "medium",
        },
        "manual",
        "user1",
      );

      expect(findAgentForDispatch).toHaveBeenCalledWith("org1", ["ts"]);
      expect(mockInsert).toHaveBeenCalled();
      expect(ws.send).toHaveBeenCalled();
      expect(agent.running).toBe(1);
      expect(eventBus.emitDispatchUpdate).toHaveBeenCalled();
      expect(eventBus.emitFeedEvent).toHaveBeenCalled();

      expect(result).toEqual({
        id: "d-123",
        agentName: "agent-a",
        machineName: "m1",
        status: "dispatched",
      });
    });

    it("returns error when no matching agent found", async () => {
      vi.mocked(findAgentForDispatch).mockReturnValue(null);

      const result = await createDispatch(
        "org1",
        {
          ticketRef: "TICK-2",
          title: "Test",
          labels: ["unknown"],
          priority: "medium",
        },
        "manual",
      );

      expect(result).toEqual({
        error: "No matching agent with available capacity",
        code: "NO_AGENT",
      });
    });

    it("uses default priority and null description when not provided", async () => {
      const ws = { send: vi.fn() };
      const agent = { name: "agent-a", tags: ["ts"], capacity: 2, running: 0 };
      const machine = { name: "m1", ws, orgId: "org1", agents: new Map() };
      vi.mocked(findAgentForDispatch).mockReturnValue({ agent, machine: machine as any });

      const fakeRow = makeFakeDispatchRow({ description: null, priority: "medium" });
      mockInsert.mockResolvedValue([fakeRow]);

      const result = await createDispatch(
        "org1",
        {
          ticketRef: "TICK-3",
          title: "No desc",
          labels: ["ts"],
          // no description, no priority
        },
        "manual",
      );

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          description: null,
          priority: "medium",
          createdBy: null,
        }),
      );
      expect(ws.send).toHaveBeenCalled();
      // The WS message should have description as undefined (via ?? undefined)
      const wsMsg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(wsMsg.ticket.description).toBeUndefined();
    });
  });

  describe("completeDispatch", () => {
    it("updates status and converts duration_seconds to duration_ms", async () => {
      const updatedRow = makeFakeDispatchRow({
        status: "completed",
        exitCode: 0,
        durationMs: 5500,
      });
      mockSelect.mockResolvedValue([updatedRow]);

      await completeDispatch("d-123", true, 0, 5.5);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed", exitCode: 0, durationMs: 5500 }),
        expect.anything(),
      );
      expect(eventBus.emitDispatchUpdate).toHaveBeenCalled();
      expect(eventBus.emitFeedEvent).toHaveBeenCalled();
    });

    it("sets failed status when success is false", async () => {
      const updatedRow = makeFakeDispatchRow({ status: "failed", exitCode: 1, durationMs: 3000 });
      mockSelect.mockResolvedValue([updatedRow]);

      await completeDispatch("d-123", false, 1, 3);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", exitCode: 1, durationMs: 3000 }),
        expect.anything(),
      );
    });

    it("does not emit events if dispatch not found after update", async () => {
      mockSelect.mockResolvedValue([]);

      await completeDispatch("d-nonexistent", true, 0, 1);

      expect(eventBus.emitDispatchUpdate).not.toHaveBeenCalled();
    });
  });

  describe("appendDispatchMessage", () => {
    it("appends message to existing dispatch", async () => {
      const existingRow = makeFakeDispatchRow({ messages: [{ message: "old", timestamp: "t0" }] });
      // First select returns existing, second returns updated
      mockSelect.mockResolvedValueOnce([existingRow]).mockResolvedValueOnce([
        {
          ...existingRow,
          messages: [
            { message: "old", timestamp: "t0" },
            { message: "new", timestamp: "t1" },
          ],
        },
      ]);

      await appendDispatchMessage("d-123", "new", "t1");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { message: "old", timestamp: "t0" },
            { message: "new", timestamp: "t1" },
          ],
          status: "running",
        }),
        expect.anything(),
      );
    });

    it("does nothing if dispatch not found", async () => {
      mockSelect.mockResolvedValue([]);

      await appendDispatchMessage("d-nonexistent", "msg", "t");

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("handles null messages on existing dispatch by defaulting to empty array", async () => {
      const existingRow = makeFakeDispatchRow({ messages: null });
      mockSelect
        .mockResolvedValueOnce([existingRow])
        .mockResolvedValueOnce([
          { ...existingRow, messages: [{ message: "first", timestamp: "t1" }] },
        ]);

      await appendDispatchMessage("d-123", "first", "t1");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ message: "first", timestamp: "t1" }],
          status: "running",
        }),
        expect.anything(),
      );
    });

    it("does not emit events if dispatch not found after update", async () => {
      const existingRow = makeFakeDispatchRow({ messages: [] });
      mockSelect
        .mockResolvedValueOnce([existingRow]) // first select finds dispatch
        .mockResolvedValueOnce([]); // second select after update finds nothing

      await appendDispatchMessage("d-123", "msg", "t1");

      expect(mockUpdate).toHaveBeenCalled();
      expect(eventBus.emitDispatchUpdate).not.toHaveBeenCalled();
    });
  });

  describe("serializeDispatch", () => {
    it("converts dispatch row to plain object with ISO dates", () => {
      const row = makeFakeDispatchRow();
      const result = serializeDispatch(row as any);

      expect(result.id).toBe("d-123");
      expect(result.createdAt).toBe("2024-06-01T12:00:00.000Z");
      expect(result.updatedAt).toBe("2024-06-01T12:00:00.000Z");
      expect(result.messages).toEqual([]);
    });

    it("handles null messages as empty array", () => {
      const row = makeFakeDispatchRow({ messages: null });
      const result = serializeDispatch(row as any);
      expect(result.messages).toEqual([]);
    });
  });
});
