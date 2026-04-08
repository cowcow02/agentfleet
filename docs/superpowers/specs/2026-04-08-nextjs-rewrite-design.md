# AgentFleet Next.js Rewrite — Design Spec

## Overview

Rewrite the AgentFleet hub from a vanilla Node.js monolith (static HTML + raw HTTP server) to a modern TypeScript stack: Next.js frontend with shadcn/ui, Hono standalone backend, Drizzle ORM, and Better Auth. The goal is a cleaner codebase, typed API contracts, and a professional UI while preserving all current functionality.

## Architecture

Two separate applications in a Turborepo monorepo:

- **apps/web** — Next.js 15 (App Router). Handles all UI rendering, client-side state, and browser auth. Communicates with the API via typed HTTP client and SSE for real-time updates.
- **apps/api** — Hono standalone server on Node.js. Handles REST API, WebSocket (daemon communication), SSE (dashboard real-time), and webhook ingestion. Runs as its own process with direct PostgreSQL access via Drizzle.

Shared packages:

- **packages/db** — Drizzle ORM schema definitions, migrations, DB client, Better Auth adapter config.
- **packages/types** — Zod schemas defining the API contract (request/response shapes, WebSocket messages, SSE events). Both apps import from here.

```
                     ┌─────────────┐
                     │  Browser    │
                     │  (Next.js)  │
                     └──────┬──────┘
                            │ HTTP + SSE
                            ▼
                     ┌─────────────┐       WebSocket        ┌──────────┐
                     │  Hono API   │◄──────────────────────►│  Daemons │
                     │  (Node.js)  │                        │  (CLI)   │
                     └──────┬──────┘                        └──────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │  PostgreSQL │
                     │  (Drizzle)  │
                     └─────────────┘
```

## Project Structure

```
agentfleet/
├── turbo.json                      # Pipeline: build, dev, lint, typecheck
├── pnpm-workspace.yaml             # Workspace: apps/*, packages/*
├── package.json                    # Root scripts, shared devDependencies
│
├── apps/
│   ├── web/                        # Next.js 15 + App Router
│   │   ├── app/
│   │   │   ├── (auth)/             # Route group: unauthenticated pages
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── signup/page.tsx
│   │   │   │   ├── join/page.tsx   # Accept invite
│   │   │   │   └── layout.tsx      # Centered card layout, no sidebar
│   │   │   ├── (dashboard)/        # Route group: authenticated pages
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── agents/page.tsx
│   │   │   │   ├── dispatches/page.tsx
│   │   │   │   ├── settings/page.tsx
│   │   │   │   └── layout.tsx      # Sidebar + header layout
│   │   │   ├── layout.tsx          # Root: providers, fonts, theme
│   │   │   └── page.tsx            # Landing / redirect
│   │   ├── components/             # shadcn/ui + custom components
│   │   │   ├── ui/                 # shadcn/ui primitives
│   │   │   ├── sidebar.tsx
│   │   │   ├── stats-cards.tsx
│   │   │   ├── dispatch-form.tsx
│   │   │   ├── agent-table.tsx
│   │   │   ├── dispatch-list.tsx
│   │   │   └── linear-config.tsx
│   │   ├── lib/
│   │   │   ├── api.ts              # Typed API client (uses @agentfleet/types)
│   │   │   ├── auth-client.ts      # Better Auth client instance
│   │   │   └── use-sse.ts          # SSE React hook for real-time updates
│   │   └── package.json
│   │
│   └── api/                        # Hono standalone backend
│       ├── src/
│       │   ├── index.ts            # Entry: Hono app + HTTP server + WS setup
│       │   ├── auth.ts             # Better Auth server instance + config
│       │   ├── routes/
│       │   │   ├── dispatches.ts   # CRUD + stats
│       │   │   ├── agents.ts       # List connected agents
│       │   │   ├── integrations.ts # Linear config CRUD + issue proxy
│       │   │   ├── webhooks.ts     # Linear webhook receiver
│       │   │   ├── webhook-logs.ts # Webhook event log
│       │   │   ├── sse.ts          # SSE endpoint
│       │   │   └── health.ts       # Health check
│       │   ├── ws/
│       │   │   └── handler.ts      # WebSocket: register, heartbeat, status, complete
│       │   ├── middleware/
│       │   │   ├── auth.ts         # Session + API key middleware (via Better Auth)
│       │   │   └── cors.ts         # CORS config
│       │   └── lib/
│       │       ├── dispatch.ts     # Agent matching + dispatch creation
│       │       ├── machines.ts     # In-memory machine/agent state + event emitter
│       │       └── events.ts       # SSE event bus (machine state → SSE clients)
│       └── package.json
│
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   ├── schema.ts           # Drizzle table definitions (our tables)
│   │   │   ├── auth-schema.ts      # Better Auth generated schema
│   │   │   ├── index.ts            # DB client + connection export
│   │   │   └── migrate.ts          # Migration runner
│   │   ├── drizzle/                # Generated SQL migrations
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   └── types/
│       ├── src/
│       │   ├── api.ts              # Zod schemas: request/response for all endpoints
│       │   ├── ws.ts               # WebSocket message type unions
│       │   ├── sse.ts              # SSE event types
│       │   ├── entities.ts         # Dispatch, Integration, WebhookLog types
│       │   └── index.ts            # Re-exports
│       └── package.json
│
├── hub/                            # Current prototype (kept as reference)
├── cli/                            # CLI tool (unchanged for now)
└── docs/
```

