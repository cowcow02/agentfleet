# AgentFleet Next.js Rewrite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the AgentFleet hub from vanilla Node.js to Next.js + Hono + Drizzle + Better Auth in a Turborepo monorepo.

**Architecture:** Two apps (Next.js frontend + Hono API) sharing typed packages (Drizzle DB schema + Zod API contract). Better Auth handles all auth/org/invite/API-key logic. WebSocket for daemons, SSE for dashboard real-time.

**Tech Stack:** Turborepo, pnpm, Next.js 15 (App Router), Hono, Drizzle ORM, Better Auth, shadcn/ui, PostgreSQL, Zod, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-08-nextjs-rewrite-design.md`

---

## Chunk 1: Foundation — Monorepo + Shared Packages

### Task 1: Scaffold Turborepo monorepo

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `package.json` (root)
- Create: `.npmrc`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Initialize pnpm workspace**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create root `package.json`:
```json
{
  "name": "agentfleet",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5.7"
  }
}
```

Create `.npmrc`:
```
auto-install-peers=true
```

- [ ] **Step 2: Create Turborepo config**

Create `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 3: Create shared TypeScript base config**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p apps/web apps/api packages/db/src packages/types/src
```

- [ ] **Step 5: Install dependencies and verify**

```bash
pnpm install
pnpm turbo build  # Should succeed with no packages yet
```

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml turbo.json package.json .npmrc tsconfig.base.json pnpm-lock.yaml
git commit -m "feat: scaffold Turborepo monorepo"
```

---

### Task 2: Create packages/types — Zod API contract

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`
- Create: `packages/types/src/entities.ts`
- Create: `packages/types/src/api.ts`
- Create: `packages/types/src/ws.ts`
- Create: `packages/types/src/sse.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@agentfleet/types",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23"
  },
  "devDependencies": {
    "typescript": "^5.7"
  }
}
```

Create `tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 2: Define entity schemas**

Create `packages/types/src/entities.ts` with Zod schemas for:
- `Dispatch` — id, organizationId, ticketRef, title, description, labels, priority, agentName, machineName, createdBy, source, status, exitCode, durationMs, messages, createdAt, updatedAt
- `Integration` — id, organizationId, type, config (LinearConfig), createdAt, updatedAt
- `LinearConfig` — apiKey, triggerStatus, triggerLabels
- `WebhookLogEntry` — id, organizationId, integration, action, reason, payload, dispatchId, createdAt
- `Agent` (in-memory) — name, machine, tags, capacity, running, lastHeartbeat
- `ErrorResponse` — error, code?

Priority enum: `["low", "medium", "high", "critical"]`
Dispatch status enum: `["dispatched", "running", "completed", "failed"]`
Source enum: `["manual", "linear"]`

- [ ] **Step 3: Define API request/response schemas**

Create `packages/types/src/api.ts` with Zod schemas for each endpoint:

```typescript
// POST /api/dispatches
export const CreateDispatchRequest = z.object({
  ticketRef: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  labels: z.array(z.string()).min(1, "At least one label required for agent matching"),
  priority: PriorityEnum.optional().default("medium"),
});
export const CreateDispatchResponse = z.object({
  id: z.string().uuid(),
  agentName: z.string(),
  machineName: z.string(),
  status: DispatchStatusEnum,
});

// GET /api/dispatches
export const ListDispatchesQuery = z.object({
  status: DispatchStatusEnum.optional(),
  source: SourceEnum.optional(),
  agent: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export const ListDispatchesResponse = z.object({
  dispatches: z.array(DispatchSchema),
  total: z.number(),
});

// GET /api/dashboard/stats
export const DashboardStatsResponse = z.object({
  machinesOnline: z.number(),
  agentsRegistered: z.number(),
  runningJobs: z.number(),
  totalDispatches: z.number(),
  completed: z.number(),
  failed: z.number(),
  avgDurationSeconds: z.number(),
  totalAgentSeconds: z.number(),
});

// GET /api/agents
export const ListAgentsResponse = z.object({
  agents: z.array(AgentSchema),
  machinesOnline: z.number(),
});

// PUT /api/integrations/linear
export const UpdateLinearConfigRequest = z.object({
  apiKey: z.string().min(1),
  triggerStatus: z.string().min(1),
  triggerLabels: z.array(z.string()).default([]),
});
export const LinearConfigResponse = z.object({
  configured: z.boolean(),
  triggerStatus: z.string().optional(),
  triggerLabels: z.array(z.string()).optional(),
  webhookUrl: z.string().optional(),
});

// GET /api/webhook-logs
export const ListWebhookLogsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export const ListWebhookLogsResponse = z.object({
  logs: z.array(WebhookLogEntrySchema),
  total: z.number(),
});
```

