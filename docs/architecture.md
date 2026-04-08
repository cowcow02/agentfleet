# Architecture

AgentFleet is a distributed system with three components: the **Hub**, the **Daemon**, and **Adapters**. This document describes each component, how they communicate, and how they compose into the overall system.

## System Overview

```
                        Project Management Tools
                     (Jira, Linear, GitHub Issues)
                                |
                                | HTTP webhooks
                                v
  +----------------------------------------------------------+
  |                          HUB                              |
  |                  (one per team/org)                       |
  |                                                          |
  |  +----------------+  +----------+  +-----------------+   |
  |  | Webhook        |  | Agent    |  | Dispatcher       |  |
  |  | Receiver       |  | Registry |  |                  |  |
  |  +-------+--------+  +----+-----+  +--------+--------+  |
  |          |                 |                  |           |
  |  +-------v--------+       |         +--------v--------+  |
  |  | Tracker         |      |         | Routing          |  |
  |  | Adapters        |      |         | Engine           |  |
  |  +----------------+       |         +-----------------+   |
  |                           |                               |
  |  +----------------+  +----+-----+  +-----------------+   |
  |  | Dashboard API  |  | Audit    |  | WebSocket        |  |
  |  | + Web UI       |  | Log      |  | Server           |  |
  |  +----------------+  +----------+  +--------+--------+   |
  +----------------------------------------------------------+
                                                 |
                          WebSocket (outbound from daemons)
                         /           |            \
              +---------+    +-------+---+    +---+-------+
              | DAEMON  |    |  DAEMON   |    |  DAEMON   |
              | (mac-1) |    |  (mac-2)  |    |  (lin-1)  |
              +----+----+    +-----+-----+    +-----+-----+
                   |               |                |
              Agent Agent     Agent Agent       Agent Agent
```

## Component 1: Hub

The hub is the central coordination server. One hub serves an entire team or organization. It is intentionally lightweight: a single container process with approximately 128MB of memory, deployable for roughly $5/month on any container hosting platform.

### Responsibilities

**Webhook Receiver.** Accepts HTTP webhooks from project management tools. When a ticket is created, updated, or transitioned, the tracker fires a webhook to the hub's endpoint. The hub routes the raw payload to the appropriate tracker adapter for normalization.

**Tracker Adapters.** Each supported tracker (Jira, Linear, GitHub Issues) has an adapter that translates the platform-specific webhook payload into a common `NormalizedTicket` format. The adapter also handles outbound operations: transitioning ticket status and posting comments back to the tracker. See [Tracker Adapters](tracker-adapters.md).

**Agent Registry.** Maintains a live registry of all agents across all connected machines. Agents are not defined in the hub; they are reported by daemons when they connect. The registry tracks each agent's name, tags, capacity, current load, and online status. See [Agent Discovery](agent-discovery.md).

**Routing Engine.** Each project defines routing rules that map ticket attributes (labels, priority, type) to required agent tags. When a ticket arrives, the routing engine evaluates the rules to determine which tags are required, then queries the registry for matching agents. See [Routing](routing.md).

**Dispatcher.** Once the routing engine identifies candidate agents, the dispatcher selects the best match (considering capacity, assignee affinity, and load balancing) and sends a dispatch message over the WebSocket connection to the target daemon.

**WebSocket Server.** Maintains persistent WebSocket connections with all connected daemons. This is the primary communication channel for dispatch commands (hub to daemon) and status updates (daemon to hub).

**Dashboard API and Web UI.** Serves a web-based dashboard for fleet visibility. The dashboard shows connected machines, registered agents, ticket pipeline status, and operational metrics. The API also supports the configuration workflow: creating projects, defining routing rules, and managing agent-to-project assignments.

**Audit Log.** Records every significant event: dispatches, status changes, agent connections/disconnections, and errors. Each entry includes a timestamp and relevant context. This provides an authoritative timeline for debugging and accountability.

### Hub Internals