## Authentication — Better Auth

Better Auth replaces all custom auth code. It manages user accounts, sessions, organizations (teams), invitations, and API keys.

### Better Auth Server Config (apps/api/src/auth.ts)

```typescript
import { betterAuth } from "better-auth";
import { organization, apiKey } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@agentfleet/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [
    organization({
      // owner, admin, member roles built-in
    }),
    apiKey({
      // org-scoped API keys for daemon auth
    }),
  ],
});
```

### Better Auth Client (apps/web/lib/auth-client.ts)

```typescript
import { createAuthClient } from "better-auth/react";
import { organizationClient, apiKeyClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [organizationClient(), apiKeyClient()],
});
```

### Hono Integration

```typescript
// Mount Better Auth handler
app.on(["POST", "GET"], "/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

// Session middleware for authenticated routes
app.use("/api/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});
```

### Auth Flows

| Flow | Method |
|------|--------|
| Sign up + create org | Better Auth signup → create organization → set as active |
| Login | Better Auth email+password sign-in |
| Invite member | Organization plugin `inviteMember()` → email with link |
| Join via invite | Accept invitation → auto-join organization |
| Daemon auth | API Key plugin: admin creates org-scoped key, daemon sends in header |
| WebSocket auth | API key verified during WS upgrade via `auth.api.verifyApiKey()` |
| Session management | DB-backed, cookie-based, auto-expiry, revocable |

### Tables Managed by Better Auth

These are auto-generated and managed by Better Auth's Drizzle adapter:

- `user` — id, name, email, image, emailVerified, createdAt, updatedAt
- `account` — userId, provider, password hash (for email+password)
- `session` — userId, token, expiresAt, activeOrganizationId, ipAddress, userAgent
- `organization` — id, name, slug, logo, createdAt
- `member` — userId, organizationId, role, createdAt
- `invitation` — organizationId, email, role, status, expiresAt, inviterId
- `apikey` — id, name, key (hashed), organizationId, permissions, expiresAt, metadata

## Database — Our Tables (Drizzle Schema)

Only three application-specific tables:

### dispatches

```typescript
export const dispatches = pgTable("dispatches", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().references(() => organization.id),
  ticketRef: text("ticket_ref").notNull(),           // e.g. "KIP-301"
  title: text("title").notNull(),
  description: text("description"),
  labels: text("labels").array().notNull().default([]),
  priority: text("priority", { enum: ["low", "medium", "high", "critical"] }).notNull().default("medium"),
  agentName: text("agent_name").notNull(),
  machineName: text("machine_name").notNull(),
  createdBy: text("created_by").references(() => user.id),
  source: text("source", { enum: ["manual", "linear"] }).notNull().default("manual"),
  status: text("status", { enum: ["dispatched", "running", "completed", "failed"] }).notNull().default("dispatched"),
  exitCode: integer("exit_code"),
  durationMs: integer("duration_ms"),
  messages: jsonb("messages").$type<{ message: string; timestamp: string }[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("idx_dispatches_org").on(table.organizationId),
  statusIdx: index("idx_dispatches_status").on(table.status),
}));
```