- [ ] **Step 4: Define WebSocket message schemas**

Create `packages/types/src/ws.ts`:

```typescript
// Daemon → Hub
export const RegisterMessage = z.object({
  type: z.literal("register"),
  machine: z.string(),
  agents: z.array(z.object({
    name: z.string(),
    tags: z.array(z.string()),
    capacity: z.number().int().positive(),
  })),
});
export const HeartbeatMessage = z.object({ type: z.literal("heartbeat") });
export const StatusMessage = z.object({
  type: z.literal("status"),
  dispatch_id: z.string(),
  timestamp: z.string(),
  message: z.string(),
});
export const CompleteMessage = z.object({
  type: z.literal("complete"),
  dispatch_id: z.string(),
  success: z.boolean(),
  exit_code: z.number().int(),
  duration_seconds: z.number(),
});
export const DaemonMessage = z.discriminatedUnion("type", [
  RegisterMessage, HeartbeatMessage, StatusMessage, CompleteMessage,
]);

// Hub → Daemon
export const DispatchMessage = z.object({
  type: z.literal("dispatch"),
  dispatch_id: z.string(),
  agent: z.string(),
  ticket: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    labels: z.array(z.string()),
    priority: z.string(),
  }),
});
export const RegisteredMessage = z.object({
  type: z.literal("registered"),
  machine: z.string(),
  agents: z.number(),
});
export const ErrorMessage = z.object({ type: z.literal("error"), message: z.string() });
export const AckMessage = z.object({ type: z.literal("ack"), dispatch_id: z.string() });
```

- [ ] **Step 5: Define SSE event schemas**

Create `packages/types/src/sse.ts`:

```typescript
export const AgentUpdateEvent = z.object({
  event: z.literal("agent:update"),
  data: z.object({ agents: z.array(AgentSchema), machines: z.number() }),
});
export const DispatchUpdateEvent = z.object({
  event: z.literal("dispatch:update"),
  data: z.object({ dispatch: DispatchSchema }),
});
export const FeedEvent = z.object({
  event: z.literal("feed:event"),
  data: z.object({ message: z.string(), timestamp: z.string(), type: z.string() }),
});
```

- [ ] **Step 6: Create index.ts re-exports**

Create `packages/types/src/index.ts` that re-exports everything from entities, api, ws, sse.

- [ ] **Step 7: Verify typecheck passes**

```bash
cd packages/types && pnpm install && pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/types/
git commit -m "feat: add shared types package with Zod API contract"
```

---

### Task 3: Create packages/db — Drizzle schema + migrations

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/auth-schema.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@agentfleet/db",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "^0.39",
    "pg": "^8.20"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30",
    "@types/pg": "^8",
    "typescript": "^5.7"
  }
}
```

Create `tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 2: Create Drizzle config**

