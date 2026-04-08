import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDbSelect = vi.fn();

vi.mock("@agentfleet/db", () => {
  const dispatches = {
    organizationId: "organization_id",
    status: "status",
    durationMs: "duration_ms",
  };
  return {
    db: {
      select: (cols: any) => ({
        from: () => ({
          where: (w: any) => mockDbSelect(cols, w),
        }),
      }),
    },
    dispatches,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    and: vi.fn((...args: any[]) => ({ _and: args })),
    count: vi.fn(() => "count"),
    avg: vi.fn(() => "avg"),
    sum: vi.fn(() => "sum"),
    sql: vi.fn(),
  };
});

// Mock machines
vi.mock("../../lib/machines", () => ({
  getMachineCountForOrg: vi.fn(),
  getAgentsForOrg: vi.fn(),
  getRunningJobsForOrg: vi.fn(),
}));

import { createTestApp, createUnauthenticatedApp } from "./_helpers";
import { dashboardRouter } from "../dashboard";
import { getMachineCountForOrg, getAgentsForOrg, getRunningJobsForOrg } from "../../lib/machines";

describe("GET /api/dashboard/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns combined in-memory + DB stats", async () => {
    vi.mocked(getMachineCountForOrg).mockReturnValue(2);
    vi.mocked(getAgentsForOrg).mockReturnValue([
      { name: "a1", machine: "m1", tags: [], capacity: 1, running: 0, lastHeartbeat: "" },
      { name: "a2", machine: "m2", tags: [], capacity: 1, running: 0, lastHeartbeat: "" },
    ]);
    vi.mocked(getRunningJobsForOrg).mockReturnValue(1);

    mockDbSelect.mockResolvedValue([{
      totalDispatches: 10,
      completed: 7,
      failed: 2,
      avgDurationMs: "5000",
      totalDurationMs: "50000",
    }]);

    const app = createTestApp("org-test");
    app.route("/", dashboardRouter);

    const res = await app.request("/api/dashboard/stats");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.machinesOnline).toBe(2);
    expect(body.agentsRegistered).toBe(2);
    expect(body.runningJobs).toBe(1);
    expect(body.totalDispatches).toBe(10);
    expect(body.completed).toBe(7);
    expect(body.failed).toBe(2);
    expect(body.avgDurationSeconds).toBe(5);
    expect(body.totalAgentSeconds).toBe(50);
  });

  it("handles null duration values", async () => {
    vi.mocked(getMachineCountForOrg).mockReturnValue(0);
    vi.mocked(getAgentsForOrg).mockReturnValue([]);
    vi.mocked(getRunningJobsForOrg).mockReturnValue(0);

    mockDbSelect.mockResolvedValue([{
      totalDispatches: 0,
      completed: 0,
      failed: 0,
      avgDurationMs: null,
      totalDurationMs: null,
    }]);

    const app = createTestApp("org-test");
    app.route("/", dashboardRouter);

    const res = await app.request("/api/dashboard/stats");
    const body = await res.json();
    expect(body.avgDurationSeconds).toBe(0);
    expect(body.totalAgentSeconds).toBe(0);
  });

  it("returns 400 when no organizationId", async () => {
    const app = createUnauthenticatedApp();
    app.route("/", dashboardRouter);

    const res = await app.request("/api/dashboard/stats");
    expect(res.status).toBe(400);
  });
});
