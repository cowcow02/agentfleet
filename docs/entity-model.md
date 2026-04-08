# Entity Model

This document describes the data model that underpins AgentFleet: the entities, their relationships, and how they compose into the system's operational structure.

## Overview

AgentFleet's entity model has five primary entities:

```
Organization
|
+-- Projects          (connected to trackers, define routing rules)
+-- Teammates         (physical machines that connect via daemons)
+-- Agents            (discovered from machines, first-class in registry)
+-- Assignments       (M:M links between projects and agents)
+-- Dispatches        (work items: a ticket assigned to an agent)
```

The key structural insight is that **Projects and Teammates are parallel first-class entities**. Neither owns the other. They are connected indirectly through Agents and Assignments.

## Entity Definitions

### Organization

The top-level container. One organization corresponds to one team or company deploying AgentFleet.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Organization display name |
| `created_at` | timestamp | When the organization was created |

An organization owns all other entities. In a single-hub deployment, there is one organization. Multi-tenancy (multiple organizations per hub) is a future consideration but not part of the initial design.

### Project

A project represents a body of work tracked in an external project management tool. Each project has one tracker integration and a set of routing rules.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `org_id` | string | Parent organization |
| `name` | string | Project display name (e.g., "Backend API", "Mobile App") |
| `tracker_type` | enum | `jira`, `linear`, `github` |
| `tracker_config` | object | Connection details (instance URL, API token, project key, webhook secret) |
| `status_map` | object | Mapping from platform-specific statuses to normalized statuses |
| `routing_rules` | array | Ordered list of routing rules (see [Routing](routing.md)) |
| `created_at` | timestamp | When the project was created |

A project does NOT own machines or agents. It is connected to agents through Assignments.

### Teammate

A teammate represents a physical machine that runs a daemon and connects to the hub. The term "teammate" is used instead of "machine" or "node" to reflect that each machine belongs to a person on the team.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `org_id` | string | Parent organization |
| `name` | string | Human-readable name (e.g., "charlie-macbook", "alice-desktop") |
| `machine_key` | string | Machine-specific API key (generated during enrollment) |
| `os` | string | Operating system (e.g., "darwin", "linux") |
| `status` | enum | `online`, `offline`, `paused` |
| `last_heartbeat` | timestamp | Last heartbeat received from daemon |
| `connected_at` | timestamp | When the current session started |
| `created_at` | timestamp | When the teammate was first enrolled |

The teammate entity is created when a developer runs the daemon init command and registers with the hub.

### Agent

An agent is a declared capability on a teammate's machine. Agents are the unit of work assignment. They are defined locally in the developer's agent manifest and discovered by the hub when the daemon connects.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (typically `{teammate_name}/{agent_name}`) |
| `org_id` | string | Parent organization |
| `teammate_id` | string | The machine that hosts this agent |
| `name` | string | Agent name as declared in the manifest (e.g., "backend-agent") |
| `qualified_name` | string | Fully qualified: `{teammate}/{name}` (e.g., "charlie/backend-agent") |
| `description` | string | What this agent does (from manifest) |
| `agent_type` | string | The underlying agent tool (e.g., "claude-code", "codex", "aider") |
| `tags` | string[] | Capabilities (e.g., ["backend", "api", "database"]) |
| `capacity` | integer | Maximum concurrent tasks this agent can handle |
| `active_tasks` | integer | Currently running tasks |
| `status` | enum | `idle`, `busy`, `full`, `offline`, `paused` |
| `registered_at` | timestamp | When the hub first discovered this agent |
| `last_updated` | timestamp | Last status change |

Agents are first-class entities in the hub's registry. Even though they are hosted on a specific teammate's machine, they are directly addressable and assignable at the organization level.

The `qualified_name` uniquely identifies an agent across the fleet. Two different machines can have agents named "backend-agent", but their qualified names will differ: "charlie/backend-agent" vs "alice/backend-agent".

### Assignment