Create `packages/db/drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 3: Create application schema**

Create `packages/db/src/schema.ts` with the three application tables exactly as defined in the spec:
- `dispatches` — with all columns, indexes, enums
- `integrations` — with unique org+type index
- `webhookLogs` — with org index

Use `pgTable`, proper column types, `uuid().defaultRandom()`, `timestamp().defaultNow()`, etc.

Reference the spec's Drizzle schema section verbatim for column definitions.

- [ ] **Step 4: Create auth schema placeholder**

Create `packages/db/src/auth-schema.ts`:
```typescript
// Better Auth generates this schema automatically via its Drizzle adapter.
// Run `npx @better-auth/cli generate` to populate this file.
// Tables: user, account, session, organization, member, invitation, apikey
export {};
```

This will be populated when Better Auth is configured in Task 4.

- [ ] **Step 5: Create DB client + connection**

Create `packages/db/src/index.ts`:
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export const db = drizzle(pool, { schema });
export * from "./schema";
export { pool };
```

- [ ] **Step 6: Generate initial migration**

```bash
cd packages/db
DATABASE_URL="postgresql://cowcow02@localhost:5432/agentfleet_dev" pnpm generate
```

Verify a migration SQL file is created in `packages/db/drizzle/`.

- [ ] **Step 7: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/db/
git commit -m "feat: add Drizzle DB package with schema and migrations"
```

---

## Chunk 2: API Server — Hono + Better Auth + Core Routes

### Task 4: Scaffold Hono API with Better Auth

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/auth.ts`
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/middleware/cors.ts`
- Create: `apps/api/src/routes/health.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@agentfleet/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4",
    "@hono/node-server": "^1",
    "better-auth": "^1",
    "ws": "^8.16",
    "zod": "^3.23",
    "@agentfleet/db": "workspace:*",
    "@agentfleet/types": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4",
    "@types/ws": "^8",
    "typescript": "^5.7"
  }
}
```

Create `tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Create Better Auth server config**

Create `apps/api/src/auth.ts`:
```typescript
import { betterAuth } from "better-auth";
import { organization, apiKey } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@agentfleet/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [
    organization(),
    apiKey(),
  ],
});
```

- [ ] **Step 3: Create CORS middleware**

Create `apps/api/src/middleware/cors.ts`:
```typescript
import { cors } from "hono/cors";

export const corsMiddleware = cors({
  origin: process.env.WEB_URL || "http://localhost:3000",
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
});
```

- [ ] **Step 4: Create auth middleware**

Create `apps/api/src/middleware/auth.ts`:

Auth middleware that:
1. Skips `/api/auth/**`, `/api/webhooks/**`, `/health`
2. Tries session cookie via `auth.api.getSession()`
3. Falls back to API key via `Authorization: Bearer` header using `auth.api.verifyApiKey()`
4. Sets `user`, `session`, `organizationId` on Hono context
5. Returns 401 if neither works

- [ ] **Step 5: Create health route**

Create `apps/api/src/routes/health.ts`:
```typescript
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
```

- [ ] **Step 6: Create main entry point**

