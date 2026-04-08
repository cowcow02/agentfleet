import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { corsMiddleware } from "../cors";

describe("corsMiddleware", () => {
  it("is a valid Hono middleware function", () => {
    expect(typeof corsMiddleware).toBe("function");
  });

  it("applies CORS headers to responses", async () => {
    const app = new Hono();
    app.use("*", corsMiddleware);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });
});
