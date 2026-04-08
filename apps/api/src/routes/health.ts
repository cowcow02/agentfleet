import { Hono } from "hono";

const startTime = Date.now();

export const healthRouter = new Hono();

healthRouter.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});
