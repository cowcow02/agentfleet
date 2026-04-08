# Dashboard Frontend Research

## Architecture Decision: SPA vs Server-Rendered

| Approach | Pros | Cons |
|---|---|---|
| **React SPA** | Rich interactivity, huge ecosystem, team familiarity | Build step, larger bundle, SEO irrelevant |
| **SvelteKit** | Tiny bundle, fast, built-in SSR | Smaller ecosystem, hiring pool |
| **HTMX + server templates** | No build step, tiny JS, simple | Limited interactivity, no WebSocket integration |
| **Next.js** | Full-featured, SSR + SPA hybrid | Heavy, overkill for internal tool |

### Recommendation: React SPA (Vite)

**React is the right choice for the AgentFleet dashboard.** Reasoning:

1. **Real-time WebSocket updates are critical.** The dashboard needs live agent status, ticket pipeline, and fleet visibility -- all pushed via WebSocket. React's state management handles this naturally. HTMX is not designed for persistent WebSocket-driven UIs.

2. **Internal tool, not a consumer app.** SEO is irrelevant. Server-side rendering adds complexity with zero benefit. A static SPA served by the hub's HTTP server is the simplest architecture.

3. **Ecosystem breadth.** React has the most charting libraries, UI component libraries, and developer familiarity. For an internal tool where development speed matters, this is a real advantage.

4. **SvelteKit considered.** Svelte produces smaller bundles and is faster to render. For a larger consumer app, it would be worth the ecosystem tradeoff. For an internal dashboard with ~5 views, the bundle size difference (100 KB vs 50 KB) is meaningless. Team familiarity with React tips the balance.

5. **HTMX considered.** Excellent for server-rendered CRUD applications. But the dashboard needs real-time updates (WebSocket), interactive charts, and state management that HTMX does not handle well. Adding Alpine.js or similar to compensate defeats the purpose of HTMX's simplicity.

### Build and Serve Architecture

```
┌──────────────────────────────────────────────┐
│  Hub Server (Hono)                           │
│                                              │
│  GET /dashboard/*  --> serve static files     │
│  GET /api/*        --> REST API               │
│  WS  /ws/dashboard --> real-time updates      │
│                                              │
│  Static files: ./dist/dashboard/             │
│    index.html                                │
│    assets/                                   │
│      app-[hash].js                           │
│      app-[hash].css                          │
└──────────────────────────────────────────────┘
```

Build the dashboard with Vite, output to `dist/dashboard/`, and serve it as static files from the hub. No separate frontend server needed.

```typescript
// Hub: serve dashboard
import { serveStatic } from '@hono/node-server/serve-static';

// Static assets
app.use('/dashboard/assets/*', serveStatic({ root: './dist/dashboard' }));

// SPA fallback for client-side routing
app.get('/dashboard/*', serveStatic({ path: './dist/dashboard/index.html' }));
app.get('/dashboard', serveStatic({ path: './dist/dashboard/index.html' }));
```

## Real-Time Updates: WebSocket from Hub

The dashboard connects to the hub's WebSocket server (same server, different path) to receive live updates:

```typescript
// Dashboard client
function useLiveFleet() {
  const [fleet, setFleet] = useState<FleetState | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`wss://${window.location.host}/ws/dashboard`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'fleet_snapshot':
          setFleet(msg.payload);
          break;
        case 'agent_status_update':
          setFleet(prev => updateAgentStatus(prev, msg.payload));
          break;
        case 'assignment_update':
          setFleet(prev => updateAssignment(prev, msg.payload));
          break;
        case 'machine_connect':
        case 'machine_disconnect':
          setFleet(prev => updateMachineStatus(prev, msg.payload));
          break;
      }
    };

    return () => ws.close();
  }, []);

  return fleet;
}
```

**Same WebSocket server, different path:** Dashboard WebSocket connections go through `@hono/node-ws` on `/ws/dashboard`. Daemon connections go through raw `ws` on `/ws/daemon` with API key auth. This avoids dashboard users needing machine API keys.

### Dashboard WebSocket Authentication

```typescript
// Dashboard WS connects with session cookie (same origin, cookies sent automatically)
// Hub verifies session before accepting the upgrade
app.get('/ws/dashboard', upgradeWebSocket((c) => {
  // Hono middleware has already verified the session cookie
  return {
    onOpen(event, ws) {
      // Send initial fleet snapshot
      ws.send(JSON.stringify({
        type: 'fleet_snapshot',
        payload: fleetState.getSnapshot(),
      }));
    },
    onMessage(event, ws) {
      // Dashboard can send requests (e.g., pause agent)
    },
  };
}));
```

## Key Dashboard Views

### 1. Fleet Overview (Home)

Purpose: At-a-glance status of all connected machines and agents.

```
┌─────────────────────────────────────────────────────┐
│  Fleet Status                                       │
│                                                     │
│  Machines: 5 online / 1 offline                     │
│  Agents:   12 total / 8 idle / 3 working / 1 paused│
│  Queue:    2 tickets waiting                        │
│                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Alice's Mac  │ │ Bob's Mac   │ │ CI Server   │   │
│  │ ● Online     │ │ ● Online    │ │ ○ Offline   │   │
│  │ 3 agents     │ │ 2 agents    │ │ 4 agents    │   │
│  │ CPU: 45%     │ │ CPU: 12%    │ │ Last: 2h ago│   │
│  └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                     │
│  Active Assignments                                 │
│  ┌──────────────────────────────────────────────┐   │
│  │ PROJ-123  → backend@alice   Working  5m      │   │
│  │ PROJ-124  → frontend@bob    Working  12m     │   │
│  │ PROJ-125  → backend         Queued   --      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2. Agent Registry

Purpose: All discovered agents from all connected machines. Shows tags, capacity, and current load.

| Agent | Machine | Tags | Capacity | Current | Status |
|---|---|---|---|---|---|
| backend | alice-mac | backend, node, api | 2 | 1 | Working on PROJ-123 |
| frontend | alice-mac | frontend, react | 1 | 0 | Idle |
| backend | bob-mac | backend, python | 2 | 1 | Working on PROJ-124 |
| docs | bob-mac | docs, markdown | 1 | 0 | Paused |

### 3. Ticket Pipeline

Purpose: Track tickets from ingest to completion.

```
Incoming (3)  →  Queued (2)  →  Assigned (3)  →  Working (2)  →  Done (15)
```

Table view with columns: Ticket ID, Source (Jira/Linear/GitHub), Title, Status, Agent, Duration, Cost.

### 4. Metrics Dashboard

Purpose: Operational metrics over time.

Key metrics:
- **Tickets/day:** Line chart, trend over time
- **Time-to-PR:** Average time from dispatch to PR creation
- **Agent utilization:** Percentage of time agents are actively working vs idle
- **Cost tracking:** Token usage and estimated cost per ticket
- **Throughput by agent/machine:** Which agents are most productive
- **Queue depth over time:** Are tickets backing up?

### 5. Alerts View

Purpose: Actionable problems that need attention.

| Alert | Severity | Details |
|---|---|---|
| Machine offline with queued tickets | High | CI Server has 3 queued tickets, offline for 2 hours |
| Agent stuck | Medium | backend@alice working on PROJ-123 for 45 minutes (threshold: 30m) |
| High queue depth | Low | 5 tickets queued, only 2 agents available |
| Budget exceeded | High | Agent PROJ-125 exceeded $5 budget limit |

## Charting Library: Recharts

**Recommendation: Recharts** for the metrics dashboard.

| Library | Bundle Size | React Integration | Learning Curve | Customization |
|---|---|---|---|---|
| **Recharts** | ~200 KB | Native components | Low | Good |
| **Chart.js (react-chartjs-2)** | ~180 KB | Wrapper | Low | Good |
| **Visx** | ~100 KB (modular) | Low-level primitives | High | Excellent |
| **Nivo** | ~300 KB | Component-based | Medium | Excellent |

