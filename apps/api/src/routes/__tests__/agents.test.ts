import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/machines", () => ({
  getAgentsForOrg: vi.fn(),
  getMachineCountForOrg: vi.fn(),
}));

import { createTestApp, createUnauthenticatedApp } from "./_helpers";
import { agentsRouter } from "../agents";
import { getAgentsForOrg, getMachineCountForOrg } from "../../lib/machines";

describe("GET /api/agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agents from memory for authenticated org", async () => {
    const agents = [
      { name: "a1", machine: "m1", tags: ["ts"], capacity: 2, running: 1, lastHeartbeat: "2024-01-01T00:00:00Z" },
    ];
    vi.mocked(getAgentsForOrg).mockReturnValue(agents);
    vi.mocked(getMachineCountForOrg).mockReturnValue(1);

    const app = createTestApp("org-test");
    app.route("/", agentsRouter);

    const res = await app.request("/api/agents");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.agents).toEqual(agents);
    expect(body.machinesOnline).toBe(1);
  });

  it("returns 400 when no organizationId is set", async () => {
    const app = createUnauthenticatedApp();
    app.route("/", agentsRouter);

    const res = await app.request("/api/agents");
    expect(res.status).toBe(400);
  });
});