An assignment links a project to an agent. This is a many-to-many relationship: a project can have agents from multiple machines, and a single agent can serve multiple projects.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `org_id` | string | Parent organization |
| `project_id` | string | The project |
| `agent_id` | string | The agent |
| `priority` | integer | Dispatch priority for this agent within this project (lower = higher priority) |
| `created_at` | timestamp | When the assignment was created |
| `created_by` | string | Who created this assignment (typically a team lead) |

Assignments are created by team leads via the dashboard. They are the mechanism by which discovered agents are made available for work on specific projects.

### Dispatch

A dispatch is a work item: a specific ticket assigned to a specific agent. Dispatches are the transactional records of work flowing through the system.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `org_id` | string | Parent organization |
| `project_id` | string | The project this ticket belongs to |
| `agent_id` | string | The agent handling this ticket |
| `ticket` | NormalizedTicket | The normalized ticket data (see [Tracker Adapters](tracker-adapters.md)) |
| `status` | enum | `queued`, `dispatched`, `running`, `completed`, `failed`, `cancelled` |
| `status_messages` | array | Ordered list of status pings from the agent |
| `dispatched_at` | timestamp | When the dispatch was sent to the daemon |
| `started_at` | timestamp | When the agent process actually started |
| `completed_at` | timestamp | When the agent process finished |
| `exit_code` | integer | Agent process exit code (null if still running) |
| `result` | object | Outcome data (PR URL, branch name, error message) |

## Relationships

### Entity Relationship Diagram

```
+----------------+          +----------------+
|  Organization  |          |    Project     |
|                |---1:N--->|                |
|                |          | tracker_type   |
|                |          | tracker_config |
|                |          | routing_rules  |
+-------+--------+          +-------+--------+
        |                           |
        |                           | M:N (via Assignment)
        |                           |
        +---1:N--+          +-------+--------+
                 |          |   Assignment   |
                 v          | project_id     |
        +--------+-------+  | agent_id       |
        |   Teammate     |  +-------+--------+
        |                |          |
        | name           |          |
        | status         |  +-------v--------+
        | last_heartbeat |  |     Agent      |
        +-------+--------+  |                |
                |            | qualified_name |
                +---1:N----->| tags           |
                             | capacity       |
                             | agent_type     |
                             +-------+--------+
                                     |
                                     | 1:N
                                     v
                             +----------------+
                             |   Dispatch     |
                             |                |
                             | ticket         |
                             | status         |
                             | result         |
                             +----------------+
```

### Key Relationship Rules

**Organization to Project (1:N).** An organization has many projects. Each project belongs to exactly one organization.

**Organization to Teammate (1:N).** An organization has many teammates. Each teammate belongs to exactly one organization.

**Teammate to Agent (1:N).** A teammate hosts many agents. Each agent belongs to exactly one teammate. If a teammate goes offline, all of its agents become unavailable.

**Project to Agent (M:N via Assignment).** This is the core operational relationship. Projects and agents are connected through assignments. The team lead creates these assignments via the dashboard after agents have been discovered.

This M:N relationship means:
- A project can draw from agents across multiple machines (resilience, capacity)
- An agent can serve multiple projects (utilization, flexibility)
- The same machine can have some agents assigned to Project A and others to Project B

**Agent to Dispatch (1:N).** An agent can have multiple dispatches over time. Each dispatch is for one specific ticket on one specific agent.

## Example: A Real Fleet

Consider a team with two developers (Charlie and Alice) working on two projects:

```
Organization: Acme Engineering
|
+-- Projects
|   +-- Project Alpha (Jira: ALPHA board)
|   |   Routing: backend labels -> require tag "backend"
|   |   Routing: frontend labels -> require tag "frontend"
|   |
|   +-- Project Beta (Linear: BETA team)
|       Routing: bug + low priority -> require tag "simple"
|       Routing: default -> require tag "backend"
|
+-- Teammates
|   +-- charlie-macbook (online)
|   +-- alice-desktop (online)
|
+-- Agents
|   +-- charlie/backend-agent
|   |   type: claude-code, tags: [backend, api], capacity: 2
|   |
|   +-- charlie/frontend-agent
|   |   type: claude-code, tags: [frontend], capacity: 1
|   |
|   +-- charlie/quick-fixer
|   |   type: codex, tags: [bug, simple], capacity: 4
|   |
|   +-- alice/fullstack-agent
|   |   type: claude-code, tags: [backend, frontend], capacity: 3
|   |
|   +-- alice/infra-agent
|       type: claude-code, tags: [infra, devops], capacity: 1
|
+-- Assignments
    +-- Project Alpha <-> charlie/backend-agent
    +-- Project Alpha <-> charlie/frontend-agent
    +-- Project Alpha <-> alice/fullstack-agent
    +-- Project Beta  <-> charlie/quick-fixer
    +-- Project Beta  <-> alice/fullstack-agent
```

In this configuration:

- When a backend ticket comes in on Project Alpha, the hub can dispatch to either `charlie/backend-agent` or `alice/fullstack-agent` (both have the "backend" tag and are assigned to Alpha).
- When a simple bug comes in on Project Beta, the hub dispatches to `charlie/quick-fixer` (has the "simple" tag and is assigned to Beta).
- `alice/infra-agent` is not assigned to any project yet. It exists in the registry but will not receive dispatches until a team lead assigns it.

## Agent Status Lifecycle

```
                   daemon connects
                         |
                         v
    +--------+     +-----------+
    |offline |---->|   idle    |<---------------------------+
    +--------+     +-----+-----+                            |
         ^               |                                  |
         |          dispatch received                  task completes
    daemon              |                             (or fails)
    disconnects         v                                  |
         |        +-----------+     +----------+     +-----+-----+
         +--------|   busy    |---->|   full   |---->|   busy    |
                  +-----------+     +----------+     +-----------+
                   (active <         (active ==
                    capacity)         capacity)
```

- **offline** -- Daemon is disconnected. Agent will not receive dispatches.
- **idle** -- Agent is connected and has no active tasks.
- **busy** -- Agent has at least one active task but has remaining capacity.
- **full** -- Agent has reached its declared capacity. No new dispatches until a task completes.
- **paused** -- Developer has explicitly paused the daemon. Agent is connected but will not accept dispatches.

## Dispatch Status Lifecycle

```
    ticket arrives
         |
         v
    +--------+     +------------+     +---------+     +-----------+
    |queued  |---->| dispatched |---->| running |---->| completed |
    +--------+     +------------+     +---------+     +-----------+
         |               |                |
         |               |                +----------> +---------+
         |               +--------------------------> | failed  |
         |                                             +---------+
         +-------------------------------------------> +-----------+
                                                       | cancelled |
                                                       +-----------+
```

- **queued** -- Ticket matched routing rules but no agent with capacity is available. Waiting in the dispatch queue.
- **dispatched** -- Dispatch message sent to the daemon via WebSocket. Waiting for the daemon to acknowledge and start the agent.
- **running** -- Agent process has been spawned and is actively working.
- **completed** -- Agent process exited successfully (exit code 0).
- **failed** -- Agent process exited with an error (non-zero exit code) or the daemon reported a failure.
- **cancelled** -- Dispatch was cancelled (by a user, or because the ticket was moved to a terminal status in the tracker).

## Capacity Model

Agent capacity is a simple integer declared in the agent manifest. It represents the maximum number of concurrent tasks the agent should handle.

```yaml
agents:
  - name: backend-agent
    capacity: 2          # can handle 2 tickets simultaneously
```

The hub tracks `active_tasks` against `capacity`:
- `active_tasks < capacity` -- agent can accept new dispatches
- `active_tasks == capacity` -- agent is full, skip during dispatch

Capacity is self-reported and advisory. The hub does not validate it against actual hardware resources. A developer who sets `capacity: 10` on a laptop with limited resources will experience degraded agent performance, but the hub will respect the declared capacity.

When `active_tasks` decreases (a task completes or fails), the hub checks the dispatch queue for any waiting tickets that match this agent. If a match exists, the hub dispatches immediately.
