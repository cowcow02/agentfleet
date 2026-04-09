import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB - track call counts to differentiate between different select chains
let selectCallIndex = 0;
const selectResults: any[] = [];

function pushSelectResults(...results: any[]) {
  selectResults.length = 0;
  selectCallIndex = 0;
  selectResults.push(...results);
}

function nextSelectResult() {
  return selectResults[selectCallIndex++] ?? [];
}

vi.mock("@agentfleet/db", () => {
  const dispatches = {
    id: "id",
    organizationId: "organization_id",
    status: "status",
    source: "source",
    agentName: "agent_name",
    createdAt: "created_at",
  };

  // Build a chainable mock that always resolves to the next queued result
  function makeChain(): any {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      then: (resolve: Function, reject?: Function) => {
        try {
          resolve(nextSelectResult());
        } catch (e) {
          if (reject) reject(e);
        }
      },
    };
    return chain;
  }

  return {
    db: {
      select: () => makeChain(),
    },
    dispatches,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    and: vi.fn((...args: any[]) => ({ _and: args })),
    desc: vi.fn((col: any) => ({ _desc: col })),
    count: vi.fn(() => "count"),
    sql: vi.fn(),
  };
});

// Mock dispatch lib
vi.mock("../../lib/dispatch", () => ({
  createDispatch: vi.fn(),
  serializeDispatch: vi.fn((row: any) => ({
    id: row.id,
    organizationId: row.organizationId,
    ticketRef: row.ticketRef,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    messages: row.messages ?? [],
  })),
}));

import { createTestApp, createUnauthenticatedApp } from "./_helpers";
import { dispatchesRouter } from "../dispatches";
import { createDispatch } from "../../lib/dispatch";

const now = new Date("2024-06-01T12:00:00Z");

function makeFakeRow(overrides: any = {}) {
  return {
    id: "d-1",
    organizationId: "org-test",
    ticketRef: "TICK-1",
    title: "Fix bug",
    description: null,
    labels: ["ts"],
    priority: "medium",
    agentName: "agent-a",
    machineName: "m1",
    createdBy: "user-1",
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

describe("dispatches routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    selectCallIndex = 0;
  });

  describe("GET /api/dispatches", () => {
    it("returns list of dispatches", async () => {
      const rows = [makeFakeRow()];
      // Promise.all calls two selects: first for rows, second for count
      pushSelectResults(rows, [{ total: 1 }]);

      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.dispatches).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it("returns 400 when no organizationId", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("No active organization");
    });

    it("returns 400 for invalid query parameters", async () => {
      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches?limit=notanumber");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("filters by status, source, and agent", async () => {
      const rows = [makeFakeRow({ status: "completed", source: "linear", agentName: "agent-b" })];
      pushSelectResults(rows, [{ total: 1 }]);

      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches?status=completed&source=linear&agent=agent-b");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.dispatches).toHaveLength(1);
    });
  });

  describe("POST /api/dispatches", () => {
    it("returns 400 for invalid JSON body", async () => {
      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });
      expect(res.status).toBe(400);
    });

    it("returns 422 when labels are missing", async () => {
      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketRef: "T-1", title: "Bug", labels: [] }),
      });
      expect(res.status).toBe(422);
    });

    it("returns 422 when no matching agent", async () => {
      vi.mocked(createDispatch).mockResolvedValue({
        error: "No matching agent with available capacity",
        code: "NO_AGENT",
      });

      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketRef: "T-1", title: "Bug", labels: ["ts"] }),
      });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe("NO_AGENT");
    });

    it("returns 400 when no organizationId on POST", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketRef: "T-1", title: "Bug", labels: ["ts"] }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 201 on successful dispatch", async () => {
      vi.mocked(createDispatch).mockResolvedValue({
        id: "d-new",
        agentName: "agent-a",
        machineName: "m1",
        status: "dispatched",
      });

      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketRef: "T-1", title: "Bug", labels: ["ts"] }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("d-new");
    });

    it("accepts ad hoc dispatch targeting a specific agent", async () => {
      vi.mocked(createDispatch).mockResolvedValue({
        id: "d-adhoc",
        agentName: "worker-1",
        machineName: "mac-mini-01",
        status: "dispatched",
      });

      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: "worker-1",
          machineName: "mac-mini-01",
          description: "One-off script",
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("d-adhoc");
      // Lib should be invoked with the parsed ad hoc payload (no ticketRef/labels)
      expect(vi.mocked(createDispatch)).toHaveBeenCalledWith(
        "org-test",
        expect.objectContaining({
          agentName: "worker-1",
          machineName: "mac-mini-01",
          description: "One-off script",
        }),
        "manual",
        expect.anything(),
      );
    });

    it("rejects ad hoc dispatch with missing machineName", async () => {
      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: "worker-1",
          description: "missing machine",
        }),
      });
      expect(res.status).toBe(422);
    });
  });

  describe("GET /api/dispatches/:id", () => {
    it("returns 404 when dispatch not found", async () => {
      pushSelectResults([]);

      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches/d-nonexistent");
      expect(res.status).toBe(404);
    });

    it("returns 400 when no organizationId on GET :id", async () => {
      const app = createUnauthenticatedApp();
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches/d-1");
      expect(res.status).toBe(400);
    });

    it("returns dispatch when found", async () => {
      const row = makeFakeRow();
      pushSelectResults([row]);

      const app = createTestApp("org-test");
      app.route("/", dispatchesRouter);

      const res = await app.request("/api/dispatches/d-1");
      expect(res.status).toBe(200);
    });
  });
});
