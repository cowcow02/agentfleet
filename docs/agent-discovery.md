# Agent Discovery

AgentFleet uses a discovery model, not a runner model. The hub does not define agents. Agents are defined at the edge -- on each developer's machine -- and discovered by the hub when daemons connect. This document describes the discovery flow, the agent manifest format, and how agents become available for dispatch.

## Discovery vs. Runner Model

Most orchestration systems use a runner model: the central server defines work and pushes it to generic runners. Runners are interchangeable. The server decides what runs where.

AgentFleet inverts this. Each machine declares what it offers (specific agents with specific capabilities), and the hub discovers and catalogs these offerings. The hub then dispatches work to matching agents, but it never defines what an agent is or how it works.

```
Runner Model (CI systems):
  Server defines jobs --> pushes to generic runners

Discovery Model (AgentFleet):
  Machines define agents --> hub discovers --> hub dispatches matching work
```

### Why Discovery?

**Agent diversity.** Teams use different agents (Claude Code, Codex, Cursor, Aider, custom tooling). New agents appear regularly. A runner model would require the hub to understand each agent type. The discovery model lets the hub stay agent-neutral.

**Local specialization.** A developer might configure an agent with specific environment variables, custom system prompts, or repository-specific settings. These are local concerns that should not leak into the hub.

**Independent evolution.** A developer can experiment with a new agent type by changing their local manifest. No central approval or hub deployment needed. If the experiment works, other team members can adopt it independently.

**Graceful heterogeneity.** One developer might run Claude Code with a capacity of 2. Another might run Codex with a capacity of 4 and Claude Code with a capacity of 1. The hub handles this naturally because it sees agents, not machines.

## The Discovery Flow

```
Step 1: DEFINE              Step 2: CONNECT           Step 3: DISCOVER
+-------------------+       +------------------+      +------------------+
| Developer edits   |       | Daemon starts,   |      | Hub adds agents  |
| agents.yaml on    |------>| reads manifest,  |----->| to live registry |
| their machine     |       | connects to hub, |      | with tags and    |
|                   |       | sends agent list |      | capacity         |
+-------------------+       +------------------+      +------------------+

Step 4: ASSIGN              Step 5: DISPATCH
+-------------------+       +------------------+
| Team lead assigns |       | Ticket arrives,  |
| discovered agents |------>| hub matches tags,|
| to projects via   |       | dispatches to    |
| dashboard         |       | assigned agent   |
+-------------------+       +------------------+
```

### Step 1: Define

The developer creates or edits the agent manifest file at `~/.agentfleet/agents.yaml`. This file declares:
- What agents this machine offers
- What each agent can do (tags)
- How many tasks each agent can handle concurrently (capacity)
- How to invoke each agent (command, working directory, environment)

### Step 2: Connect

When the daemon starts (either manually or as a login item), it:
1. Reads the agent manifest
2. Validates the configuration
3. Opens a WebSocket connection to the hub
4. Authenticates using the team token and machine-specific API key
5. Sends a registration message containing the list of agents declared in the manifest

### Step 3: Discover

The hub receives the registration message and:
1. Creates or updates the teammate record for this machine
2. Creates or updates agent records for each declared agent
3. Marks all agents as online
4. Begins tracking heartbeats

If the daemon reconnects (after a disconnect), the hub reconciles: agents that were previously registered but are no longer in the manifest are deregistered; new agents in the manifest are added.

### Step 4: Assign

Discovering an agent makes it visible in the registry, but it does not make it eligible for dispatch. A team lead must explicitly assign agents to projects via the dashboard. This is a deliberate design choice: it prevents a newly connected machine from receiving work before the team lead has reviewed and approved the configuration.

### Step 5: Dispatch

Once an agent is assigned to a project, it becomes eligible for dispatch. When a ticket arrives on that project and matches routing rules that require tags the agent has, the hub will dispatch to that agent (subject to capacity).

## Agent Manifest Reference

The agent manifest is a YAML file at `~/.agentfleet/agents.yaml`.

### Full Schema

