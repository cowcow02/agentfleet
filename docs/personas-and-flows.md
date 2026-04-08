# Personas and Flows

AgentFleet serves three personas: the Team Lead who sets up and configures the system, the Developer who works alongside AI agents, and the Engineering Manager who monitors fleet performance. This document describes each persona's workflow and walks through the complete end-to-end flow.

## Persona 1: Team Lead

The team lead is the person who deploys the hub, connects it to the team's project management tool, and manages how work is routed to agents.

### Responsibilities

- Deploy and maintain the hub
- Configure tracker integrations (Jira, Linear, GitHub Issues)
- Define routing rules for each project
- Review discovered agents and assign them to projects
- Generate enrollment tokens for developers
- Monitor routing effectiveness and adjust rules

### Workflow: Initial Setup

**Step 1: Deploy the hub.**

The hub is a single container. The team lead deploys it to any container host:

```bash
# Docker
docker run -d -p 3000:3000 agentfleet/hub

# Or using a one-click template on Railway, Fly.io, Render, etc.
```

**Step 2: Create the organization.**

Open the dashboard at the hub URL. The first-run wizard creates the organization:

```
Organization name: Acme Engineering
Admin email: lead@acme.com
```

**Step 3: Configure a tracker integration.**

Add a project and connect it to the tracker:

```
Project name: Backend API
Tracker: Jira
Instance: https://acme.atlassian.net
Project key: ACME
API credentials: (email + token)
```

The dashboard guides the team lead through configuring the webhook URL in Jira and mapping Jira statuses to AgentFleet's normalized statuses.

**Step 4: Define routing rules.**

Specify how ticket attributes map to agent tags:

```yaml
routing:
  - match: { labels: [backend, api] }
    require_tags: [backend]
  - match: { labels: [frontend, ui] }
    require_tags: [frontend]
  - match: { labels: [bug], priority: [low, medium] }
    require_tags: [simple]
  - match: { default: true }
    require_tags: [backend]
```

**Step 5: Generate enrollment token.**

Create a token that developers will use to connect their daemons:

```
Token: af_xxxxxxxxxxxx
Scope: Acme Engineering
```

The team lead shares this token with the team (via Slack, email, or documentation).

**Step 6: Wait for agents, then assign.**

As developers enroll their machines, agents appear in the registry. The team lead reviews each agent's tags and capabilities, then assigns them to the appropriate projects:

```
Dashboard -> Agents (discovered)

charlie/backend-agent    [backend, api, database]  cap:2   -> Assign to: Backend API
charlie/frontend-agent   [frontend, ui, react]     cap:1   -> Assign to: Frontend App
alice/fullstack-agent    [backend, frontend]        cap:3   -> Assign to: Backend API, Frontend App
```

### Ongoing Work

- Adjust routing rules as the team's labeling conventions evolve
- Assign newly discovered agents to projects
- Monitor the dispatch queue for bottlenecks (too many tickets, not enough agents)
- Add new project integrations as the team starts new workstreams

## Persona 2: Developer

The developer installs the daemon on their machine, defines their agent manifest, and then works in a loop: agents receive tickets automatically, produce PRs, and the developer reviews.

### Responsibilities

- Install and configure the daemon
- Define their agent manifest (what agents, what capabilities)
- Review PRs produced by agents
- Provide feedback (agents iterate on review comments)
- Pause/resume the daemon as needed
- Tune agent configurations over time

### Workflow: Getting Started

**Step 1: Install the daemon.**

```bash
npx @agentfleet/daemon init --hub https://hub.acme.dev --token af_xxxxxxxxxxxx
```

This creates `~/.agentfleet/`, generates a machine key, registers the machine with the hub, and installs the daemon as a login item.

**Step 2: Define the agent manifest.**

Edit `~/.agentfleet/agents.yaml`:

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
```

**Step 3: Start the daemon.**

```bash
npx @agentfleet/daemon start
```

The daemon connects to the hub, registers the agents, and begins accepting dispatches. From this point, the developer's machine is part of the fleet.

### Workflow: Daily Operation

The developer's daily workflow shifts from "start agent manually for each ticket" to "review PRs and provide feedback."

**Morning check:**

```bash
agentfleet status
```

```
Hub: https://hub.acme.dev (connected)
Machine: charlie-macbook