Create `apps/api/src/index.ts`:
```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { auth } from "./auth";
import { corsMiddleware } from "./middleware/cors";
import { authMiddleware } from "./middleware/auth";
import { healthRouter } from "./routes/health";

const app = new Hono();

// Global middleware
app.use("*", corsMiddleware);

// Better Auth handler
app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

// Health (before auth middleware)
app.route("", healthRouter);

// Auth middleware for /api/* (skips auth/**, webhooks/**)
app.use("/api/*", authMiddleware);

// Application routes will be added here in subsequent tasks

const port = parseInt(process.env.PORT || "9900");
console.log(`[API] Listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
```

- [ ] **Step 7: Generate Better Auth schema**

Run Better Auth CLI to generate the Drizzle schema for auth tables:
```bash
cd apps/api && npx @better-auth/cli generate
```

Copy generated schema to `packages/db/src/auth-schema.ts`. Re-generate Drizzle migration.

- [ ] **Step 8: Test startup**

```bash
cd apps/api && DATABASE_URL="postgresql://cowcow02@localhost:5432/agentfleet_dev" pnpm dev
```

Verify:
- Server starts on port 9900
- `GET /health` returns `{ status: "ok" }`
- `POST /api/auth/sign-up/email` creates a user (test with curl)

- [ ] **Step 9: Commit**

```bash
git add apps/api/
git commit -m "feat: scaffold Hono API with Better Auth and middleware"
```

---

### Task 5: API routes — dispatches, agents, dashboard stats

**Files:**
- Create: `apps/api/src/routes/dispatches.ts`
- Create: `apps/api/src/routes/agents.ts`
- Create: `apps/api/src/routes/dashboard.ts`
- Create: `apps/api/src/lib/machines.ts`
- Create: `apps/api/src/lib/dispatch.ts`
- Modify: `apps/api/src/index.ts` (mount new routes)

- [ ] **Step 1: Create in-memory machines state manager**

Create `apps/api/src/lib/machines.ts`:
- `machines` Map keyed by `${orgId}:${machineName}`
- `Machine` and `Agent` interfaces matching the spec
- `registerMachine()`, `removeMachine()`, `getAgentsForOrg()`, `getMachineCountForOrg()`
- `getRunningJobsForOrg()` — sum of all agent.running counts
- `findAgentForTicket(orgId, labels)` — tag-overlap scoring, capacity check
- `cleanupStale()` — remove machines with dead WS or 60s heartbeat timeout
- `setInterval(cleanupStale, 15_000)`
- Export an EventEmitter for SSE to subscribe to (emits `agent:update` on changes)

- [ ] **Step 2: Create dispatch logic**

Create `apps/api/src/lib/dispatch.ts`:
- `createDispatch(orgId, request, source, userId?)` — finds agent, inserts DB row, sends WS dispatch message, returns dispatch
- Uses `findAgentForTicket()` from machines module
- Returns error if no matching agent found
- Emits `dispatch:update` event

- [ ] **Step 3: Create dispatches routes**

Create `apps/api/src/routes/dispatches.ts`:
- `GET /api/dispatches` — query DB with filters (status, source, agent, limit, offset), return with total count
- `POST /api/dispatches` — validate with `CreateDispatchRequest` schema, call `createDispatch()`, return response
- `GET /api/dispatches/:id` — single dispatch lookup by id + orgId
- Validate all inputs with Zod schemas from `@agentfleet/types`

- [ ] **Step 4: Create agents route**

Create `apps/api/src/routes/agents.ts`:
- `GET /api/agents` — read from in-memory machines state, return agents + machinesOnline

- [ ] **Step 5: Create dashboard stats route**

Create `apps/api/src/routes/dashboard.ts`:
- `GET /api/dashboard/stats` — combine in-memory state (machines, agents, running) with DB aggregates (total, completed, failed, avg duration, total agent seconds)
- Uses Drizzle `count()`, `avg()`, `sum()` aggregates on dispatches table

- [ ] **Step 6: Mount routes in index.ts**

Add all three routers to `apps/api/src/index.ts`.

- [ ] **Step 7: Test with curl**

```bash
# Create dispatch (should fail — no agents connected)
curl -X POST http://localhost:9900/api/dispatches \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"ticketRef":"TEST-1","title":"Test","labels":["backend"]}'
# Expected: 422 — no matching agent

# Get dashboard stats
curl http://localhost:9900/api/dashboard/stats -H "Cookie: <session-cookie>"
# Expected: { machinesOnline: 0, agentsRegistered: 0, ... }