### integrations

```typescript
export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().references(() => organization.id),
  type: text("type", { enum: ["linear"] }).notNull(),
  config: jsonb("config").$type<LinearConfig>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgTypeIdx: uniqueIndex("idx_integrations_org_type").on(table.organizationId, table.type),
}));

type LinearConfig = {
  apiKey: string;
  triggerStatus: string;
  triggerLabels: string[];
};
```

### webhook_logs

```typescript
export const webhookLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id),
  integration: text("integration", { enum: ["linear"] }).notNull(),
  action: text("action").notNull(),     // dispatched, ignored, rejected, no_match
  reason: text("reason"),
  payload: jsonb("payload"),
  dispatchId: uuid("dispatch_id").references(() => dispatches.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("idx_webhook_logs_org").on(table.organizationId),
}));
```

## API Design

### Auth Routes (Better Auth — automatic)

All mounted at `/api/auth/*`. Handled entirely by Better Auth.

```
POST /api/auth/sign-up/email        Sign up with email + password
POST /api/auth/sign-in/email        Sign in with email + password
POST /api/auth/sign-out             Sign out (revoke session)
GET  /api/auth/session              Get current session + user
POST /api/auth/organization/create  Create organization
POST /api/auth/organization/invite  Invite member
POST /api/auth/organization/accept  Accept invitation
POST /api/auth/api-key/create       Create org-scoped API key
POST /api/auth/api-key/delete       Revoke API key
```

### Application Routes (Hono)

All routes under `/api/*` require authentication (session cookie or API key), **except**:
- `/api/auth/**` — handled by Better Auth
- `/api/webhooks/**` — incoming webhook endpoints (unauthenticated, validated by payload signature)
- `/health` — health check (outside `/api/` prefix)

The auth middleware must explicitly skip these paths.

#### Dashboard

```
GET    /api/dashboard/stats         Aggregate view for the dashboard
                                    Response: {
                                      machinesOnline: number,
                                      agentsRegistered: number,
                                      runningJobs: number,
                                      totalDispatches: number,
                                      completed: number,
                                      failed: number,
                                      avgDurationSeconds: number,
                                      totalAgentSeconds: number
                                    }
                                    Note: machinesOnline, agentsRegistered, runningJobs come from
                                    in-memory state. The rest are DB aggregates from dispatches.
```

#### Dispatches

```
GET    /api/dispatches              List dispatches for active org
                                    Query: ?status=, ?source=, ?agent=, ?limit=, ?offset=
                                    Response: { dispatches: Dispatch[], total: number }
POST   /api/dispatches              Create manual dispatch
                                    Body: { ticketRef, title, description?, labels (required), priority? }
                                    Response: { id, agentName, machineName, status }
                                    Note: labels is required — agent matching scores by label/tag overlap.
                                    A dispatch with empty labels will fail (no agent can match).
GET    /api/dispatches/:id          Get single dispatch with messages
                                    Response: Dispatch (full, including messages array)
```

#### Agents

```
GET    /api/agents                  List connected agents for active org
                                    Response: { agents: Agent[], machinesOnline: number }
                                    Each agent: { name, machine, tags, capacity, running, lastHeartbeat }
```

#### Integrations

```
GET    /api/integrations/linear             Get Linear config (API key masked)
                                            Response: { configured: boolean, triggerStatus?, triggerLabels?, webhookUrl }
PUT    /api/integrations/linear             Create or update Linear config
                                            Body: { apiKey, triggerStatus, triggerLabels }
DELETE /api/integrations/linear             Remove Linear config
                                            Behavior: deletes the integration row. Does not delete webhook_logs.
                                            Existing Linear webhooks pointing to the old URL will receive 404s
                                            until reconfigured. No cleanup of external Linear webhook config.
GET    /api/integrations/linear/issues      Proxy: fetch open issues from Linear GraphQL API
                                            Response: { issues: LinearIssue[] }
```