**Why Recharts:**
- Declarative React components (`<LineChart>`, `<BarChart>`, `<PieChart>`)
- Most common charts (line, bar, area, pie) are all we need
- Good documentation and examples
- Reasonable bundle size for an internal tool
- No D3 knowledge required

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function TicketsPerDayChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Alternative considered: Visx.** Visx provides low-level primitives for fully custom charts. The flexibility is not needed for standard dashboard charts, and the learning curve is much steeper.

## UI Component Library

For an internal tool, avoid heavy component libraries. Options:

| Library | Size | Styling | Notes |
|---|---|---|---|
| **shadcn/ui** | Copy-paste (no dep) | Tailwind CSS | Best for internal tools |
| **Radix UI** | Small per-component | Unstyled | Accessible primitives |
| **Ant Design** | ~1 MB | Built-in | Heavy, opinionated |
| **Material UI** | ~500 KB | Theme system | Heavy, consumer-oriented |

**Recommendation: shadcn/ui + Tailwind CSS.**

- Components are copied into your project (not an npm dependency)
- Fully customizable
- Tailwind CSS for utility-first styling
- Accessible (built on Radix primitives)
- Minimal bundle impact
- Perfect fit for internal tools (tables, cards, badges, dropdowns, dialogs)

## Minimal Bundle Strategy

For an internal tool:

1. **No SSR.** Pure client-side SPA. Eliminates server-rendering complexity.
2. **Code splitting by route.** Each dashboard view is a lazy-loaded chunk.
3. **Tree-shaking.** Vite + ESM handles this automatically.
4. **No heavy animation libraries.** CSS transitions suffice for internal tools.
5. **Target:** Entire dashboard under 500 KB gzipped (including React, Recharts, shadcn).

```typescript
// Route-based code splitting
const FleetOverview = lazy(() => import('./views/FleetOverview'));
const AgentRegistry = lazy(() => import('./views/AgentRegistry'));
const TicketPipeline = lazy(() => import('./views/TicketPipeline'));
const Metrics = lazy(() => import('./views/Metrics'));
const Alerts = lazy(() => import('./views/Alerts'));
const Settings = lazy(() => import('./views/Settings'));
```

## Data Fetching

Use `@tanstack/react-query` for REST API calls (agent registry, historical metrics, settings):

```typescript
import { useQuery } from '@tanstack/react-query';

function useAssignments() {
  return useQuery({
    queryKey: ['assignments'],
    queryFn: () => fetch('/api/assignments').then(r => r.json()),
    refetchInterval: 30_000, // Fallback polling in case WS disconnects
  });
}
```

Combine with WebSocket for real-time updates: WebSocket pushes invalidate React Query cache, triggering re-renders without polling.

```typescript
// When WS message arrives:
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'assignment_update') {
    queryClient.invalidateQueries({ queryKey: ['assignments'] });
  }
};
```

## Dependencies (Dashboard)

```
react                       # UI framework
react-dom                   # DOM renderer
react-router-dom            # Client-side routing
@tanstack/react-query       # Data fetching + caching
recharts                    # Charting
tailwindcss                 # Utility CSS
@radix-ui/react-*           # Accessible primitives (via shadcn)
vite                        # Build tool (dev dependency)
```

## Sources

- [React Chart Libraries for 2025 - OpenReplay](https://blog.openreplay.com/react-chart-libraries-2025/)
- [JavaScript Chart Libraries 2026 - Luzmo](https://www.luzmo.com/blog/javascript-chart-libraries)
- [Best React Chart Libraries 2025 - LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/)
- [HTMX vs React - Strapi](https://strapi.io/blog/htmx-vs-react-comparing-both-libraries)
- [Svelte vs React](https://sveltekit.io/blog/svelte-vs-react)
- [HTMX vs SvelteKit Benchmarks 2026](https://medium.com/django-journal/htmx-vs-sveltekit-for-django-frontends-2026-migration-benchmarks-from-20-projects-3e55afc1e64e)
