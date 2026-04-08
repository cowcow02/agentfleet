# Database for Registry Research

## Requirements Analysis

### What Must Be Persistent

| Data | Access Pattern | Volume | Notes |
|---|---|---|---|
| Teams/orgs | Read-heavy, rare writes | Tens | Created once |
| Projects | Read-heavy, occasional writes | Tens-hundreds | Config changes |
| Integrations | Read on webhook receive | Tens | Jira/Linear/GitHub configs |
| Routing rules | Read on dispatch | Tens-hundreds | Tag -> agent mapping |
| Agent definitions | Read on dispatch, write on registry | Hundreds | From daemon manifests |
| Assignments | Write on dispatch, read on dashboard | Thousands/month | Ticket -> agent mapping |
| Audit log | Append-only, read on dashboard | Tens of thousands | Status pings, events |
| Time tracking | Append-only, aggregate on dashboard | Tens of thousands | Derived from status pings |

### What Is Ephemeral

| Data | Access Pattern | Lifetime | Notes |
|---|---|---|---|
| Agent online/offline | Read/write on connect/disconnect | Session | Gone on restart is OK |
| Current load per machine | Write every 5s (status ping) | Seconds | Always stale |
| WebSocket connection map | Write on connect, read on dispatch | Session | In-memory only |
| Active assignment progress | Write every 5s, read on dashboard | Minutes | Can reconstruct |

## Database Options Compared

| Feature | SQLite (better-sqlite3) | PostgreSQL (Drizzle) | Redis | In-Memory + File |
|---|---|---|---|---|
| **External dependency** | None (embedded) | Requires PG server | Requires Redis server | None |
| **Setup complexity** | Zero | Medium | Low-medium | Zero |
| **Self-hosted story** | Excellent (single file) | Adds ops burden | Adds ops burden | Fragile |
| **Concurrent writes** | WAL mode handles well | Excellent | Excellent | Poor |
| **Query capability** | Full SQL | Full SQL | Key-value only | Custom code |
| **Migrations** | Drizzle kit | Drizzle kit | N/A | N/A |
| **Backup** | Copy one file | pg_dump | RDB/AOF | Copy one file |
| **TypeScript ORM** | Drizzle | Drizzle | ioredis | N/A |
| **Max practical data** | ~1 TB | Unlimited | ~RAM size | ~RAM size |
| **Performance** | Excellent (in-process) | Good (network hop) | Excellent | Excellent |

## Recommendation: SQLite via Drizzle ORM (better-sqlite3 driver)

**SQLite is the clear winner for AgentFleet.** The reasoning:

### 1. Zero External Dependencies

The hub is a single self-hosted process. Adding PostgreSQL or Redis turns a simple `docker run` into a multi-container orchestration problem. SQLite is embedded -- no separate server, no network configuration, no connection pooling.

### 2. Drizzle ORM for Type Safety

Drizzle ORM with the `better-sqlite3` driver provides full TypeScript type inference, SQL-like query builder, and a migration system -- all while keeping the database embedded.

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

// Schema definition
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  machineId: text('machine_id').notNull(),
  name: text('name').notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
  maxConcurrent: integer('max_concurrent').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const assignments = sqliteTable('assignments', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull(),
  ticketSource: text('ticket_source').notNull(), // 'jira' | 'linear' | 'github'
  agentId: text('agent_id').notNull().references(() => agents.id),
  machineId: text('machine_id').notNull(),
  status: text('status').notNull(), // 'queued' | 'assigned' | 'working' | 'completed' | 'failed'
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  tokensUsed: integer('tokens_used').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  eventType: text('event_type').notNull(),
  machineId: text('machine_id'),
  agentId: text('agent_id'),
  ticketId: text('ticket_id'),
  data: text('data', { mode: 'json' }),
});

// Database initialization
const sqlite = new Database('./data/agentfleet.db');
sqlite.pragma('journal_mode = WAL');  // Critical for concurrent reads
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite);
```

### 3. WAL Mode for Concurrency

SQLite in WAL (Write-Ahead Logging) mode supports concurrent readers with a single writer. This is perfect for AgentFleet where:
- Multiple dashboard requests read simultaneously
- Webhook handlers and status pings write sequentially
- The single-writer constraint is not a bottleneck (writes are small and fast)

### 4. Performance Is Excellent

`better-sqlite3` is synchronous and in-process -- no network hop, no serialization overhead. For our data volumes (thousands of records, not millions), queries are sub-millisecond.

### 5. Backup Is Trivial

```bash
# Backup: copy one file
cp data/agentfleet.db data/agentfleet.db.backup

# Or use SQLite's online backup API
sqlite3 data/agentfleet.db ".backup data/backup.db"
```

### 6. Docker-Friendly

Mount a volume for the database file:
```dockerfile
VOLUME /app/data
# Database stored at /app/data/agentfleet.db
```

## Ephemeral State: In-Memory

For ephemeral state (online status, current load, WS connections), use plain TypeScript Maps:

```typescript
// In-memory state -- lost on restart, rebuilt from daemon reconnections
class FleetState {
  // machineId -> connection info
  private connections = new Map<string, {
    ws: WebSocket;
    connectedAt: Date;
    lastPing: Date;
  }>();