# Get agents
curl http://localhost:9900/api/agents -H "Cookie: <session-cookie>"
# Expected: { agents: [], machinesOnline: 0 }
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/
git commit -m "feat: add dispatch, agent, and dashboard stats routes"
```

---

### Task 6: API routes — integrations, webhooks, webhook logs

**Files:**
- Create: `apps/api/src/routes/integrations.ts`
- Create: `apps/api/src/routes/webhooks.ts`
- Create: `apps/api/src/routes/webhook-logs.ts`
- Modify: `apps/api/src/index.ts` (mount routes)

- [ ] **Step 1: Create integrations routes**

Create `apps/api/src/routes/integrations.ts`:
- `GET /api/integrations/linear` — query integrations table by orgId + type="linear", mask apiKey, return config + webhookUrl
- `PUT /api/integrations/linear` — validate with `UpdateLinearConfigRequest`, upsert integration row
- `DELETE /api/integrations/linear` — delete integration row (keep webhook_logs)
- `GET /api/integrations/linear/issues` — fetch from Linear GraphQL API using stored apiKey, return normalized issues

- [ ] **Step 2: Create webhooks route**

Create `apps/api/src/routes/webhooks.ts`:
- `POST /api/webhooks/linear/:orgId` — unauthenticated endpoint
- Load integration config for orgId
- Validate event type is "Issue"
- Check status matches triggerStatus, labels match triggerLabels
- If match: call `createDispatch()` with source="linear"
- Log result to webhook_logs table (action: dispatched/ignored/no_match/rejected)
- Return 200 regardless (webhook acknowledgment)

- [ ] **Step 3: Create webhook logs route**

Create `apps/api/src/routes/webhook-logs.ts`:
- `GET /api/webhook-logs` — query webhook_logs by orgId with limit/offset, return with total

- [ ] **Step 4: Mount routes and test**

Mount all three routers. Test Linear config CRUD with curl.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/
git commit -m "feat: add integration, webhook, and webhook-log routes"
```

---

### Task 7: WebSocket handler + SSE endpoint

**Files:**
- Create: `apps/api/src/ws/handler.ts`
- Create: `apps/api/src/routes/sse.ts`
- Create: `apps/api/src/lib/events.ts`
- Modify: `apps/api/src/index.ts` (add WS upgrade + SSE route)

- [ ] **Step 1: Create event bus**

Create `apps/api/src/lib/events.ts`:
- `EventBus` class extending `EventEmitter`
- Typed events: `agent:update`, `dispatch:update`, `feed:event`
- Singleton export `eventBus`
- machines.ts and dispatch.ts emit to this bus

- [ ] **Step 2: Create WebSocket handler**

Create `apps/api/src/ws/handler.ts`:
- Uses `ws` library in noServer mode
- On HTTP upgrade: extract API key from `Authorization` header, verify via `auth.api.verifyApiKey()`, get orgId
- On `register` message: validate with Zod, register machine + agents in machines state
- On `heartbeat`: update lastHeartbeat timestamp
- On `status`: update dispatch messages array in DB, emit feed event
- On `complete`: update dispatch status/exitCode/durationMs in DB (convert duration_seconds * 1000), emit dispatch:update
- On close: remove machine from state, emit agent:update

- [ ] **Step 3: Create SSE endpoint**

Create `apps/api/src/routes/sse.ts`:
- `GET /api/sse` — authenticated (session cookie)
- Read `session.activeOrganizationId` for scoping
- Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Subscribe to eventBus for events matching orgId
- On event: write `event: <type>\ndata: <json>\n\n`
- On client disconnect: unsubscribe from eventBus
- Send initial heartbeat comment every 30s to keep connection alive

- [ ] **Step 4: Wire WS upgrade into HTTP server**

In `apps/api/src/index.ts`:
- Create `WebSocketServer` with `noServer: true`
- Listen for `upgrade` event on the Node.js HTTP server
- Route `/ws` upgrades to the WS handler
- Mount SSE route

- [ ] **Step 5: Test WebSocket**

```bash
# Use wscat or similar to test
wscat -H "Authorization: Bearer <api-key>" -c ws://localhost:9900/ws
# Send: {"type":"register","machine":"test-machine","agents":[{"name":"test","tags":["backend"],"capacity":1}]}
# Expected: {"type":"registered","machine":"test-machine","agents":1}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/
git commit -m "feat: add WebSocket handler and SSE endpoint"
```

---

## Chunk 3: Frontend — Next.js + shadcn/ui

### Task 8: Scaffold Next.js app with shadcn/ui and auth

**Files:**
- Create: `apps/web/` (via create-next-app + shadcn init)
- Create: `apps/web/lib/auth-client.ts`
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/lib/use-sse.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/(auth)/layout.tsx`
- Create: `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/web/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Create Next.js app**

