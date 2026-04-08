# Dashboard

The AgentFleet dashboard is a web-based interface served by the hub. It provides fleet visibility, project management, and operational metrics for all three personas (team lead, developer, engineering manager). This document describes the dashboard views, the data they display, and the configuration actions they support.

## Accessing the Dashboard

The dashboard is served at the hub's URL (e.g., `https://hub.acme.dev`). Access requires authentication:

- **Admin/Lead** -- Full access to all views and configuration actions
- **Viewer** -- Read-only access to status, pipeline, and metrics views

## Views

### Fleet Overview

The primary view. Shows the health of the entire agent fleet at a glance.

```
Fleet Status                                    Last updated: 12s ago
============

Machines:  4 online / 5 total
Agents:    12 online / 15 total
Active:    7 tasks running
Queued:    2 tickets waiting

+-------------------+---------+--------+--------+
| Machine           | Status  | Agents | Active |
+-------------------+---------+--------+--------+
| charlie-macbook   | ONLINE  |   3    |   2    |
| alice-desktop     | ONLINE  |   2    |   2    |
| bob-workstation   | ONLINE  |   3    |   1    |
| diana-laptop      | ONLINE  |   2    |   2    |
| evan-macbook      | OFFLINE |   --   |   --   |
+-------------------+---------+--------+--------+

         Last seen: evan-macbook 2h 14m ago
```

Clicking on a machine expands to show its individual agents:

```
charlie-macbook
  backend-agent     claude-code  [backend, api, database]  2/2  FULL
  frontend-agent    claude-code  [frontend, ui, react]     0/1  IDLE
  quick-fixer       codex        [bug, simple, chore]      1/4  BUSY
```

### Agent Registry

A table of all discovered agents across the fleet. Sortable and filterable by tags, agent type, status, and machine.

```
Agent Registry
==============

+---------------------------+-------------+---------------------------+-----+--------+
| Agent                     | Type        | Tags                      | Cap | Status |
+---------------------------+-------------+---------------------------+-----+--------+
| charlie/backend-agent     | claude-code | backend, api, database    | 2/2 | FULL   |
| charlie/frontend-agent    | claude-code | frontend, ui, react       | 0/1 | IDLE   |
| charlie/quick-fixer       | codex       | bug, simple, chore        | 1/4 | BUSY   |
| alice/fullstack-agent     | claude-code | backend, frontend         | 2/3 | BUSY   |
| alice/infra-agent         | claude-code | infra, devops             | 0/1 | IDLE   |
| bob/backend-agent         | claude-code | backend, api              | 1/2 | BUSY   |
| bob/ml-agent              | claude-code | ml, python, data          | 0/1 | IDLE   |
| bob/docs-agent            | aider       | docs, documentation       | 0/2 | IDLE   |
| diana/backend-agent       | claude-code | backend, api, database    | 1/2 | BUSY   |
| diana/frontend-agent      | claude-code | frontend, ui              | 1/1 | FULL   |
+---------------------------+-------------+---------------------------+-----+--------+

Filters: [All types v] [All tags v] [All statuses v] [All machines v]
```

### Ticket Pipeline

Shows the flow of tickets through the system for a selected project. Provides a visual representation of work in each stage.

```
Pipeline: Backend API
======================

QUEUED (2)         DISPATCHED (1)     RUNNING (4)          IN REVIEW (3)      DONE TODAY (8)
+------------+     +------------+     +------------+       +------------+     +------------+
| KIP-145    |     | KIP-143    |     | KIP-134    |       | KIP-130    |     | KIP-118    |
| [urgent]   |     | dispatched |     | 18m running|       | PR #251    |     | PR #245    |
| waiting 3m |     | to bob/    |     | charlie/   |       | 45m wait   |     | merged     |
|            |     | backend    |     | backend    |       |            |     |            |
+------------+     +------------+     +------------+       +------------+     +------------+
| KIP-147    |                        | KIP-138    |       | KIP-131    |     | KIP-119    |
| [medium]   |                        | 12m running|       | PR #252    |     | PR #246    |
| waiting 1m |                        | alice/     |       | 20m wait   |     | merged     |
+------------+                        | fullstack  |       +------------+     +------------+
                                      +------------+       | KIP-133    |     | KIP-120    |
                                      | KIP-140    |       | PR #253    |     | PR #247    |
                                      |  6m running|       | 10m wait   |     | merged     |
                                      | diana/     |       +------------+     +------------+
                                      | backend    |                          | KIP-121    |
                                      +------------+                          | PR #248    |
                                      | KIP-142    |                          | merged     |
                                      |  2m running|                          +------------+
                                      | charlie/   |                          | ...+4 more |
                                      | quick-fixer|                          +------------+
                                      +------------+
```