  // agentId -> current status
  private agentStatus = new Map<string, {
    machineId: string;
    status: 'idle' | 'working' | 'paused';
    currentTicket?: string;
    load: { cpu: number; memory: number };
    lastUpdate: Date;
  }>();

  // machineId -> agent IDs on that machine
  private machineAgents = new Map<string, Set<string>>();

  onDaemonConnect(machineId: string, ws: WebSocket, agents: AgentManifest[]) {
    this.connections.set(machineId, {
      ws,
      connectedAt: new Date(),
      lastPing: new Date(),
    });

    const agentIds = new Set<string>();
    for (const agent of agents) {
      this.agentStatus.set(agent.id, {
        machineId,
        status: 'idle',
        load: { cpu: 0, memory: 0 },
        lastUpdate: new Date(),
      });
      agentIds.add(agent.id);
    }
    this.machineAgents.set(machineId, agentIds);
  }

  onDaemonDisconnect(machineId: string) {
    this.connections.delete(machineId);
    const agentIds = this.machineAgents.get(machineId);
    if (agentIds) {
      for (const id of agentIds) {
        this.agentStatus.delete(id);
      }
    }
    this.machineAgents.delete(machineId);
  }

  getAvailableAgent(tag: string): { agentId: string; machineId: string } | null {
    // Find an idle agent with a matching tag that is currently connected
    // This queries in-memory state, not the database
    // ...
  }
}
```

**Why not Redis for ephemeral state:** Redis adds an external dependency for data that:
- Is small (hundreds of entries at most)
- Is always rebuilt on daemon reconnection
- Does not need to survive hub restarts
- Does not need to be shared across multiple hub instances (single hub per team)

Redis should only be introduced if the hub needs to scale horizontally -- which it does not for AgentFleet's target scale.

## Migration Strategy

### Approach: Drizzle Kit Generate + Migrate

Use `drizzle-kit generate` to create SQL migration files, committed to version control. Apply them on startup:

```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

// Run migrations on startup
migrate(db, { migrationsFolder: './drizzle' });
```

### Migration Workflow

```bash
# 1. Modify schema in src/db/schema.ts
# 2. Generate migration
npx drizzle-kit generate

# 3. Review generated SQL in drizzle/XXXX_migration_name.sql
# 4. Commit migration file to git
# 5. On next hub start, migrations auto-apply
```

### Why Not `drizzle-kit push`

`push` applies changes directly without migration files. Fine for development, but production deployments need:
- Auditable migration history
- Rollback capability (manual, but possible with migration files)
- CI/CD compatibility

### First Migration (Schema)

```sql
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE machines (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machines(id),
  name TEXT NOT NULL,
  tags TEXT NOT NULL, -- JSON array
  max_concurrent INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE routing_rules (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  source TEXT NOT NULL, -- 'jira' | 'linear' | 'github'
  match_labels TEXT, -- JSON array of labels to match
  match_project TEXT, -- project key pattern
  agent_tag TEXT NOT NULL, -- tag to route to
  priority INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  ticket_source TEXT NOT NULL,
  ticket_url TEXT,
  agent_id TEXT REFERENCES agents(id),
  machine_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  started_at INTEGER,
  completed_at INTEGER,
  tokens_used INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  pr_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  machine_id TEXT,
  agent_id TEXT,
  ticket_id TEXT,
  data TEXT -- JSON
);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  platform TEXT NOT NULL, -- 'jira' | 'linear' | 'github'
  config TEXT NOT NULL, -- JSON (encrypted webhook secrets, API tokens, etc.)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_ticket ON assignments(ticket_id, ticket_source);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_ticket ON audit_log(ticket_id);
CREATE INDEX idx_agents_machine ON agents(machine_id);
CREATE INDEX idx_routing_rules_team ON routing_rules(team_id);
```

## When to Upgrade to PostgreSQL

SQLite should be replaced with PostgreSQL if any of these become true:
- Multiple hub instances needed (horizontal scaling)
- Write throughput exceeds SQLite's single-writer limit (~50K writes/sec -- unlikely)
- Advanced query patterns needed (full-text search, JSONB operators, CTEs with recursion)
- Team size exceeds ~200 developers (unlikely for self-hosted)

**Migration path:** Because Drizzle ORM abstracts the database, switching from SQLite to PostgreSQL requires:
1. Change the driver import (`drizzle-orm/better-sqlite3` to `drizzle-orm/node-postgres`)
2. Adjust column types (SQLite `integer` timestamps to PostgreSQL `timestamp`)
3. Re-generate migrations for PostgreSQL
4. Migrate data (export/import)

The schema design above is intentionally PostgreSQL-compatible (using TEXT for IDs, INTEGER for timestamps) to minimize the migration effort.

## Dependencies

```
better-sqlite3          # SQLite driver (synchronous, fast)
drizzle-orm             # TypeScript ORM
drizzle-kit             # Migration CLI (dev dependency)
```

## Sources

- [Drizzle ORM - SQLite](https://orm.drizzle.team/docs/get-started-sqlite)
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)
- [Getting Started with Drizzle ORM - Better Stack](https://betterstack.com/community/guides/scaling-nodejs/drizzle-orm/)
- [Top TypeScript ORM 2025 - Bytebase](https://www.bytebase.com/blog/top-typescript-orm/)
- [Node.js ORMs in 2025 - TheDataGuy](https://thedataguy.pro/blog/2025/12/nodejs-orm-comparison-2025/)