```bash
cd apps && pnpm create next-app web --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"
```

- [ ] **Step 2: Install dependencies**

```bash
cd apps/web
pnpm add @agentfleet/types@workspace:* better-auth zod
pnpm add -D @agentfleet/db@workspace:*
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
cd apps/web && npx shadcn@latest init
```

Select: New York style, dark theme. Add initial components:
```bash
npx shadcn@latest add button card input label tabs table badge select textarea separator dropdown-menu avatar sheet
```

- [ ] **Step 4: Customize theme**

Edit `apps/web/app/globals.css` to set dark mode as default with the AgentFleet color palette:
- Dark background: `hsl(220, 20%, 10%)`
- Surface: `hsl(220, 18%, 14%)`
- Accent/primary: teal/green `hsl(160, 50%, 45%)`
- Muted borders, secondary text colors

- [ ] **Step 5: Create Better Auth client**

Create `apps/web/lib/auth-client.ts` as specified in the spec.

- [ ] **Step 6: Create typed API client**

Create `apps/web/lib/api.ts`:
```typescript
import type { z } from "zod";
import type * as schemas from "@agentfleet/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9900";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  dashboard: { getStats: () => fetchApi<...>("/api/dashboard/stats") },
  dispatches: {
    list: (query?) => fetchApi<...>(`/api/dispatches?${new URLSearchParams(query)}`),
    create: (body) => fetchApi<...>("/api/dispatches", { method: "POST", body: JSON.stringify(body) }),
    get: (id) => fetchApi<...>(`/api/dispatches/${id}`),
  },
  agents: { list: () => fetchApi<...>("/api/agents") },
  integrations: {
    getLinear: () => fetchApi<...>("/api/integrations/linear"),
    updateLinear: (body) => fetchApi<...>("/api/integrations/linear", { method: "PUT", body: JSON.stringify(body) }),
    deleteLinear: () => fetchApi<...>("/api/integrations/linear", { method: "DELETE" }),
    getLinearIssues: () => fetchApi<...>("/api/integrations/linear/issues"),
  },
  webhookLogs: { list: (query?) => fetchApi<...>(`/api/webhook-logs?${new URLSearchParams(query)}`) },
};
```

Type the return types using inferred Zod types from `@agentfleet/types`.

- [ ] **Step 7: Create SSE hook**

Create `apps/web/lib/use-sse.ts`:
```typescript
import { useEffect, useRef, useCallback } from "react";

export function useSSE(onEvent: (event: string, data: any) => void) {
  // Connect to API_URL/api/sse
  // Parse SSE events, call onEvent(eventType, parsedData)
  // Auto-reconnect on disconnect with exponential backoff
  // Cleanup on unmount
}
```

- [ ] **Step 8: Create root layout**

Create `apps/web/app/layout.tsx` with providers, fonts (Inter), and theme setup.

- [ ] **Step 9: Create auth layout + login page**

Create `apps/web/app/(auth)/layout.tsx` — centered card layout, no sidebar.

Create `apps/web/app/(auth)/login/page.tsx`:
- Email + password form using shadcn Input, Button, Card
- Calls `authClient.signIn.email()` on submit
- Redirects to `/dashboard` on success
- Shows error message on failure

- [ ] **Step 10: Create signup page**

Create `apps/web/app/(auth)/signup/page.tsx`:
- Name, email, password, team name fields
- Calls `authClient.signUp.email()` then creates organization
- Redirects to `/dashboard` on success

- [ ] **Step 11: Test auth flow**

```bash
pnpm dev  # Start both API and web
```

Verify: can sign up, creates org, redirects to dashboard. Can log in. Session persists across refresh.

- [ ] **Step 12: Commit**

```bash
git add apps/web/
git commit -m "feat: scaffold Next.js app with shadcn/ui and auth pages"
```

---

### Task 9: Dashboard layout + page