```yaml
# Hub connection
hub: <string>              # Hub URL (e.g., "https://hub.acme.dev")
token: <string>            # Team enrollment token

# Agent declarations
agents:
  - name: <string>         # Agent name (unique per machine)
    description: <string>  # What this agent does
    tags: <string[]>       # Capability tags for routing
    capacity: <integer>    # Max concurrent tasks (default: 1)
    agent_type: <string>   # Underlying agent (e.g., "claude-code", "codex", "aider")

    invoke:
      command: <string>    # Command to run (supports variable substitution)
      workdir: <string>    # Working directory (supports ~ expansion)
      env:                 # Additional environment variables
        <KEY>: <value>
      timeout: <duration>  # Max agent runtime (default: "1h")

    worktree:
      enabled: <boolean>   # Create git worktree per task (default: true)
      base_branch: <string> # Branch to create worktrees from (default: "main")
      cleanup: <string>    # When to clean up worktree: "on_complete", "on_success", "manual"
```

### Minimal Example

```yaml
hub: https://hub.acme.dev
token: af_xxxxxxxxxxxx

agents:
  - name: backend-agent
    tags: [backend]
    capacity: 1
    agent_type: claude-code
    invoke:
      command: claude -p "/implement {ticket_id}"
      workdir: ~/Code/my-project
```

### Full Example

```yaml
hub: https://hub.acme.dev
token: af_xxxxxxxxxxxx

agents:
  - name: backend-agent
    description: "Handles backend features, API work, database changes"
    tags: [backend, api, database]
    capacity: 2
    agent_type: claude-code
    invoke:
      command: >
        claude -p "/implement {ticket_id}: {ticket_title}\n\n{ticket_description}"
        --output-format stream-json --verbose
        --permission-mode auto
      workdir: ~/Code/acme-backend
      env:
        DATABASE_URL: postgresql://localhost:5432/dev
        CLAUDE_MODEL: claude-sonnet-4-20250514
      timeout: 45m
    worktree:
      enabled: true
      base_branch: main
      cleanup: on_complete

  - name: frontend-agent
    description: "Handles frontend features, UI components, styling"
    tags: [frontend, ui, react]
    capacity: 1
    agent_type: claude-code
    invoke:
      command: >
        claude -p "/implement {ticket_id}: {ticket_title}"
        --output-format stream-json --verbose
        --permission-mode auto
      workdir: ~/Code/acme-frontend
      timeout: 30m
    worktree:
      enabled: true
      base_branch: develop

  - name: quick-fixer
    description: "Fast bug fixes and small chores"
    tags: [bug, simple, chore, docs]
    capacity: 4
    agent_type: codex
    invoke:
      command: >
        codex --quiet
        --prompt "Fix: {ticket_title}\n\n{ticket_description}\n\nAcceptance criteria:\n{acceptance_criteria}"
      workdir: ~/Code/acme-backend
      timeout: 15m
    worktree:
      enabled: true
      cleanup: on_success

  - name: infra-agent
    description: "Infrastructure and DevOps tasks"
    tags: [infra, devops, terraform, docker]
    capacity: 1
    agent_type: claude-code
    invoke:
      command: >
        claude -p "/implement {ticket_id}"
        --output-format stream-json --verbose
      workdir: ~/Code/acme-infra
      env:
        AWS_PROFILE: dev
      timeout: 60m
```

## Variable Substitution

The `invoke.command` field supports variable substitution using `{variable_name}` syntax. Variables are populated from the dispatched ticket data.

| Variable | Source | Example |
|----------|--------|---------|
| `{ticket_id}` | NormalizedTicket.id | `KIP-123` |
| `{ticket_title}` | NormalizedTicket.title | `Add user search endpoint` |
| `{ticket_description}` | NormalizedTicket.description | Full markdown description |
| `{acceptance_criteria}` | NormalizedTicket.acceptanceCriteria (joined) | Bullet-pointed list |
| `{priority}` | NormalizedTicket.priority | `high` |
| `{labels}` | NormalizedTicket.labels (comma-separated) | `backend,api` |
| `{assignee}` | NormalizedTicket.assignee | `charlie@acme.com` |
| `{url}` | NormalizedTicket.url | `https://jira.acme.com/browse/KIP-123` |

Variables that are not present in the ticket data are replaced with empty strings.

## Tags

Tags are the primary mechanism for matching agents to work. They are free-form strings declared in the agent manifest and referenced in project routing rules.

### Tag Design Guidelines

Tags should describe what the agent is capable of, not what it is. Good tags:
- `backend`, `frontend`, `fullstack` -- area of the codebase
- `api`, `database`, `ui` -- type of work
- `bug`, `feature`, `chore` -- work category
- `simple`, `complex` -- complexity level
- `python`, `typescript`, `go` -- language specialization

The hub does not assign any semantic meaning to tags. They are matched as exact strings.