Agents:
  backend-agent    claude-code  [backend, api, database]  0/2 tasks  IDLE

Active Tasks: none
Completed (last 24h): 3 tasks (KIP-118, KIP-119, KIP-120)
```

**Tickets arrive automatically.** When the team lead or a team member moves a ticket to "Ready for Dev" in Jira, and routing rules match Charlie's agents, the daemon receives the dispatch. The developer sees a desktop notification:

```
AgentFleet: Dispatched KIP-123 to backend-agent
"Add user search endpoint"
```

**PRs appear.** When the agent finishes, a PR appears in GitHub. The developer reviews it like any other PR:

```
PR #247: agent/KIP-123-add-user-search
  "Implement user search endpoint with pagination and filters"
  
  Files changed: 6
  +180 -12
```

**Review feedback loop.** If the developer leaves review comments, the hub can dispatch a follow-up to the same agent with the review context. The agent iterates, pushes new commits, and the developer reviews again.

**Pausing.** If the developer needs to do resource-intensive work (large compilation, video call, etc.), they can pause:

```bash
agentfleet pause
# Running tasks continue, but no new dispatches arrive
# ...
agentfleet resume
```

### Tuning Over Time

Developers learn what works for their agents and refine configurations:

- Adjusting capacity based on machine performance
- Refining agent descriptions and tags for better routing
- Adding environment variables for specific project needs
- Splitting one broad agent into multiple specialized agents
- Experimenting with different agent types (switching from Codex to Claude Code for certain work)

## Persona 3: Engineering Manager

The engineering manager monitors the fleet's performance, identifies bottlenecks, and tracks metrics across the team.

### Responsibilities

- Monitor fleet health (which machines are online, which agents are busy)
- Track the ticket pipeline (queued, dispatched, running, in review, done)
- Identify capacity bottlenecks and staffing needs
- Review metrics (throughput, time-to-PR, agent utilization, cost)
- Respond to alerts (stuck agents, offline machines with queued work)

### Dashboard Views

**Fleet Status.** Real-time view of all machines and agents:

```
Fleet Status
  Online: 4/5 machines    12/15 agents available

  charlie-macbook    ONLINE    3 agents    2 active tasks
  alice-desktop      ONLINE    2 agents    1 active task
  bob-workstation    ONLINE    3 agents    0 active tasks
  diana-laptop       ONLINE    2 agents    2 active tasks
  evan-macbook       OFFLINE   (last seen: 2h ago)
```

**Ticket Pipeline.** Shows the flow of work through the system:

```
Pipeline (Backend API project)
  Queued:       3 tickets  (oldest: 12m)
  Dispatched:   1 ticket
  Running:      4 tickets  (avg runtime: 18m)
  In Review:    2 tickets  (avg wait: 45m)
  Done today:   8 tickets
```

**Alerts:**

```
Alerts
  [WARNING] 3 backend tickets queued with no available agents (all at capacity)
  [WARNING] evan-macbook offline for 2h with 1 queued ticket
  [INFO]    charlie/backend-agent running KIP-134 for 47m (timeout at 60m)
```

**Metrics.** See [Dashboard](dashboard.md) for the full metrics reference.

## End-to-End Flow

This section walks through a complete ticket lifecycle, from creation in Jira to completion.

### Setup

- The hub is deployed at `hub.acme.dev`
- Project "Backend API" is connected to Jira (project key: KIP)
- Routing rules: `labels: [backend, api]` -> `require_tags: [backend]`
- Charlie's machine has `charlie/backend-agent` (claude-code, tags: [backend, api], capacity: 2, 1 active task)
- Alice's machine has `alice/fullstack-agent` (claude-code, tags: [backend, frontend], capacity: 3, 0 active tasks)

### Step-by-Step

**1. Team lead assigns KIP-123 to Charlie in Jira and moves it to "Ready for Dev."**

The team lead opens KIP-123 ("Add user search endpoint"), assigns it to Charlie, and drags it to the "Ready for Dev" column on the Jira board.

**2. Jira fires a webhook to the hub.**

Jira sends an HTTP POST to `https://hub.acme.dev/webhooks/jira` with the issue update payload. The payload includes the issue key (KIP-123), the new status ("Ready for Dev"), and all issue fields.