```
Incoming webhook
      |
      v
+------------------+
| Tracker Adapter  |  -- normalize to NormalizedTicket
+--------+---------+
         |
         v
+------------------+
| Routing Engine   |  -- evaluate rules, determine required tags
+--------+---------+
         |
         v
+------------------+
| Registry Query   |  -- find agents with matching tags + capacity
+--------+---------+
         |
         v
+------------------+
| Dispatcher       |  -- select best agent, send via WebSocket
+--------+---------+
         |
         v
+------------------+
| Audit Log        |  -- record dispatch event
+------------------+
```

### What the Hub Does NOT Do

- Does not execute code
- Does not access git repositories
- Does not store source code or credentials
- Does not define agent types or know what specific agents do
- Does not manage developer environments

The hub is a coordination layer. It routes work and records what happened.

## Component 2: Daemon

The daemon runs on each developer's machine. It is the bridge between the hub and the local agents.

### Responsibilities

**Persistent Connection.** Maintains an outbound WebSocket connection to the hub. The connection is outbound-only, meaning developer machines do not need to expose any inbound ports. The daemon handles reconnection with exponential backoff if the connection drops.

**Agent Registration.** On startup, the daemon reads the local agent manifest (`~/.agentfleet/agents.yaml`) and reports all declared agents to the hub. The hub adds these agents to its registry. On shutdown, the daemon deregisters its agents.

**Heartbeat.** Sends periodic heartbeats to the hub so the registry can distinguish between online and offline agents. If heartbeats stop, the hub marks the machine's agents as offline and stops routing work to them.

**Dispatch Handling.** When the hub dispatches a ticket, the daemon receives the dispatch message over WebSocket. It then:

1. Creates a git worktree for the ticket (isolating the work from the developer's current branch)
2. Resolves the invoke command from the agent manifest, substituting ticket variables
3. Spawns the agent process
4. Monitors the process (stdout stream, exit code, resource usage)
5. Reports status updates to the hub as they occur

**Status Relay.** The daemon exposes a local HTTP endpoint (`localhost`) that agent processes or team harnesses can POST status messages to. The daemon relays these messages to the hub. See [Status Reporting](status-reporting.md).

**Lifecycle Management.** Handles graceful shutdown (waits for running agents to reach a safe point), pause/resume (stops accepting new dispatches while letting current work finish), and crash recovery (reports incomplete work on restart).

### Daemon as a System Service

The daemon is designed to run as a system login item:

- **macOS:** Installed as a launchd agent (`~/Library/LaunchAgents/`)
- **Linux:** Installed as a systemd user service (`~/.config/systemd/user/`)

This ensures the daemon starts automatically when the developer logs in and stays running in the background.

### Daemon Internals

```
Hub (WebSocket)                    Local Agent Process
      |                                    ^
      v                                    |
+------------------+              +------------------+
| WebSocket Client |              | Process Manager  |
| (persistent      |              | - spawn          |
|  outbound conn)  |              | - monitor stdout |
+--------+---------+              | - track exit     |
         |                        +--------+---------+
         v                                 ^
+------------------+                       |
| Dispatch Handler |----> git worktree --->|
+--------+---------+      resolve cmd      |
         |                                 |
         v                                 |
+------------------+              +--------+---------+
| Status Reporter  |<------------|  Local HTTP       |
| (relay to hub)   |             |  Endpoint         |
+------------------+             | (agent POSTs to)  |
                                 +-------------------+
```

## Component 3: Adapters

Adapters are the pluggable extension points on both the hub side and the daemon side.

### Tracker Adapters (Hub-Side)

Tracker adapters run inside the hub and handle communication with project management tools. Each adapter knows how to:

- Parse incoming webhook payloads from a specific platform
- Normalize them to the common `NormalizedTicket` format
- Transition ticket status in the external platform
- Post comments on tickets

Supported tracker adapters:
- **Jira** -- Handles Jira's customizable workflows and status mapping
- **Linear** -- Handles Linear's webhook format and status model
- **GitHub Issues** -- Handles GitHub webhook events for issues

New tracker adapters can be added without changing the hub core. Each adapter implements a standard interface. See [Tracker Adapters](tracker-adapters.md) for the interface specification.

### Agent Adapters (Daemon-Side)

Agent adapters run inside the daemon and handle invocation and monitoring of specific agent types. Each adapter knows how to:

- Construct the invocation command for a specific agent
- Parse the agent's output format for structured status information
- Detect completion, failure, and intermediate states

Built-in agent adapters:
- **Claude Code** -- Uses `--output-format stream-json --verbose` for real-time typed events
- **Codex** -- Monitors via process-level signals and exit codes
- **Generic** -- Fallback for any command-line agent; uses process monitoring (CPU, memory, exit code)

Custom agent adapters can be added for team-specific agents or harnesses. See [Status Reporting](status-reporting.md) for how monitoring works per adapter type.

## Communication Model

### Hub-to-Daemon: WebSocket

All communication between the hub and daemons uses WebSocket over TLS (`wss://`).

Key properties:
- **Outbound-only from daemons.** Developer machines initiate the connection. No inbound ports need to be opened on developer networks.
- **Persistent.** The connection stays open for the session lifetime, enabling low-latency dispatch and real-time status updates.
- **Bidirectional.** The hub sends dispatch commands; daemons send registration, heartbeat, and status messages.
- **Reconnection.** If the connection drops, the daemon reconnects with exponential backoff. In-progress work continues; status updates queue locally and flush on reconnect.

### Tracker-to-Hub: HTTP Webhooks

Project management tools send HTTP webhook payloads to the hub. Each tracker integration is configured with a webhook URL pointing to the hub.

For platforms that do not support webhooks reliably, tracker adapters also support polling as a fallback mechanism.

### Hub-to-Tracker: HTTP API

The hub makes outbound HTTP API calls to trackers to update ticket status and post comments. Each tracker adapter encapsulates the platform-specific API client.

### Agent-to-Daemon: Local HTTP

Agents (or team harnesses wrapping agents) can optionally POST status messages to the daemon's local HTTP endpoint on `localhost`. This is a one-way push from the agent process to the daemon.

```
Tracker <-- HTTP API --> Hub <-- WebSocket --> Daemon <-- local HTTP --> Agent
                ^                                              |
                |                                              v
            Webhook                                      git worktree
            (inbound)                                    spawn process
                                                         monitor stdout
```

## Deployment Model

### Hub Deployment

The hub is a single container. It can be deployed on:
- Docker (local or VM)
- Container platforms (Railway, Fly.io, Render, Cloud Run)
- Kubernetes (single pod)

Resource requirements:
- Memory: approximately 128MB
- CPU: minimal (event-driven, not compute-intensive)
- Storage: audit log and registry state (SQLite or Postgres)
- Network: inbound HTTP (webhooks, dashboard), inbound WebSocket (daemon connections)

### Daemon Deployment

The daemon is installed on each developer's machine via npm:

```bash
npx @agentfleet/daemon init --hub <url> --token <token>
```

The init command:
1. Creates the config directory (`~/.agentfleet/`)
2. Generates a machine-specific API key
3. Registers the machine with the hub
4. Installs the daemon as a login item (launchd on macOS, systemd on Linux)
5. Creates a template agent manifest for the developer to customize

## Scaling Characteristics

| Dimension | Scaling Behavior |
|-----------|-----------------|
| Teams | One hub per team. Teams are independent. |
| Machines | Each machine connects to the hub. The hub maintains one WebSocket per machine. Practical limit is in the hundreds per hub. |
| Agents per machine | Defined locally. Capacity is self-reported. The hub does not enforce or validate capacity against actual hardware. |
| Trackers per project | One primary tracker integration per project. Multiple projects can use different trackers within the same organization. |
| Concurrent dispatches | Bounded by total fleet capacity across all machines. The hub queues overflow. |

The hub is not in the critical path of agent execution. If the hub goes down, agents already running continue to work (they just cannot report status until the hub comes back). New dispatches queue in the tracker until the hub recovers.
