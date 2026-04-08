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
  memberId: text("member_id").references(() => user.id),
  source: text("source", { enum: ["manual", "linear"] }).notNull().default("manual"),
  status: text("status", { enum: ["pending", "dispatched", "running", "completed", "failed"] }).notNull().default("pending"),
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

All require authentication (session cookie or API key).

#### Dispatches

```
GET    /api/dispatches              List dispatches for active org
                                    Query: ?status=, ?source=, ?agent=, ?limit=, ?offset=
POST   /api/dispatches              Create manual dispatch
                                    Body: { ticketRef, title, description?, labels, priority? }
GET    /api/dispatches/:id          Get single dispatch with messages
GET    /api/dispatches/stats        Aggregate metrics: total, completed, failed, running, avg duration
```

#### Agents

```
GET    /api/agents                  List connected agents for active org
                                    Returns: name, machine, tags, capacity, running count, last heartbeat
```

#### Integrations

```
GET    /api/integrations/linear             Get Linear config (masked API key)
PUT    /api/integrations/linear             Create or update Linear config
                                            Body: { apiKey, triggerStatus, triggerLabels }
DELETE /api/integrations/linear             Remove Linear config
GET    /api/integrations/linear/issues      Proxy: fetch open issues from Linear GraphQL API
```

#### Webhooks (incoming, unauthenticated)

```
POST   /api/webhooks/linear/:orgId  Receive Linear webhook events
                                    Validates event, matches trigger rules, creates dispatch
```

#### Webhook Logs

```
GET    /api/webhook-logs            List webhook events for active org
                                    Query: ?limit=, ?offset=
```

#### Real-time

```
GET    /api/sse                     Server-Sent Events stream
                                    Events: agent:update, dispatch:update, feed:event
```

#### Health

```
GET    /health                      Returns uptime, version, db status
```

## WebSocket Protocol

Unchanged from current implementation. Daemons connect and authenticate with API keys.

### Connection

```
WS /ws
Authorization: Bearer <apiKey>
```

API key verified via Better Auth's `apiKey.verify()` during upgrade. Returns organization context for scoping.

### Messages (daemon → hub)

```typescript
// Register machine + agents
{ type: "register", machine: string, agents: Agent[] }

// Heartbeat (every 5s)
{ type: "heartbeat" }

// Status update during job
{ type: "status", dispatch_id: string, timestamp: string, message: string }

// Job complete
{ type: "complete", dispatch_id: string, success: boolean, exit_code: number, duration_ms: number }
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

## SSE Events

The Hono backend maintains an in-memory event bus. When machine state, dispatches, or agents change, events are pushed to all connected SSE clients scoped to their organization.

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

Stale connection cleanup runs every 15s (same as current).

## Migration Strategy

1. Build the new stack alongside the current `hub/` directory
2. New apps in `apps/web/` and `apps/api/`, new packages in `packages/`
3. Current `hub/` remains as reference during development
4. CLI (`cli/`) unchanged — it connects via WebSocket which has the same protocol
5. On Railway: deploy new services, point domain to new frontend, retire old service
6. Database: Drizzle migrations create new tables. Better Auth tables are auto-generated. Old tables from prototype can coexist or be dropped after validation.

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
- pg (PostgreSQL driver)
- better-auth (adapter)

### packages/types
- zod

## What Is NOT Changing

- CLI tool — same WebSocket protocol, same API key auth
- Agent matching algorithm — same tag-based scoring
- Linear webhook processing logic — same trigger rules
- Deployment platform — Railway (or any platform)
- In-memory machine/agent state model — ephemeral by design
