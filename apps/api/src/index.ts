import { env } from "./env";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import { auth } from "./auth";
import { corsMiddleware } from "./middleware/cors";
import { authMiddleware } from "./middleware/auth";
import { healthRouter } from "./routes/health";
import { dispatchesRouter } from "./routes/dispatches";
import { agentsRouter } from "./routes/agents";
import { dashboardRouter } from "./routes/dashboard";
import { integrationsRouter } from "./routes/integrations";
import { webhooksRouter } from "./routes/webhooks";
import { webhookLogsRouter } from "./routes/webhook-logs";
import { sseRouter } from "./routes/sse";
import { apiKeysRouter } from "./routes/api-keys";
import { meRouter } from "./routes/me";
import { projectsRouter } from "./routes/projects";
import { createWsHandler } from "./ws/handler";

const app = new Hono();

// Global middleware
app.use("*", corsMiddleware);

// Better Auth handler — must be before auth middleware
app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

// Health check — before auth middleware
app.route("", healthRouter);

// Auth middleware for all /api/* routes (skips auth/**, webhooks/**)
app.use("/api/*", authMiddleware);

// Application routes
app.route("", dispatchesRouter);
app.route("", agentsRouter);
app.route("", dashboardRouter);
app.route("", integrationsRouter);
app.route("", webhooksRouter);
app.route("", webhookLogsRouter);
app.route("", sseRouter);
app.route("", apiKeysRouter);
app.route("", meRouter);
app.route("", projectsRouter);

const port = env.PORT;

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[API] Listening on http://localhost:${info.port}`);
});

// WebSocket setup — noServer mode
const wss = new WebSocketServer({ noServer: true });
const wsHandler = createWsHandler(wss);

(server as Server).on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (url.pathname === "/ws") {
    wsHandler(req, socket, head);
  } else {
    socket.destroy();
  }
});