**3. Hub normalizes the ticket via the Jira adapter.**

The Jira adapter:
- Verifies the webhook signature
- Parses the payload
- Maps "Ready for Dev" to normalized status `todo` (via the project's status map)
- Extracts labels: ["backend", "api"]
- Extracts assignee: charlie@acme.com
- Produces a NormalizedTicket

**4. Hub applies routing rules.**

The routing engine evaluates the project's rules against the ticket:
- Rule 1: `match: { labels: [backend, api] }` -- the ticket has "backend" and "api". Match.
- Required tags: `[backend]`

**5. Hub queries the registry for matching agents.**

The registry finds agents that:
- Are assigned to the "Backend API" project
- Have the "backend" tag
- Are online and have available capacity

Results:
- `charlie/backend-agent`: tags [backend, api, database], capacity 2, active 1 -> available
- `alice/fullstack-agent`: tags [backend, frontend], capacity 3, active 0 -> available

**6. Hub selects the best agent and dispatches.**

The dispatcher applies the priority sequence:
- Priority 1 (assignee affinity): KIP-123 is assigned to Charlie. `charlie/backend-agent` is on Charlie's machine. Prefer this agent.
- Selected: `charlie/backend-agent`

The hub sends a dispatch message via WebSocket to Charlie's daemon:

```json
{
  "type": "dispatch",
  "dispatch_id": "dsp_abc123",
  "agent_name": "backend-agent",
  "ticket": {
    "id": "KIP-123",
    "title": "Add user search endpoint",
    "description": "Implement a search endpoint for users with pagination...",
    "labels": ["backend", "api"],
    "priority": "medium",
    "assignee": "charlie@acme.com",
    "url": "https://acme.atlassian.net/browse/KIP-123"
  }
}
```

**7. Daemon creates a git worktree and spawns the agent.**

Charlie's daemon:
1. Creates a git worktree: `git worktree add /tmp/agentfleet/KIP-123 -b agent/KIP-123 main`
2. Resolves the invoke command with ticket variables
3. Spawns: `claude -p "/implement KIP-123: Add user search endpoint\n\n..." --output-format stream-json --verbose --permission-mode auto`
4. Sets the working directory to the worktree
5. Sets `AGENTFLEET_DISPATCH_ID=dsp_abc123` in the environment
6. Begins monitoring the stdout stream

The daemon sends `task_started` to the hub.

**8. Agent works. Status pings relay in real time.**

The agent reads the codebase, writes tests, implements the feature. The daemon parses the stream-json output and relays status pings to the hub:

```
09:00:15  task_started
09:01:30  "tool: Read (src/models/user.ts)"
09:01:33  "tool: Read (src/routes/users.ts)"
09:02:45  "tool: Read (src/services/userService.ts)"
09:05:00  "tool: Edit (src/routes/users.ts) -- adding search endpoint"
09:08:30  "tool: Edit (src/services/userService.ts) -- implementing search logic"
09:12:00  "tool: Edit (tests/users.test.ts) -- writing test cases"
09:18:00  "tool: Bash (npm test)"
09:24:00  "tool: Bash (git push origin agent/KIP-123)"
```

**9. Agent pushes branch and creates PR.**

The agent creates PR #247 on GitHub with:
- Branch: `agent/KIP-123-add-user-search`
- Title: "KIP-123: Add user search endpoint with pagination and filters"
- Description: Implementation details, test results

The daemon detects the PR creation (from the stream-json output or from a status ping from the harness) and reports it as part of task completion:

```json
{
  "type": "task_complete",
  "dispatch_id": "dsp_abc123",
  "exit_code": 0,
  "result": {
    "pr_url": "https://github.com/acme/backend/pull/247",
    "branch": "agent/KIP-123-add-user-search",
    "cost_usd": 0.14
  }
}
```

**10. Hub updates Jira.**

The hub:
- Transitions KIP-123 to "In Review" in Jira (via the Jira adapter)
- Posts a comment on KIP-123:

```
AgentFleet completed this ticket.

Agent: charlie/backend-agent
Duration: 24m 15s
PR: https://github.com/acme/backend/pull/247
```

**11. Charlie reviews the PR.**

Charlie opens PR #247, reviews the code, and leaves a comment:

```
The search logic looks good but doesn't handle the case where the search
query is empty. Please add a validation check and return a 400 error.
```

**12. GitHub webhook triggers review feedback iteration.**

GitHub fires a webhook for the PR comment. The hub receives it, identifies the associated dispatch, and creates a follow-up dispatch to the same agent:

The daemon spawns the agent again in the same worktree, with the review context included in the prompt.

**13. Agent addresses the feedback.**

The agent reads the review comment, adds the validation check, updates tests, and pushes new commits to the same branch. The PR is updated.

**14. Charlie approves and merges.**

Charlie reviews the updated PR, approves it, and merges it.

**15. Hub updates Jira to "Done."**

The hub detects the merge (via GitHub webhook), transitions KIP-123 to "Done" in Jira, and logs the total time:

```
Total lifecycle:
  Dispatch to PR:       24m 15s  (agent work)
  PR to first review:   32m 00s  (human review wait)
  Review to iteration:  12m 30s  (agent follow-up)
  Iteration to merge:    8m 00s  (human approval)
  Total:                1h 16m 45s
```

## Before and After

### Before AgentFleet

```
09:00  Charlie opens Jira, picks up KIP-123
09:05  Charlie reads the ticket, copies description
09:08  Charlie opens terminal, navigates to repo
09:10  Charlie creates a branch
09:12  Charlie starts Claude Code, pastes the ticket description
09:12  Claude Code works...
09:35  Claude Code finishes
09:36  Charlie reviews the output
09:40  Charlie creates a PR manually
09:42  Charlie updates Jira to "In Review"
09:43  Charlie posts the PR link as a Jira comment
10:15  Alice reviews the PR, leaves comments
10:20  Charlie starts Claude Code again with review context
10:32  Claude Code finishes
10:33  Charlie pushes the changes
10:35  Alice approves, Charlie merges
10:36  Charlie updates Jira to "Done"

Elapsed: 1h 36m
Human involvement: 20+ minutes of manual coordination (not including review)
Tickets per day (with other work): 2-3
```

### After AgentFleet

```
09:00  Team lead moves KIP-123 to "Ready for Dev" in Jira
09:00  [automatic] Hub receives webhook, dispatches to charlie/backend-agent
09:00  [automatic] Daemon spawns Claude Code in git worktree
09:25  [automatic] Agent creates PR, hub updates Jira
10:00  Charlie reviews PR #247, leaves one comment
10:00  [automatic] Hub dispatches follow-up with review context
10:12  [automatic] Agent pushes updated code
10:15  Charlie approves, merges
10:15  [automatic] Hub updates Jira to "Done"

Elapsed: 1h 15m
Human involvement: 5 minutes (review + approval)
Tickets per day (with agents running in parallel): 8-15
```

The key difference: the developer's role shifts from "operator" (start agent, copy context, create PR, update tracker) to "reviewer" (review PR, provide feedback). The coordination overhead (webhook handling, status updates, tracker management) is fully automated.

## Workflow Variations

### Variation: Unassigned Tickets

If a ticket does not have a specific assignee, the hub skips assignee affinity and goes straight to load balancing. The ticket goes to whichever matching agent has the most available capacity.

### Variation: All Agents Busy

If all matching agents are at capacity, the ticket enters the dispatch queue. The dashboard shows the queue depth and wait time. When an agent becomes available, the highest-priority queued ticket is dispatched first.

### Variation: Developer Offline

If Charlie's machine is offline (laptop closed, VPN disconnected), Charlie's agents are marked offline in the registry. Tickets that would have gone to Charlie's agents are routed to other matching agents (e.g., Alice's fullstack-agent). If no other agents match, the tickets queue.

### Variation: Mixed Agent Types

A team might have developers using different agent types. Charlie uses Claude Code; Bob uses Codex. Both can have agents with the "backend" tag. The hub does not differentiate -- it dispatches based on tags and capacity. The daemon on each machine knows how to invoke the specific agent type.