#### Webhooks (incoming, unauthenticated — excluded from auth middleware)

```
POST   /api/webhooks/linear/:orgId  Receive Linear webhook events
                                    Validates event, matches trigger rules, creates dispatch
```

#### Webhook Logs

```
GET    /api/webhook-logs            List webhook events for active org
                                    Query: ?limit=, ?offset=
                                    Response: { logs: WebhookLogEntry[], total: number }
```

#### Real-time

```
GET    /api/sse                     Server-Sent Events stream
                                    Requires auth: session cookie validated on connection.
                                    Events scoped to user's active organization via session.activeOrganizationId.
                                    Events: agent:update, dispatch:update, feed:event
```

#### Health

```
GET    /health                      Returns uptime, version, db status (unauthenticated)
```

### Member Management

Member listing, invitation, removal, and role management are handled entirely by Better Auth's organization plugin. The relevant endpoints are:

```
Better Auth org endpoints (automatic):
  GET    /api/auth/organization/members     List members of active org
  POST   /api/auth/organization/invite      Invite member by email
  POST   /api/auth/organization/accept      Accept invitation
  POST   /api/auth/organization/reject      Reject invitation
  DELETE /api/auth/organization/remove-member  Remove member (admin/owner only)
```

When a member is removed via Better Auth, the API server listens for the removal event and disconnects any active WebSocket connections associated with that member's API keys.

### Error Response Format

All error responses use a consistent shape defined in `packages/types`:

```typescript
{ error: string, code?: string }
```

HTTP status codes: 200, 201 (created), 400 (bad input), 401 (auth), 403 (permission), 404 (not found), 409 (conflict), 422 (validation).

## WebSocket Protocol

The WebSocket protocol changes slightly from the current implementation. The CLI will need a corresponding update as part of this rewrite.

### Connection

```
WS /ws
Authorization: Bearer <apiKey>
```

API key verified via Better Auth's `apiKey.verify()` during HTTP upgrade. Returns organization context for scoping. The current prototype authenticates via a `token` field inside the first `register` message — this moves to the HTTP header for cleaner separation of auth and application concerns.

**CLI update required:** The CLI must send the API key in the `Authorization` header during WebSocket upgrade instead of in the `register` message body. The `register` message no longer includes a `token` field.

### Messages (daemon → hub)

```typescript
// Register machine + agents (token field removed — auth is in WS upgrade header)
{ type: "register", machine: string, agents: Agent[] }

// Heartbeat (every 5s)
{ type: "heartbeat" }

// Status update during job
{ type: "status", dispatch_id: string, timestamp: string, message: string }

// Job complete — uses duration_seconds for backward compat with CLI
{ type: "complete", dispatch_id: string, success: boolean, exit_code: number, duration_seconds: number }
```

### Messages (hub → daemon)

```typescript
// Dispatch work
{ type: "dispatch", dispatch_id: string, agent: string, ticket: Ticket }

// Registration confirmed
{ type: "registered", machine: string, agents: number }

// Error
{ type: "error", message: string }

// Acknowledgement
{ type: "ack", dispatch_id: string }
```

### Duration Field Convention

The WebSocket `complete` message uses `duration_seconds` (matching the current CLI). The API server converts to milliseconds before storing as `duration_ms` in the database (`duration_seconds * 1000`). The REST API returns `durationMs` to the frontend. This keeps the daemon protocol simple (whole seconds are sufficient for job timing) while the DB stores with higher precision for future use.

## SSE Events

The Hono backend maintains an in-memory event bus. The `GET /api/sse` endpoint validates the session cookie on connection (same auth middleware as other `/api/*` routes), then reads `session.activeOrganizationId` to scope events. When machine state, dispatches, or agents change, events are pushed to all connected SSE clients for that organization.

```typescript
// Agent connected/disconnected/updated
{ event: "agent:update", data: { agents: Agent[], machines: number } }

// Dispatch created/status changed
{ event: "dispatch:update", data: { dispatch: Dispatch } }

// General feed event (for live feed panel)
{ event: "feed:event", data: { message: string, timestamp: string, type: string } }
```

## Frontend Pages