**Files:**
- Create: `apps/web/app/(dashboard)/layout.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/page.tsx`
- Create: `apps/web/components/sidebar.tsx`
- Create: `apps/web/components/stats-cards.tsx`
- Create: `apps/web/components/dispatch-form.tsx`

- [ ] **Step 1: Create sidebar component**

Create `apps/web/components/sidebar.tsx`:
- Logo + "AgentFleet" text
- Nav links: Dashboard, Agents, Dispatches, Settings (use shadcn Button as nav items)
- Active state highlighting based on current route
- User info at bottom (name, org name) from Better Auth session
- Theme toggle (dark/light)
- Sign out button

- [ ] **Step 2: Create dashboard layout**

Create `apps/web/app/(dashboard)/layout.tsx`:
- Check auth session — redirect to `/login` if not authenticated
- Sidebar on left (fixed width)
- Main content area on right with padding
- Pass session context to children

- [ ] **Step 3: Create stats cards component**

Create `apps/web/components/stats-cards.tsx`:
- 5 stat cards in a grid: Machines Online, Agents Registered, Running Jobs, Total Dispatches, Completed
- Uses shadcn Card component
- Each card: label (uppercase, small) + large number value
- Color-coded values (success green, info purple, warning orange, accent teal)
- Accepts `stats` prop from `DashboardStatsResponse`

- [ ] **Step 4: Create dispatch form component**

Create `apps/web/components/dispatch-form.tsx`:
- Tabs: Manual / From Linear (shadcn Tabs)
- Manual tab: Ticket ID, Title, Labels (comma-sep), Priority (Select), Description (Textarea), Dispatch button
- Linear tab: fetches issues from `/api/integrations/linear/issues`, displays as selectable list, dispatch button
- Calls `api.dispatches.create()` on submit
- Shows success/error toast

- [ ] **Step 5: Create dashboard page**

Create `apps/web/app/(dashboard)/dashboard/page.tsx`:
- Fetch stats via `api.dashboard.getStats()`
- Fetch agents via `api.agents.list()`
- Subscribe to SSE for real-time updates
- Render: StatsCards, DispatchForm, FleetOverview (agent list summary), LiveFeed (recent events)

- [ ] **Step 6: Test dashboard**

Start both apps, sign in, verify dashboard renders with correct stats (all zeros initially), dispatch form works.

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "feat: add dashboard layout, sidebar, stats cards, and dispatch form"
```

---

### Task 10: Remaining pages — Agents, Dispatches, Settings

**Files:**
- Create: `apps/web/app/(dashboard)/agents/page.tsx`
- Create: `apps/web/components/agent-table.tsx`
- Create: `apps/web/app/(dashboard)/dispatches/page.tsx`
- Create: `apps/web/components/dispatch-list.tsx`
- Create: `apps/web/app/(dashboard)/settings/page.tsx`
- Create: `apps/web/components/linear-config.tsx`

- [ ] **Step 1: Create agents page**

Create `apps/web/components/agent-table.tsx`:
- shadcn Table with columns: Agent Name, Machine, Tags (as badges), Capacity, Running, Last Seen
- Tags rendered as shadcn Badge components
- Status indicator (green dot for active)

Create `apps/web/app/(dashboard)/agents/page.tsx`:
- Fetches from `api.agents.list()`
- Subscribes to SSE `agent:update` for real-time
- Renders AgentTable
- Shows "No agents registered" empty state

- [ ] **Step 2: Create dispatches page**

Create `apps/web/components/dispatch-list.tsx`:
- Filter bar: status dropdown, source dropdown (All, Manual, Linear)
- List of dispatch cards/rows with: ticket ref, title, agent, status badge, source badge, duration, timestamp
- Status badges color-coded: dispatched=blue, running=yellow, completed=green, failed=red
- Pagination (limit/offset)

Create `apps/web/app/(dashboard)/dispatches/page.tsx`:
- Fetches from `api.dispatches.list()` with filter query params
- Renders DispatchList

- [ ] **Step 3: Create settings page**

Create `apps/web/components/linear-config.tsx`:
- Form: API Key (password input), Trigger Status (select), Trigger Labels (text input)
- Webhook URL display with copy button
- Connected/Not configured status indicator
- Save / Remove buttons
- Calls `api.integrations.updateLinear()` and `api.integrations.deleteLinear()`

Create `apps/web/app/(dashboard)/settings/page.tsx`:
- Sections: Org Info, Members & Invites, API Keys, Linear Integration
- Org Info: name, slug (from Better Auth session)
- Members: list via Better Auth org plugin, invite form, remove button
- API Keys: list/create/revoke via Better Auth API key plugin
- Linear Integration: LinearConfig component

- [ ] **Step 4: Create join page**

Create `apps/web/app/(auth)/join/page.tsx`:
- Reads invite token from URL query param
- Shows invite details, name/password form
- Calls Better Auth `acceptInvitation()` on submit

- [ ] **Step 5: Create landing page**

Create `apps/web/app/page.tsx`:
- If authenticated: redirect to `/dashboard`
- If not: redirect to `/login` (or render a simple landing with login/signup links)

- [ ] **Step 6: Test all pages**

Verify all pages render correctly, data flows properly, filters work, settings save.

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "feat: add agents, dispatches, settings, and join pages"
```

