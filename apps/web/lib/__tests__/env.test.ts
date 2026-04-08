import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("env", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses default URL when NEXT_PUBLIC_API_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const { env } = await import("../env");
    expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:9900");
  });

  it("uses provided URL when NEXT_PUBLIC_API_URL is set", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://custom:3000";
    const { env } = await import("../env");
    expect(env.NEXT_PUBLIC_API_URL).toBe("http://custom:3000");
  });
});
