import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSSE } from "../use-sse";

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  listeners: Record<string, ((ev: MessageEvent) => void)[]> = {};
  closed = false;

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = opts?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (ev: MessageEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  close() {
    this.closed = true;
  }

  // Test helpers
  simulateOpen() {
    this.onopen?.(new Event("open"));
  }

  simulateError() {
    this.onerror?.(new Event("error"));
  }

  simulateMessage(type: string, data: unknown) {
    const handlers = this.listeners[type] ?? [];
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const handler of handlers) {
      handler(event);
    }
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useSSE", () => {
  it("connects to correct URL with credentials", () => {
    const onEvent = vi.fn();
    renderHook(() => useSSE(onEvent));

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toBe("/api/sse");
    expect(es.withCredentials).toBe(false);
  });

  it("sets connected to true on open", () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSSE(onEvent));

    expect(result.current.connected).toBe(false);

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);
  });

  it("registers listeners for all event types", () => {
    const onEvent = vi.fn();
    renderHook(() => useSSE(onEvent));

    const es = MockEventSource.instances[0];
    expect(es.listeners["agent:update"]).toHaveLength(1);
    expect(es.listeners["dispatch:update"]).toHaveLength(1);
    expect(es.listeners["feed:event"]).toHaveLength(1);
  });

  it("calls onEvent with parsed data", () => {
    const onEvent = vi.fn();
    renderHook(() => useSSE(onEvent));

    const es = MockEventSource.instances[0];
    const data = { agents: [], machines: 0 };
    act(() => {
      es.simulateMessage("agent:update", data);
    });

    expect(onEvent).toHaveBeenCalledWith({
      event: "agent:update",
      data,
    });
  });

  it("ignores malformed JSON", () => {
    const onEvent = vi.fn();
    renderHook(() => useSSE(onEvent));

    const es = MockEventSource.instances[0];
    const handlers = es.listeners["agent:update"];
    act(() => {
      handlers[0]({ data: "not-json{" } as MessageEvent);
    });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("reconnects on error with exponential backoff", () => {
    const onEvent = vi.fn();
    renderHook(() => useSSE(onEvent));

    expect(MockEventSource.instances).toHaveLength(1);

    // Trigger error
    act(() => {
      MockEventSource.instances[0].simulateError();
    });

    expect(MockEventSource.instances[0].closed).toBe(true);

    // Advance past initial reconnect delay (3000ms)
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(MockEventSource.instances).toHaveLength(2);

    // Second error -> delay should be 6000ms
    act(() => {
      MockEventSource.instances[1].simulateError();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // Should NOT have reconnected yet (need 6000ms)
    expect(MockEventSource.instances).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it("resets reconnect delay on successful open", () => {
    const onEvent = vi.fn();
    renderHook(() => useSSE(onEvent));

    // Error -> reconnect
    act(() => {
      MockEventSource.instances[0].simulateError();
      vi.advanceTimersByTime(3000);
    });

    // Open successfully -> reset delay
    act(() => {
      MockEventSource.instances[1].simulateOpen();
    });

    // Error again -> should use initial 3000ms delay, not 6000ms
    act(() => {
      MockEventSource.instances[1].simulateError();
      vi.advanceTimersByTime(3000);
    });

    expect(MockEventSource.instances).toHaveLength(3);
  });

  it("cleans up on unmount", () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() => useSSE(onEvent));

    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);

    unmount();

    expect(es.closed).toBe(true);
  });

  it("sets connected to false on error", () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSSE(onEvent));

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      MockEventSource.instances[0].simulateError();
    });
    expect(result.current.connected).toBe(false);
  });

  it("caps reconnect delay at MAX_RECONNECT_DELAY (30s)", () => {
    const onEvent = vi.fn();
    renderHook(() => useSSE(onEvent));

    // Error multiple times to grow the delay: 3000 -> 6000 -> 12000 -> 24000 -> 48000 (capped at 30000)
    for (let i = 0; i < 4; i++) {
      act(() => {
        MockEventSource.instances[MockEventSource.instances.length - 1].simulateError();
        vi.advanceTimersByTime(60000); // advance enough to always reconnect
      });
    }

    const count = MockEventSource.instances.length;
    // Trigger one more error at delay=48000 which should be capped at 30000
    act(() => {
      MockEventSource.instances[MockEventSource.instances.length - 1].simulateError();
    });

    // At 29999ms, should NOT have reconnected
    act(() => {
      vi.advanceTimersByTime(29999);
    });
    expect(MockEventSource.instances.length).toBe(count);

    // At 30000ms, should reconnect
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockEventSource.instances.length).toBe(count + 1);
  });

  it("clears pending reconnect timeout on unmount", () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() => useSSE(onEvent));

    // Trigger error to schedule reconnect
    act(() => {
      MockEventSource.instances[0].simulateError();
    });

    unmount();

    // Advance timer - should NOT create new connection
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Only the original instance, no reconnect
    expect(MockEventSource.instances).toHaveLength(1);
  });
});