---

## Chunk 4: Polish + Integration

### Task 11: End-to-end integration testing

- [ ] **Step 1: Start full stack**

```bash
pnpm dev  # Starts both apps/web and apps/api
```

- [ ] **Step 2: Test complete flow**

1. Sign up with email/password → org created
2. View empty dashboard (all zeros)
3. Go to settings → configure Linear integration (API key, trigger status)
4. Copy webhook URL
5. Go to settings → create API key for daemon
6. Start a daemon with the API key → agents appear in dashboard
7. Create manual dispatch → agent receives it, status updates flow
8. Verify SSE updates dashboard in real-time
9. Verify dispatch history in dispatches page
10. Invite a second member → they can join and see the same org data

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration testing fixes"
```

### Task 12: CLI update for new auth

**Files:**
- Modify: `cli/index.js`

- [ ] **Step 1: Update WebSocket connection**

In `cli/index.js`, change the WebSocket connection to send the API key in the `Authorization` header instead of in the `register` message body:

```javascript
// Before:
const ws = new WebSocket(hubUrl);
ws.on("open", () => {
  ws.send(JSON.stringify({ type: "register", token: apiKey, machine, agents }));
});

// After:
const ws = new WebSocket(hubUrl, {
  headers: { "Authorization": `Bearer ${apiKey}` },
});
ws.on("open", () => {
  ws.send(JSON.stringify({ type: "register", machine, agents }));
});
```

- [ ] **Step 2: Test CLI connection**

```bash
node cli/index.js start --hub http://localhost:9900 --token <better-auth-api-key>
```

Verify: registers successfully, appears in dashboard agents list, can receive dispatches.

- [ ] **Step 3: Commit**

```bash
git add cli/
git commit -m "feat: update CLI for header-based WebSocket auth"
```

---

### Task 13: Deployment configuration

**Files:**
- Create: `apps/api/Dockerfile` (or `railway.json`)
- Create: `apps/web/Dockerfile` (or let Vercel/Railway auto-detect)

- [ ] **Step 1: Configure API for Railway**

Create `apps/api/railway.json`:
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Environment variables needed:
- `DATABASE_URL` — PostgreSQL connection string
- `WEB_URL` — Frontend URL (for CORS)
- `BETTER_AUTH_SECRET` — Secret for Better Auth
- `PORT` — Server port

- [ ] **Step 2: Configure Web for deployment**

If Railway: similar `railway.json` with `next start`.
If Vercel: auto-detected, set `NEXT_PUBLIC_API_URL` environment variable.

- [ ] **Step 3: Commit**

```bash
git add apps/api/railway.json apps/web/
git commit -m "feat: add deployment configuration"
```
