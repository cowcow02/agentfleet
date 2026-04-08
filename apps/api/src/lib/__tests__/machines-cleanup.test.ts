import { describe, it, expect, vi, afterEach } from "vitest";

// Capture the setInterval callback by spying on globalThis.setInterval
let cleanupFn: (() => void) | null = null;
const originalSetInterval = globalThis.setInterval;
vi.stubGlobal("setInterval", (fn: () => void, ms: number) => {
  cleanupFn = fn;
  return originalSetInterval(fn, 999_999); // very long interval, won't fire
});

// Mock events module
vi.mock("../events", () => ({
  eventBus: {
    emitAgentUpdate: vi.fn(),
    emitFeedEvent: vi.fn(),
    emitDispatchUpdate: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Now import machines - this will capture the cleanup function
const {
  registerMachine,
  removeMachine,
  getAgentsForOrg,
} = await import("../machines");
const { eventBus } = await import("../events");

function makeWs(readyState = 1): any {
  return { readyState, OPEN: 1, send: vi.fn(), close: vi.fn() };
}

describe("cleanupStale", () => {
  afterEach(() => {
    try { removeMachine("cleanup-org", "m1"); } catch {}
    vi.clearAllMocks();
  });

  it("captured the cleanup function", () => {
    expect(cleanupFn).toBeInstanceOf(Function);
  });

  it("removes machines with closed WebSocket", () => {
    const ws = makeWs(3); // CLOSED
    registerMachine("cleanup-org", "m1", ws, [{ name: "a", tags: ["x"], capacity: 1 }]);
    vi.clearAllMocks();

    cleanupFn!();

    expect(getAgentsForOrg("cleanup-org")).toEqual([]);
    expect(eventBus.emitAgentUpdate).toHaveBeenCalled();
  });

  it("removes machines with stale heartbeat >60s and closes WS", () => {
    const ws = makeWs(1); // OPEN
    const m = registerMachine("cleanup-org", "m1", ws, [{ name: "a", tags: ["x"], capacity: 1 }]);
    m.lastHeartbeat = new Date(Date.now() - 61_000);
    vi.clearAllMocks();

    cleanupFn!();

    expect(getAgentsForOrg("cleanup-org")).toEqual([]);
    expect(ws.close).toHaveBeenCalled();
  });

  it("keeps machines with fresh heartbeat and open WS", () => {
    const ws = makeWs(1);
    registerMachine("cleanup-org", "m1", ws, [{ name: "a", tags: ["x"], capacity: 1 }]);
    vi.clearAllMocks();

    cleanupFn!();

    expect(getAgentsForOrg("cleanup-org")).toHaveLength(1);
  });

  it("handles ws.close() throwing", () => {
    const ws = makeWs(1); // OPEN
    ws.close = vi.fn(() => { throw new Error("close error"); });
    const m = registerMachine("cleanup-org", "m1", ws, [{ name: "a", tags: ["x"], capacity: 1 }]);
    m.lastHeartbeat = new Date(Date.now() - 61_000);

    // Should not throw
    cleanupFn!();

    expect(getAgentsForOrg("cleanup-org")).toEqual([]);
  });
});
