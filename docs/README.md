# AgentFleet

A self-hosted agent discovery and dispatch platform that connects project management tools to AI coding agents running on developer machines.

Think "BuildKite, but for AI coding agents instead of CI pipelines."

## The Problem

Teams using AI coding agents (Claude Code, Codex, Cursor, Aider, and others) face a coordination gap. Each developer runs their agent locally, but there is no centralized orchestration. When a ticket is assigned in Jira, Linear, or GitHub Issues, no automated workflow starts. A human must manually copy ticket details, start the agent, and manage the lifecycle. This makes it impossible to run an "agent-first" development workflow where agents produce the first-pass implementation and humans review.

Cloud-hosted solutions exist (Devin, Cursor cloud agents), but they move work off developer machines. AgentFleet takes the opposite approach: keep agents on developer machines, leveraging local environments, credentials, toolchains, and company hardware, while adding the missing orchestration layer.

## What AgentFleet Does

AgentFleet treats each developer's laptop as a node in a distributed system. Each machine hosts one or more AI agents. A central lightweight hub discovers these agents, maintains a live registry, and dispatches tickets to the right agent when work triggers in the project management tool.

```
  Jira / Linear / GitHub Issues
              |
              v  (webhook)
        +-----------+
        |    Hub    |   <-- one per team, lightweight container
        +-----------+
         /    |     \
        v     v      v  (WebSocket)
    +------+ +------+ +------+
    |Daemon| |Daemon| |Daemon|  <-- one per developer machine
    +------+ +------+ +------+
     Agent    Agent    Agent
     Agent    Agent    Agent
```

**When a ticket moves to "Ready for Dev" in Jira:**

1. Jira fires a webhook to the hub
2. The hub normalizes the ticket and applies routing rules
3. The hub finds a matching agent with available capacity
4. The hub dispatches the ticket to the agent's machine via WebSocket
5. The daemon creates a git worktree, spawns the agent, and monitors it
6. The agent works, pushes a branch, creates a PR
7. The hub updates Jira with the PR link and moves the ticket to "In Review"

No human intervention between steps 1 and 7.

## Key Design Principles

**Discovery, not definition.** The hub does not define agents. Agents are defined at the edge (each developer's machine) and discovered by the hub. Adding a new agent type is a local config change, not a hub-side deployment.

**Agent-neutral.** The hub does not know what Claude Code or Codex are. It dispatches work and receives status updates. Any agent that can be invoked from a command line can be integrated.

**Local-first.** All code execution happens on developer machines using their local git, credentials, environment variables, and toolchains. The hub never touches code.

**Lightweight.** The hub runs in a single container with approximately 128MB of memory. A team can self-host it for roughly $5/month.

## Architecture at a Glance

AgentFleet has three components:

| Component | Where It Runs | What It Does |
|-----------|--------------|--------------|
| **Hub** | One server per team | Receives tracker webhooks, maintains agent registry, dispatches work, serves dashboard |
| **Daemon** | One per developer machine | Connects to hub, registers local agents, spawns agents on dispatch, reports status |
| **Adapters** | Both sides | Tracker adapters (hub-side) normalize tickets; agent adapters (daemon-side) invoke specific agent types |

See [Architecture](architecture.md) for the full breakdown.

## Core Concepts

- **[Entity Model](entity-model.md)** -- Organizations, projects, teammates, agents, and assignments
- **[Agent Discovery](agent-discovery.md)** -- How agents are defined locally and discovered by the hub
- **[Routing](routing.md)** -- How tickets are matched to agents via tags and rules
- **[Tracker Adapters](tracker-adapters.md)** -- How Jira, Linear, and GitHub Issues are normalized
- **[Status Reporting](status-reporting.md)** -- How the hub tracks agent progress without understanding agent internals
- **[Security](security.md)** -- Transport security, authentication, event signing

## Personas

AgentFleet serves three personas:

- **Team Lead** -- Deploys the hub, configures tracker integrations, defines routing rules, assigns agents to projects
- **Developer** -- Installs the daemon, defines their agent manifest, receives tickets automatically, reviews PRs
- **Engineering Manager** -- Monitors the fleet dashboard, tracks metrics, receives alerts

See [Personas and Flows](personas-and-flows.md) for detailed workflows.

## Quick Start Concept

### For the Team Lead

```bash
# Deploy the hub (Docker, Railway, Fly.io, or any container host)
docker run -d -p 3000:3000 agentfleet/hub

# Configure via the web dashboard at http://localhost:3000
# 1. Create an organization
# 2. Connect your tracker (Jira, Linear, or GitHub Issues)
# 3. Define routing rules
# 4. Generate an enrollment token for your team
```

### For the Developer

```bash
# Initialize the daemon
npx @agentfleet/daemon init --hub https://hub.yourteam.dev --token af_xxxxxxxxxxxx

# Edit your agent manifest
vim ~/.agentfleet/agents.yaml

# Start the daemon (it will also install as a login item)
npx @agentfleet/daemon start
```

### Agent Manifest Example

```yaml
hub: https://hub.yourteam.dev
token: af_xxxxxxxxxxxx

agents:
  - name: backend-agent
    description: "Handles backend features, API work, database changes"
    tags: [backend, api, database]
    capacity: 2
    agent_type: claude-code
    invoke:
      command: >
        claude -p "/implement {ticket_id}"
        --output-format stream-json --verbose
        --permission-mode auto
      workdir: ~/Code/my-project
```

See [Agent Discovery](agent-discovery.md) for the full manifest reference.

## What AgentFleet Is NOT

- **Not a cloud IDE or sandbox.** Agents use the developer's local environment.
- **Not an AI agent itself.** It dispatches work to whatever agent the team uses.
- **Not a replacement for team workflows.** It triggers the team's harness or workflow; it does not define it.
- **Not a project management tool.** It connects to existing trackers (Jira, Linear, GitHub Issues).
- **Not a CI/CD system.** It creates PRs; existing CI validates them.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System architecture, three components, communication model |
| [Entity Model](entity-model.md) | Data model, entities, relationships |
| [Agent Discovery](agent-discovery.md) | Discovery model, agent manifest, registration flow |
| [Routing](routing.md) | Routing rules, tag matching, dispatch logic |
| [Tracker Adapters](tracker-adapters.md) | Adapter interface, NormalizedTicket format, platform specifics |
| [Status Reporting](status-reporting.md) | Opaque push model, time tracking, process monitoring |
| [Personas and Flows](personas-and-flows.md) | Three personas, end-to-end flow |
| [Security](security.md) | Security model, auth, transport, event signing |
| [Dashboard](dashboard.md) | Dashboard views, fleet status, metrics, alerts |