### Tag Matching

When the hub dispatches, it looks for agents whose tags are a superset of the required tags from the routing rule.

```
Routing rule requires: [backend, api]

charlie/backend-agent  tags: [backend, api, database]    -> MATCH (superset)
alice/fullstack-agent  tags: [backend, frontend]         -> NO MATCH (missing "api")
charlie/quick-fixer    tags: [bug, simple]               -> NO MATCH
```

## Registration Protocol

### Initial Registration

When the daemon connects, it sends a `register` message:

```json
{
  "type": "register",
  "machine": {
    "name": "charlie-macbook",
    "os": "darwin",
    "key": "mk_xxxxxxxxxxxx"
  },
  "agents": [
    {
      "name": "backend-agent",
      "description": "Handles backend features",
      "tags": ["backend", "api", "database"],
      "capacity": 2,
      "agent_type": "claude-code"
    },
    {
      "name": "quick-fixer",
      "description": "Fast bug fixes",
      "tags": ["bug", "simple"],
      "capacity": 4,
      "agent_type": "codex"
    }
  ]
}
```

The hub responds with:

```json
{
  "type": "registered",
  "teammate_id": "tm_abc123",
  "agents": [
    { "id": "ag_def456", "qualified_name": "charlie/backend-agent" },
    { "id": "ag_ghi789", "qualified_name": "charlie/quick-fixer" }
  ]
}
```

### Reconnection and Reconciliation

If the daemon reconnects (after a network interruption or restart), it sends the same `register` message with its current manifest. The hub reconciles:

- Agents present in both the old and new registration: updated in place (tags, capacity, description may have changed)
- Agents present only in the new registration: added to the registry
- Agents present only in the old registration: marked as deregistered

This means a developer can change their manifest and restart the daemon to update the hub. No manual registry cleanup is needed.

### Heartbeat

After registration, the daemon sends periodic heartbeats:

```json
{
  "type": "heartbeat",
  "teammate_id": "tm_abc123",
  "agents": [
    { "id": "ag_def456", "active_tasks": 1 },
    { "id": "ag_ghi789", "active_tasks": 0 }
  ]
}
```

The hub uses heartbeats to:
- Confirm the machine is still online
- Update active task counts (in case of state drift)
- Detect stale connections (if heartbeats stop, mark agents as offline after a timeout)

The default heartbeat interval is 30 seconds. The offline timeout is 90 seconds (3 missed heartbeats).

### Deregistration

On graceful shutdown, the daemon sends a `deregister` message:

```json
{
  "type": "deregister",
  "teammate_id": "tm_abc123"
}
```

The hub marks all agents on this machine as offline immediately, without waiting for the heartbeat timeout.

## Daemon CLI

### Initialization

```bash
npx @agentfleet/daemon init --hub <url> --token <token>
```

This command:
1. Creates `~/.agentfleet/` if it does not exist
2. Prompts for a machine name (defaults to hostname)
3. Generates a machine-specific API key
4. Registers the machine with the hub
5. Writes a template `agents.yaml`
6. Installs the daemon as a system login item

### Starting and Stopping

```bash
# Start the daemon (foreground, for development)
npx @agentfleet/daemon start

# The daemon also starts automatically at login via launchd/systemd
```

### Pausing and Resuming

```bash
# Stop accepting new dispatches (running tasks continue)
agentfleet pause

# Resume accepting dispatches
agentfleet resume
```

When paused, the daemon stays connected and reports status for running tasks, but it tells the hub it is not accepting new work. The hub skips paused agents during dispatch.

### Status

```bash
# Show current agent status
agentfleet status
```

Output:

```
Hub: https://hub.acme.dev (connected)
Machine: charlie-macbook

Agents:
  backend-agent    claude-code  [backend, api, database]  2/2 tasks  FULL
  frontend-agent   claude-code  [frontend, ui, react]     0/1 tasks  IDLE
  quick-fixer      codex        [bug, simple, chore]      1/4 tasks  BUSY

Active Tasks:
  KIP-123 -> backend-agent   running  12m30s
  KIP-124 -> backend-agent   running   3m15s
  KIP-130 -> quick-fixer     running   1m45s
```

### Manifest Reload

```bash
# Reload agents.yaml without restarting the daemon
agentfleet reload
```

This re-reads the manifest and sends an updated registration to the hub. Useful when adding, removing, or reconfiguring agents without interrupting running tasks.
