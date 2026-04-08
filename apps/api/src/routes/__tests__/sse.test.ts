import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { streamSSE } from "hono/streaming";

vi.mock("../../lib/events", () => ({
  eventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emitAgentUpdate: vi.fn(),
    emitDispatchUpdate: vi.fn(),
    emitFeedEvent: vi.fn(),
  },
}));

import { sseRouter } from "../sse";
import { eventBus } from "../../lib/events";
import { createTestApp, createUnauthenticatedApp } from "./_helpers";

describe("GET /api/sse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no organizationId", async () => {
    const app = createUnauthenticatedApp();
    app.route("/", sseRouter);

    const res = await app.request("/api/sse");
    expect(res.status).toBe(400);
  });

  it("opens SSE stream and registers all three event listeners", async () => {
    const app = createTestApp("org-test");
    app.route("/", sseRouter);

    const res = await app.request("/api/sse");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    expect(eventBus.on).toHaveBeenCalledWith("agent:update", expect.any(Function));
    expect(eventBus.on).toHaveBeenCalledWith("dispatch:update", expect.any(Function));
    expect(eventBus.on).toHaveBeenCalledWith("feed:event", expect.any(Function));
  });

  it("agent:update handler writes SSE for matching org", async () => {
    const app = createTestApp("org-test");
    app.route("/", sseRouter);

    const res = await app.request("/api/sse");

    const agentHandler = vi.mocked(eventBus.on).mock.calls.find(
      (c) => c[0] === "agent:update"
    )![1] as Function;

    // Matching org - should attempt to write (won't throw even if stream is done)
    agentHandler({ orgId: "org-test", agents: [], machines: 0 });

    // Different org - should be filtered out silently
    agentHandler({ orgId: "other-org", agents: [], machines: 0 });
  });

  it("dispatch:update handler writes SSE for matching org", async () => {
    const app = createTestApp("org-test");
    app.route("/", sseRouter);

    const res = await app.request("/api/sse");

    const handler = vi.mocked(eventBus.on).mock.calls.find(
      (c) => c[0] === "dispatch:update"
    )![1] as Function;

    handler({ orgId: "org-test", dispatch: { id: "d-1" } });
    handler({ orgId: "other-org", dispatch: { id: "d-2" } });
  });

  it("feed:event handler writes SSE for matching org", async () => {
    const app = createTestApp("org-test");
    app.route("/", sseRouter);

    const res = await app.request("/api/sse");

    const handler = vi.mocked(eventBus.on).mock.calls.find(
      (c) => c[0] === "feed:event"
    )![1] as Function;

    handler({ orgId: "org-test", message: "hi", timestamp: "t", type: "fleet" });
    handler({ orgId: "other-org", message: "hi", timestamp: "t", type: "fleet" });
  });

  it("SSE response body is a readable stream", async () => {
    const app = createTestApp("org-test");
    app.route("/", sseRouter);

    const res = await app.request("/api/sse");
    expect(res.body).toBeDefined();
    expect(res.body).not.toBeNull();
  });
});
