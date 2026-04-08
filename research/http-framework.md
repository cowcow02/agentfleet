# Hub HTTP Framework Research

## Framework Comparison

| Feature | Hono | Fastify | Express |
|---|---|---|---|
| **Performance (req/s)** | ~25,000 | ~30,000 | ~15,000 |
| **TypeScript** | Native (written in TS) | Good support (@types) | @types/express |
| **Bundle size** | ~14 KB (core) | ~2 MB | ~500 KB |
| **Schema validation** | Zod adapter, Valibot | Built-in (JSON Schema) | Manual (middleware) |
| **WebSocket support** | @hono/node-ws | @fastify/websocket | express-ws (fragile) |
| **OpenAPI generation** | @hono/zod-openapi | @fastify/swagger | swagger-jsdoc |
| **Middleware ecosystem** | Growing (50+) | Large (200+) | Massive (1000+) |
| **Multi-runtime** | Node, Bun, Deno, Edge | Node.js only | Node.js only |
| **Plugin system** | Middleware chain | Encapsulated plugins | Middleware chain |
| **Request parsing** | Built-in | Built-in | body-parser needed |
| **Error handling** | Built-in HTTPException | Built-in error handler | Manual middleware |
| **Stability** | v4.x (stable, mature) | v5.x (very mature) | v4.x (legacy) |

## Recommendation: Hono

**Hono is the best fit for the AgentFleet hub.** Here is the reasoning:

### 1. Native TypeScript and Modern Design

Hono is written in TypeScript from the ground up. Every route handler, middleware, and context object is fully typed. This aligns with AgentFleet being a TypeScript project.

```typescript
import { Hono } from 'hono';

const app = new Hono();

app.get('/api/agents', (c) => {
  // c.req, c.json(), c.text() -- all fully typed
  return c.json({ agents: [] });
});
```

### 2. WebSocket + HTTP on the Same Server

Hono supports WebSocket via `@hono/node-ws`, sharing the same server instance:

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// HTTP routes
app.post('/webhooks/jira', async (c) => {
  const body = await c.req.json();
  return c.json({ received: true });
});

app.get('/api/agents', (c) => {
  return c.json({ agents: [] });
});

// WebSocket route on the same server
app.get('/ws', upgradeWebSocket((c) => ({
  onOpen(event, ws) {
    console.log('Daemon connected');
  },
  onMessage(event, ws) {
    const msg = JSON.parse(event.data as string);
    // Handle daemon messages
  },
  onClose() {
    console.log('Daemon disconnected');
  },
})));

const server = serve({ fetch: app.fetch, port: 3001 });
injectWebSocket(server);
```

**Important note on WebSocket approach:** While `@hono/node-ws` works for the dashboard's real-time updates, for the daemon WebSocket server we should use `ws` directly in `noServer` mode (see websocket.md) attached to the same HTTP server. This gives us full control over authentication during the upgrade handshake, which `@hono/node-ws` does not expose well. The two WebSocket paths can coexist:

```typescript
// Path 1: /ws/daemon -- handled by raw `ws` with noServer for auth control
// Path 2: /ws/dashboard -- handled by @hono/node-ws for simpler dashboard connections
```

### 3. Lightweight and Fast

At ~14 KB core, Hono adds minimal overhead. For a self-hosted server that may run on a developer's machine alongside other processes, this matters.

### 4. OpenAPI Support via Zod

`@hono/zod-openapi` enables defining routes with Zod schemas that simultaneously validate requests and generate OpenAPI docs:

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

const route = createRoute({
  method: 'post',
  path: '/api/dispatch',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            ticketId: z.string(),
            agentTag: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Dispatch accepted',
      content: {
        'application/json': {
          schema: z.object({ assignmentId: z.string() }),
        },
      },
    },
  },
});
```

### 5. Static File Serving for Dashboard SPA

```typescript
import { serveStatic } from '@hono/node-server/serve-static';

// Serve dashboard SPA
app.use('/dashboard/*', serveStatic({ root: './dist/dashboard' }));

// SPA fallback -- serve index.html for client-side routing
app.get('/dashboard/*', serveStatic({ path: './dist/dashboard/index.html' }));
```

### Why Not Fastify

Fastify is excellent and more mature, but:
- Its plugin encapsulation model adds complexity for a relatively simple API surface
- JSON Schema validation is verbose compared to Zod
- WebSocket support via `@fastify/websocket` is adequate but less integrated
- Node.js only -- if we ever want to run tests in Bun or deploy edge functions, we are locked in
- Larger footprint for what is essentially a webhook receiver + REST API + WS server

### Why Not Express

Express is legacy at this point:
- No built-in TypeScript support
- No built-in request validation
- Middleware ordering is error-prone
- Performance is notably worse
- The ecosystem advantages do not matter here (we need very few middlewares)

## Webhook Signature Verification

The hub receives webhooks from Jira, Linear, and GitHub. Each has different signing mechanisms. We need access to the **raw request body** for HMAC verification.

### Raw Body Access in Hono

Hono does not parse the body automatically, so we have direct access to the raw body:

```typescript
app.post('/webhooks/:platform', async (c) => {
  const rawBody = await c.req.raw.text();
  const platform = c.req.param('platform');

  switch (platform) {
    case 'github':
      if (!verifyGithubSignature(rawBody, c.req.header('x-hub-signature-256'))) {
        return c.json({ error: 'Invalid signature' }, 401);
      }
      break;
    case 'linear':
      if (!verifyLinearSignature(rawBody, c.req.header('linear-signature'))) {
        return c.json({ error: 'Invalid signature' }, 401);
      }
      break;
    case 'jira':
      if (!verifyJiraSignature(rawBody, c.req.header('x-atlassian-webhook-signature'))) {
        return c.json({ error: 'Invalid signature' }, 401);
      }
      break;
  }

  const body = JSON.parse(rawBody);
  // Process webhook event...
  return c.json({ received: true });
});
```

### Signature Verification Utility

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyHmacSha256(
  rawBody: string,
  secret: string,
  signature: string,
  prefix: string = ''
): boolean {
  if (!signature) return false;

  const computed = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expected = prefix ? signature.replace(prefix, '') : signature;

  return timingSafeEqual(
    Buffer.from(computed, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// Platform-specific wrappers
function verifyGithubSignature(body: string, header: string | undefined): boolean {
  if (!header) return false;
  return verifyHmacSha256(body, GITHUB_WEBHOOK_SECRET, header, 'sha256=');
}

function verifyLinearSignature(body: string, header: string | undefined): boolean {
  if (!header) return false;
  return verifyHmacSha256(body, LINEAR_WEBHOOK_SECRET, header);
}

function verifyJiraSignature(body: string, header: string | undefined): boolean {
  if (!header) return false;
  return verifyHmacSha256(body, JIRA_WEBHOOK_SECRET, header);
}
```

## CORS, Rate Limiting, Request Validation

### CORS (for dashboard SPA)

```typescript
import { cors } from 'hono/cors';

// Only needed for dashboard API calls if SPA is on a different origin
app.use('/api/*', cors({
  origin: ['http://localhost:5173'], // dev
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
```

### Rate Limiting

Hono does not ship a built-in rate limiter, but a simple in-memory one is sufficient for self-hosted:

```typescript
import { rateLimiter } from 'hono-rate-limiter';

// Or implement a simple one:
const rateLimit = new Map<string, { count: number; resetAt: number }>();

app.use('/webhooks/*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const entry = rateLimit.get(ip);

  if (entry && entry.resetAt > now && entry.count >= 100) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  if (!entry || entry.resetAt <= now) {
    rateLimit.set(ip, { count: 1, resetAt: now + 60_000 });
  } else {
    entry.count++;
  }

  await next();
});
```

### Request Validation with Zod

```typescript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const dispatchSchema = z.object({
  ticketId: z.string().min(1),
  agentTag: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

app.post('/api/dispatch',
  zValidator('json', dispatchSchema),
  async (c) => {
    const data = c.req.valid('json');
    // data is fully typed: { ticketId: string, agentTag: string, priority: 'low' | 'medium' | 'high' }
    return c.json({ assignmentId: 'assign_123' });
  }
);
```

## Hub Server Architecture Summary

```
┌─────────────────────────────────────────────┐
│  Hono App (single Node.js process)          │
│                                             │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │ HTTP Routes      │  │ WebSocket Server │  │
│  │                  │  │                  │  │
│  │ POST /webhooks/* │  │ /ws/daemon (ws)  │  │
│  │ GET  /api/*      │  │ /ws/dash (hono)  │  │
│  │ GET  /dashboard  │  │                  │  │
│  └─────────────────┘  └──────────────────┘  │
│           │                    │             │
│           └────────┬───────────┘             │
│                    │                         │
│           ┌────────▼────────┐                │
│           │  @hono/node-server              │
│           │  (single HTTP server)           │
│           └─────────────────┘                │
└─────────────────────────────────────────────┘
```

## Dependencies

```
hono                    # Core framework
@hono/node-server       # Node.js adapter
@hono/node-ws           # WebSocket support (dashboard)
@hono/zod-openapi       # OpenAPI + validation
@hono/zod-validator     # Request validation middleware
ws                      # WebSocket server (daemon connections)
```

## Sources

- [Node.js Application Servers in 2026: Express, Fastify, Hono](https://www.deployhq.com/blog/node-application-servers-in-2025-from-express-to-modern-solutions)
- [Fastify vs Express vs Hono - Better Stack](https://betterstack.com/community/guides/scaling-nodejs/fastify-vs-express-vs-hono/)
- [Beyond Express: Fastify vs Hono](https://dev.to/alex_aslam/beyond-express-fastify-vs-hono-which-wins-for-high-throughput-apis-373i)
- [Hono vs Fastify - Better Stack](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/)
- [Hono WebSocket Helper](https://hono.dev/docs/helpers/websocket)
- [@hono/node-ws](https://github.com/honojs/middleware/tree/main/packages/node-ws)
- [Hono Benchmarks](https://hono.dev/docs/concepts/benchmarks)