Each ticket card shows:
- Ticket ID (clickable link to the tracker)
- Priority indicator
- Current stage duration
- Assigned agent (for dispatched/running)
- PR link (for in-review/done)

### Active Tasks

A detailed view of all currently running tasks across the fleet.

```
Active Tasks (7)
================

+----------+---------------------------+-----------+----------+------------------------------+
| Ticket   | Agent                     | Runtime   | Status   | Last Ping                    |
+----------+---------------------------+-----------+----------+------------------------------+
| KIP-134  | charlie/backend-agent     | 18m 30s   | running  | tool: Bash (npm test)        |
| KIP-135  | charlie/backend-agent     |  5m 12s   | running  | tool: Edit (src/auth.ts)     |
| KIP-138  | alice/fullstack-agent     | 12m 45s   | running  | tool: Read (tests/...)       |
| KIP-139  | alice/fullstack-agent     |  8m 20s   | running  | "implementing search"        |
| KIP-140  | diana/backend-agent       |  6m 10s   | running  | tool: Edit (src/models/...)  |
| KIP-142  | charlie/quick-fixer       |  2m 05s   | running  | "fixing typo in readme"      |
| KIP-143  | bob/backend-agent         |  0m 30s   | starting | --                           |
+----------+---------------------------+-----------+----------+------------------------------+
```

Clicking a task opens a detail panel with the full status timeline:

```
Task Detail: KIP-134 -> charlie/backend-agent
==============================================

Ticket: KIP-134 "Implement rate limiting for API endpoints"
Priority: high
Labels: backend, api, security

Timeline:
  09:00:00  dispatched
  09:00:15  task_started
  09:01:30  tool: Read (src/middleware/rateLimit.ts)         +1m 15s
  09:01:45  tool: Read (src/config/limits.ts)               +0m 15s
  09:03:00  tool: Read (tests/rateLimit.test.ts)            +1m 15s
  09:05:30  tool: Edit (src/middleware/rateLimit.ts)         +2m 30s
  09:08:00  tool: Edit (src/config/limits.ts)               +2m 30s
  09:12:00  tool: Edit (tests/rateLimit.test.ts)            +4m 00s
  09:15:00  tool: Bash (npm test)                           +3m 00s
  09:18:30  tool: Bash (npm test) -- running now            +3m 30s

  Elapsed: 18m 30s
  Agent type: claude-code
```

### Dispatch Queue

Shows tickets waiting for available agents.

```
Dispatch Queue (2)
==================

+----------+-----------+--------+------------------+----------+--------------------------------+
| Ticket   | Project   | Prio   | Required Tags    | Waiting  | Would Match (if available)     |
+----------+-----------+--------+------------------+----------+--------------------------------+
| KIP-145  | Backend   | urgent | [backend]        |    3m    | charlie/backend (full)         |
|          |           |        |                  |          | alice/fullstack (full)         |
|          |           |        |                  |          | diana/backend (full)           |
+----------+-----------+--------+------------------+----------+--------------------------------+
| KIP-147  | Backend   | medium | [backend]        |    1m    | (same agents, all full)        |
+----------+-----------+--------+------------------+----------+--------------------------------+

Estimated wait: ~5m (based on average task duration for matching agents)
```

### Projects

Management view for projects, their tracker integrations, and routing rules. Accessible to Admin and Lead roles.

