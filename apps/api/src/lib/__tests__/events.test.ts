import { describe, it, expect, vi } from "vitest";
import { eventBus } from "../events";

describe("EventBus", () => {
  it("emitAgentUpdate fires agent:update with payload", () => {
    const listener = vi.fn();
    eventBus.on("agent:update", listener);

    const payload = {
      orgId: "org1",
      agents: [
        {
          name: "a1",
          machine: "m1",
          tags: ["ts"],
          capacity: 2,
          running: 0,
          lastHeartbeat: new Date().toISOString(),
        },
      ],
      machines: 1,
    };
    eventBus.emitAgentUpdate(payload);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(payload);

    eventBus.off("agent:update", listener);
  });

  it("emitDispatchUpdate fires dispatch:update with payload", () => {
    const listener = vi.fn();
    eventBus.on("dispatch:update", listener);

    const payload = { orgId: "org1", dispatch: { id: "d1" } };
    eventBus.emitDispatchUpdate(payload);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(payload);

    eventBus.off("dispatch:update", listener);
  });

  it("emitFeedEvent fires feed:event with payload", () => {
    const listener = vi.fn();
    eventBus.on("feed:event", listener);

    const payload = { orgId: "org1", message: "hello", timestamp: "2024-01-01", type: "fleet" };
    eventBus.emitFeedEvent(payload);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(payload);

    eventBus.off("feed:event", listener);
  });

  it("supports multiple listeners on the same event", () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    eventBus.on("agent:update", l1);
    eventBus.on("agent:update", l2);

    const payload = { orgId: "org1", agents: [], machines: 0 };
    eventBus.emitAgentUpdate(payload);

    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();

    eventBus.off("agent:update", l1);
    eventBus.off("agent:update", l2);
  });

  it("emitTranscriptEvent fires transcript:event with payload", () => {
    const listener = vi.fn();
    eventBus.on("transcript:event", listener);

    const payload = {
      orgId: "org1",
      dispatchId: "d1",
      sessionId: "sess-1",
      eventType: "tool_call",
      data: { name: "Read", input: { file_path: "/foo" } },
      timestamp: "2024-01-01T00:00:00Z",
    };
    eventBus.emitTranscriptEvent(payload);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(payload);

    eventBus.off("transcript:event", listener);
  });

  it("listener removal stops receiving events", () => {
    const listener = vi.fn();
    eventBus.on("feed:event", listener);
    eventBus.off("feed:event", listener);

    eventBus.emitFeedEvent({ orgId: "org1", message: "x", timestamp: "t", type: "fleet" });
    expect(listener).not.toHaveBeenCalled();
  });
});
