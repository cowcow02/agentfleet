import { describe, it, expect } from "vitest";
import { healthRouter } from "../health";

describe("GET /health", () => {
  it("returns status ok with uptime and timestamp", async () => {
    const res = await healthRouter.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.timestamp).toBeDefined();
  });
});