```
Projects
========

Backend API
  Tracker: Jira (acme.atlassian.net / ACME)
  Webhook: active (last received: 2m ago)
  Routing rules: 5 rules defined
  Assigned agents: 6
  Active dispatches: 4

Frontend App
  Tracker: Linear (FRONT team)
  Webhook: active (last received: 15m ago)
  Routing rules: 3 rules defined
  Assigned agents: 3
  Active dispatches: 2
```

Clicking a project opens configuration:

```
Backend API -- Configuration
============================

Tracker Integration
  Type: Jira
  Instance: https://acme.atlassian.net
  Project: ACME
  Webhook URL: https://hub.acme.dev/webhooks/jira/prj_abc123
  Last webhook: 2m ago
  Status: healthy

Status Map
  backlog:     Backlog, Icebox
  todo:        To Do, Selected for Sprint, Ready for Dev
  in_progress: In Progress, In Development
  in_review:   In Review, Code Review
  done:        Done, Closed, Released
  cancelled:   Cancelled, Won't Do

Routing Rules
  1. labels:[security] + priority:[urgent,high]  ->  [backend, security]
  2. labels:[backend, api]                        ->  [backend]
  3. labels:[frontend, ui]                        ->  [frontend]
  4. labels:[bug] + priority:[low, medium]        ->  [simple]
  5. default                                      ->  [backend]

Agent Assignments
  charlie/backend-agent     [backend, api, database]    priority: 1
  alice/fullstack-agent     [backend, frontend]         priority: 2
  diana/backend-agent       [backend, api, database]    priority: 3
  bob/backend-agent         [backend, api]              priority: 4
  charlie/frontend-agent    [frontend, ui, react]       priority: 1
  diana/frontend-agent      [frontend, ui]              priority: 2
```

### Metrics

Operational metrics across the fleet. Time-range selectable (24h, 7d, 30d).

#### Throughput

```
Throughput (last 7 days)
========================

Tickets completed:  87
  Backend API:      52
  Frontend App:     35

Average time-to-PR: 22m
  Backend API:      28m
  Frontend App:     14m

Average review time: 1h 12m
Average total lifecycle: 2h 45m

Daily throughput:
  Mon: ████████████  12
  Tue: ██████████████  14
  Wed: ████████████████  16
  Thu: ██████████  10
  Fri: ██████████████████  18
  Sat: ████  4
  Sun: ██████  6
```

#### Agent Performance

```
Agent Performance (last 7 days)
===============================

+---------------------------+--------+----------+---------+----------+-------+
| Agent                     | Tasks  | Avg Time | Success | Avg Cost | Util% |
+---------------------------+--------+----------+---------+----------+-------+
| charlie/backend-agent     |   18   |  24m     |  94%    |  $0.18   |  72%  |
| charlie/quick-fixer       |   42   |   8m     |  88%    |  $0.04   |  56%  |
| alice/fullstack-agent     |   15   |  32m     |  93%    |  $0.22   |  80%  |
| diana/backend-agent       |   12   |  26m     |  92%    |  $0.19   |  52%  |
| bob/backend-agent         |    8   |  30m     |  87%    |  $0.21   |  40%  |
| charlie/frontend-agent    |    6   |  18m     | 100%    |  $0.12   |  18%  |
| diana/frontend-agent      |    5   |  15m     | 100%    |  $0.10   |  12%  |
+---------------------------+--------+----------+---------+----------+-------+

Total cost: $16.42
```

#### Capacity Analysis

```
Capacity Analysis (last 7 days)
===============================

Tag Coverage:
  [backend]   6 agents, 12 total capacity    avg queue wait: 4m
  [frontend]  3 agents,  5 total capacity    avg queue wait: 1m
  [simple]    1 agent,   4 total capacity    avg queue wait: 8m
  [infra]     1 agent,   1 total capacity    avg queue wait: 22m
  [security]  0 agents,  0 total capacity    NO COVERAGE (2 tickets unroutable)

Bottlenecks:
  - [simple] tag: 1 agent handling all simple bugs. Consider adding more agents.
  - [infra] tag: single agent with capacity 1. Queue times are high.
  - [security] tag: no assigned agents. 2 tickets were unroutable this week.

Peak hours:
  Highest queue depth: 6 tickets (Tuesday 10:00-11:00)
  Recommendation: Consider increasing capacity for backend agents during morning hours.
```

