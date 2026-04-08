import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDbSelect = vi.fn();
const mockDbCount = vi.fn();

vi.mock("@agentfleet/db", () => {
  const webhookLogs = {
    organizationId: "organization_id",
    createdAt: "created_at",
  };
  return {
    db: {
      select: (cols?: any) => ({
        from: () => ({
          where: (w: any) => {
            if (cols) {
              // count query
              return mockDbCount(w);
            }
            return {
              orderBy: () => ({
                limit: (l: any) => ({
                  offset: (o: any) => mockDbSelect(w, l, o),
                }),
              }),
            };
          },
        }),
      }),
    },
    webhookLogs,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
    desc: vi.fn((col: any) => ({ _desc: col })),
    count: vi.fn(() => "count"),
  };
});

import { createTestApp, createUnauthenticatedApp } from "./_helpers";
import { webhookLogsRouter } from "../webhook-logs";

const now = new Date("2024-06-01T12:00:00Z");

describe("GET /api/webhook-logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns logs with pagination", async () => {
    const rows = [{
      id: 1,
      organizationId: "org-test",
      integration: "linear",
      action: "dispatched",
      reason: "Dispatched as d-1",
      payload: { type: "Issue" },
      dispatchId: "d-1",
      createdAt: now,
    }];

    mockDbSelect.mockResolvedValue(rows);
    mockDbCount.mockResolvedValue([{ total: 1 }]);

    const app = createTestApp("org-test");
    app.route("/", webhookLogsRouter);

    const res = await app.request("/api/webhook-logs");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].id).toBe(1);
    expect(body.logs[0].action).toBe("dispatched");
    expect(body.logs[0].createdAt).toBe("2024-06-01T12:00:00.000Z");
    expect(body.total).toBe(1);
  });

  it("returns empty logs for org with no webhook events", async () => {
    mockDbSelect.mockResolvedValue([]);
    mockDbCount.mockResolvedValue([{ total: 0 }]);

    const app = createTestApp("org-test");
    app.route("/", webhookLogsRouter);

    const res = await app.request("/api/webhook-logs");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.logs).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it("returns 400 when no organizationId", async () => {
    const app = createUnauthenticatedApp();
    app.route("/", webhookLogsRouter);

    const res = await app.request("/api/webhook-logs");
    expect(res.status).toBe(400);
  });
});