### (auth) Route Group — Layout: centered card, no sidebar

| Page | Component | Functionality |
|------|-----------|---------------|
| `/login` | LoginForm | Email + password via Better Auth client |
| `/signup` | SignupForm | Create account + organization |
| `/join` | JoinForm | Accept org invitation from email link |

### (dashboard) Route Group — Layout: sidebar + header

| Page | Key Components | Data |
|------|---------------|------|
| `/dashboard` | StatsCards, DispatchForm (Manual + Linear tabs), FleetOverview, LiveFeed | `GET /api/dispatches/stats` + `GET /api/agents` + SSE |
| `/agents` | AgentTable (name, machine, tags, capacity, status, last seen) | `GET /api/agents` + SSE |
| `/dispatches` | DispatchList with filters (status, source), status badges, duration | `GET /api/dispatches` |
| `/settings` | OrgInfo, MembersList, InviteForm, APIKeyManager, LinearConfig | Better Auth org endpoints + `/api/integrations/linear` |

### Theming

shadcn/ui with customized CSS variables:

- Dark mode as default (matching current UI)
- Light mode supported via toggle
- Color palette derived from current: dark backgrounds, muted borders, teal/green accent
- shadcn/ui components used as-is where possible, minimal custom overrides

## Agent Matching Logic

Unchanged from current implementation:

1. Extract labels from dispatch request
2. Score each connected agent by tag overlap with labels
3. Require at least one matching tag
4. Pick highest-scoring agent with available capacity
5. Ties broken by registration order

## In-Memory State

Same as current — machines, agents, and WebSocket connections are ephemeral:

```typescript
// machines.ts
const machines = new Map<string, Machine>();  // key: "${orgId}:${machineName}"

interface Machine {
  orgId: string;
  name: string;
  ws: WebSocket;
  agents: Map<string, Agent>;
  lastHeartbeat: Date;
}

interface Agent {
  name: string;
  tags: string[];
  capacity: number;
  running: number;
}
```

Stale connection cleanup runs every 15s. A machine is considered stale if its WebSocket is disconnected (readyState !== OPEN) or no heartbeat has been received for 60 seconds. Stale machines are removed from the map and their agents are no longer eligible for dispatch.

## Migration Strategy

1. Build the new stack alongside the current `hub/` directory
2. New apps in `apps/web/` and `apps/api/`, new packages in `packages/`
3. Current `hub/` remains as reference during development
4. CLI (`cli/`) updated for new WS auth (header-based API key)
5. On Railway: deploy new services, point domain to new frontend, retire old service
6. Database: Drizzle migrations create new tables. Better Auth tables are auto-generated. Old tables from prototype can coexist or be dropped after validation.
7. Linear webhook URL changes from `/webhooks/linear/:teamId` to `/api/webhooks/linear/:orgId`. After deploying the new API, update the webhook URL in Linear's API settings to point to the new path. The old path will 404 on the new server.

## Dependencies

### apps/web
- next, react, react-dom
- @agentfleet/types, @agentfleet/db
- better-auth (client)
- tailwindcss, @shadcn/ui components
- zod

### apps/api
- hono, @hono/node-server
- @agentfleet/types, @agentfleet/db
- better-auth (server + plugins: organization, apiKey)
- ws (WebSocket)
- zod

### packages/db
- drizzle-orm, drizzle-kit
- pg (PostgreSQL driver, via `drizzle-orm/node-postgres` adapter)
- better-auth (adapter)

### packages/types
- zod

## What Changes in the CLI

The CLI (`cli/`) requires a minor update:
- **WebSocket auth**: Move API key from `register` message body to `Authorization` header during WS upgrade
- **API key format**: Use Better Auth-generated API keys instead of `afm_*` tokens

The CLI's core behavior (register, heartbeat, status, complete) and WebSocket message shapes are otherwise unchanged.

## What Is NOT Changing

- Agent matching algorithm — same tag-based scoring
- Linear webhook processing logic — same trigger rules
- Deployment platform — Railway (or any platform)
- In-memory machine/agent state model — ephemeral by design
- WebSocket message types and payloads (except `register` dropping the `token` field)
- Duration reported by daemons in seconds