### Audit Log

Searchable log of all system events. Filterable by event type, machine, agent, project, and time range.

```
Audit Log
=========

Filters: [All events v] [All machines v] [All projects v] [Last 24h v]

2026-04-08 09:25:30  dispatch.completed    KIP-123  charlie/backend-agent  exit:0  25m30s
2026-04-08 09:25:10  status_ping           KIP-123  "PR #247 created"
2026-04-08 09:05:30  status_ping           KIP-123  "writing tests"
2026-04-08 09:01:15  status_ping           KIP-123  "reading codebase"
2026-04-08 09:00:15  dispatch.started      KIP-123  charlie/backend-agent
2026-04-08 09:00:00  dispatch.sent         KIP-123  charlie/backend-agent
2026-04-08 09:00:00  webhook.received      Jira     Backend API  sig:valid
2026-04-08 08:55:00  machine.connected     charlie-macbook  IP:10.0.1.42
2026-04-08 08:54:58  agent.registered      charlie/backend-agent  [backend,api,database]
2026-04-08 08:54:58  agent.registered      charlie/frontend-agent [frontend,ui,react]
2026-04-08 08:54:58  agent.registered      charlie/quick-fixer    [bug,simple,chore]
```

## Alerts

The dashboard supports configurable alerts. Alerts appear as banners in the dashboard and can optionally be sent to external channels (Slack, email, webhook).

### Built-In Alert Types

| Alert | Trigger | Severity |
|-------|---------|----------|
| Machine offline | Heartbeat timeout for a machine with assigned agents | Warning |
| Queue depth | More than N tickets queued for more than M minutes | Warning |
| Stuck task | A task running longer than its timeout threshold | Warning |
| Task failure | An agent task exited with non-zero exit code | Info |
| Unroutable ticket | A ticket arrived but no routing rule matched | Warning |
| No coverage | A routing rule requires tags that no assigned agent has | Error |
| Webhook failure | Webhook signature verification failed | Error |
| Auth failure | Failed authentication attempt | Error |
| Capacity full | All agents for a tag are at capacity with queued tickets | Warning |

### Alert Configuration

```yaml
alerts:
  slack:
    webhook_url: https://hooks.slack.com/services/xxx/yyy/zzz
    channel: "#agent-fleet-alerts"
    severity_filter: [warning, error]  # only warning and error, not info

  email:
    recipients: ["lead@acme.com", "manager@acme.com"]
    severity_filter: [error]  # only errors

  rules:
    queue_depth:
      threshold: 5                # alert when 5+ tickets queued
      duration: 10m               # for more than 10 minutes
    stuck_task:
      threshold: 50m              # alert when task exceeds 50m (before timeout)
    machine_offline:
      grace_period: 5m            # wait 5m before alerting (handles brief disconnects)
```

## Dashboard API

The dashboard is backed by an HTTP API that can be used for automation and integration with external tools.

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/fleet/status` | GET | Fleet overview (machines, agents, active tasks) |
| `/api/agents` | GET | Agent registry (filterable) |
| `/api/agents/{id}/assignments` | GET/POST/DELETE | Agent-to-project assignments |
| `/api/projects` | GET/POST | Project list and creation |
| `/api/projects/{id}` | GET/PUT | Project details and configuration |
| `/api/projects/{id}/routing` | GET/PUT | Routing rules for a project |
| `/api/dispatches` | GET | Dispatch history (filterable) |
| `/api/dispatches/active` | GET | Currently running tasks |
| `/api/dispatches/queue` | GET | Queued tickets |
| `/api/metrics/throughput` | GET | Throughput metrics (time-range parameter) |
| `/api/metrics/agents` | GET | Per-agent performance metrics |
| `/api/metrics/capacity` | GET | Capacity analysis |
| `/api/audit` | GET | Audit log (filterable, paginated) |
| `/api/alerts/config` | GET/PUT | Alert configuration |

All API endpoints require authentication via API key in the `Authorization` header:

```
Authorization: Bearer api_xxxxxxxxxxxx
```

API keys are generated from the dashboard settings and can be scoped to specific roles (admin, lead, viewer).
