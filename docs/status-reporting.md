# Status Reporting

The hub tracks what agents are doing without understanding their internals. This document describes the opaque push model for status updates, the time tracking it enables, and the process monitoring strategies for different agent types.

## Design Principle: Opaque Push

The hub does NOT understand what agents are doing internally. Agent phases, workflows, and harnesses are team-specific. One team might use Claude Code with a custom harness that has phases like "reading codebase", "writing tests", "implementing", "refactoring". Another team might use Codex with no phases at all.

The hub treats status updates as opaque messages. It does not parse them, interpret them, or act on their content (beyond displaying them and recording timestamps). This keeps the hub agent-neutral and avoids coupling the hub to any specific agent workflow.

## How Status Reporting Works

### The Flow

```
Agent Process                    Daemon                          Hub
     |                              |                              |
     |  POST /status                |                              |
     |  {"msg": "reading code"}     |                              |
     |----------------------------->|                              |
     |                              |  WebSocket: status_ping      |
     |                              |  {msg: "reading code"}       |
     |                              |----------------------------->|
     |                              |                              |  Record timestamp
     |                              |                              |  Display in dashboard
     |                              |                              |
     |  POST /status                |                              |
     |  {"msg": "writing tests"}    |                              |
     |----------------------------->|                              |
     |                              |  WebSocket: status_ping      |
     |                              |----------------------------->|
     |                              |                              |  Record timestamp
     |                              |                              |  Calculate delta
     |                              |                              |
     |  exit 0                      |                              |
     |----------------------------->|                              |
     |                              |  WebSocket: task_complete    |
     |                              |  {exit_code: 0}              |
     |                              |----------------------------->|
     |                              |                              |  Record completion
```

### Three Event Types

**Dispatch.** Sent by the hub to the daemon. Marks the start of a task.

**Status Ping.** Sent by the agent (or harness) to the daemon's local endpoint. The daemon relays it to the hub. Contains an opaque message string.

**Completion.** Sent by the daemon to the hub when the agent process exits. Contains the exit code and optionally a result payload (PR URL, branch name, error message).

## Local Status Endpoint

The daemon exposes a local HTTP endpoint on `localhost` that agents or team harnesses can POST status messages to.

### Endpoint

```
POST http://localhost:{port}/status
Content-Type: application/json

{
  "dispatch_id": "dsp_abc123",
  "message": "reading codebase",
  "data": {                          // optional structured data
    "files_read": 42,
    "phase": "analysis"
  }
}
```

The port is configurable in the daemon settings (default: `7117`). The `dispatch_id` is provided to the agent process via an environment variable (`AGENTFLEET_DISPATCH_ID`) when it is spawned.

### Response

```
200 OK
{"received": true}
```

The daemon does not validate or interpret the message content. It timestamps the ping and relays it to the hub.

### Why Local HTTP?

The status endpoint is `localhost`-only. This has several advantages:
- No network configuration needed (agent process and daemon are on the same machine)
- No authentication needed (localhost access implies same-user trust)
- Works with any agent or harness that can make HTTP calls
- Decoupled from the agent's own output format (stdout, stderr, files)

## What the Hub Records

For each dispatch, the hub records a timeline:

```
Dispatch:   KIP-123 -> charlie/backend-agent     @ 09:00:00
Ping:       "reading codebase"                    @ 09:01:15   (+1m 15s)
Ping:       "analyzing ticket requirements"       @ 09:02:30   (+1m 15s)
Ping:       "writing tests"                       @ 09:05:30   (+3m 00s)
Ping:       "implementing solution"               @ 09:10:45   (+5m 15s)
Ping:       "running test suite"                  @ 09:20:00   (+9m 15s)
Ping:       "PR #247 created"                     @ 09:25:10   (+5m 10s)
Complete:   exit 0                                @ 09:25:30   (+0m 20s)
```

The hub records:
- The absolute timestamp of each event
- The delta since the previous event (shown in parentheses above)
- The total elapsed time from dispatch to completion

## Free Time Tracking

The timestamp data from status reporting provides time tracking at no additional cost. No separate time tracking tool is needed.

### Metrics Derived from Status Data

**Total agent time.** Time from dispatch to completion. In the example above: 25 minutes 30 seconds.

**Segment durations.** Time between consecutive pings. Shows how long the agent spent in each phase. "Writing tests" to "implementing solution" took 5 minutes 15 seconds.

**Wait time.** Time after the agent signals "PR created" until the PR is merged (tracked via GitHub webhook). This measures human review latency.

**Per-agent utilization.** Percentage of time each agent is actively working vs. idle. Calculated from total task time divided by total online time.

**Per-project burn.** Total agent-hours spent on each project over a time period. Useful for understanding where engineering effort (human and agent) is going.

**Throughput.** Tickets completed per agent per day/week. Shows which agents and configurations are most productive.

### Dashboard Metrics View

The dashboard presents these metrics in several views:

```
Agent Utilization (last 24h)
  charlie/backend-agent    ████████████░░░░  75%   12 tasks   avg 22m
  charlie/quick-fixer      ██████░░░░░░░░░░  38%   28 tasks   avg  8m
  alice/fullstack-agent    ██████████████░░  88%    9 tasks   avg 35m
  alice/infra-agent        ██░░░░░░░░░░░░░░  12%    2 tasks   avg 45m

Project Burn (this week)
  Project Alpha   47 agent-hours    34 tickets completed    avg 1h 23m
  Project Beta    12 agent-hours    52 tickets completed    avg  14m
```

## Process Monitoring

Beyond the optional status pings, the daemon monitors agent processes directly. The monitoring strategy depends on the agent type.

### Claude Code: Stream-JSON Monitoring

For agents of type `claude-code`, the daemon can leverage Claude Code's `--output-format stream-json --verbose` flag to get real-time typed events on stdout without interfering with the agent's operation.

The stream produces JSON objects, one per line:

```json
{"type": "system", "subtype": "init", "session_id": "sess_abc", "model": "claude-sonnet-4-20250514"}
{"type": "assistant", "message": {"content": [{"type": "text", "text": "I'll start by reading..."}]}}
{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Read", "input": {"file": "src/main.ts"}}]}}
{"type": "user"}
{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Edit", "input": {"file": "src/main.ts"}}]}}
{"type": "user"}
{"type": "result", "subtype": "success", "duration_ms": 154000, "total_cost_usd": 0.14}
```

The daemon parses these events to extract:

| Event | What the Daemon Extracts |
|-------|-------------------------|
| `system.init` | Session started, model being used |
| `assistant` with `tool_use` | Which tools the agent is using (Read, Edit, Bash, etc.) |
| `result.success` | Task completed, duration, cost |
| `result.error` | Task failed, error details |

This data is relayed to the hub as structured status pings, giving rich visibility into agent behavior without requiring the agent or harness to explicitly call the status endpoint.

**Example: automatic status pings from stream-json parsing:**

```
Ping: "tool: Read (src/models/user.ts)"          @ 09:01:15
Ping: "tool: Read (src/routes/users.ts)"          @ 09:01:18
Ping: "tool: Edit (src/routes/users.ts)"          @ 09:03:45
Ping: "tool: Bash (npm test)"                     @ 09:05:20
Ping: "tool: Bash (git push)"                     @ 09:24:50
```

### Cost Tracking

For Claude Code agents, the `result` event includes `total_cost_usd`. The daemon reports this to the hub, enabling per-task and per-agent cost tracking:

```
Task KIP-123  ->  charlie/backend-agent  ->  $0.14
Task KIP-124  ->  charlie/backend-agent  ->  $0.23
Task KIP-125  ->  alice/fullstack-agent  ->  $0.18
                                              ------
                                              $0.55 total (last hour)
```

### Codex and Other Agents: Process-Level Monitoring

For agents that do not provide a structured output stream, the daemon falls back to process-level monitoring:

**CPU and memory usage.** The daemon samples the agent process's CPU and memory usage periodically (every 10 seconds by default). Spikes in CPU usage typically indicate the agent is actively working. Sustained low CPU may indicate the agent is waiting for an API response.

**Exit code detection.** When the process exits, the daemon captures the exit code:
- `0` -- success
- Non-zero -- failure (the daemon includes the last N lines of stderr in the failure report)

**Stdout/stderr capture.** The daemon captures stdout and stderr streams. For agents that print status information to stdout, teams can configure pattern matching to extract status messages:

```yaml
agents:
  - name: my-agent
    agent_type: generic
    monitor:
      stdout_patterns:
        - pattern: "^Status: (.+)$"
          extract: status_message
        - pattern: "^PR: (.+)$"
          extract: pr_url
```

### Timeout Handling

Each agent has a configurable timeout (default: 1 hour). If the agent process exceeds this timeout:

1. The daemon sends a SIGTERM to the process
2. Waits 30 seconds for graceful shutdown
3. Sends SIGKILL if the process is still running
4. Reports the task as failed with reason "timeout"
5. The hub handles the failure according to the project's retry configuration

## Status Update Protocol

### Daemon to Hub Messages

**task_started** -- Sent when the daemon spawns the agent process.

```json
{
  "type": "task_started",
  "dispatch_id": "dsp_abc123",
  "agent_id": "ag_def456",
  "pid": 12345,
  "started_at": "2026-04-08T09:00:15Z"
}
```

**status_ping** -- Sent when the daemon receives a status ping from the agent or extracts one from the output stream.

```json
{
  "type": "status_ping",
  "dispatch_id": "dsp_abc123",
  "message": "writing tests",
  "data": { "phase": "testing" },
  "timestamp": "2026-04-08T09:05:30Z"
}
```

**task_complete** -- Sent when the agent process exits.

```json
{
  "type": "task_complete",
  "dispatch_id": "dsp_abc123",
  "exit_code": 0,
  "duration_ms": 1530000,
  "result": {
    "pr_url": "https://github.com/acme/backend/pull/247",
    "branch": "agent/KIP-123-add-user-search",
    "cost_usd": 0.14
  },
  "completed_at": "2026-04-08T09:25:30Z"
}
```

**task_failed** -- Sent when the agent process exits with a non-zero exit code or times out.

```json
{
  "type": "task_failed",
  "dispatch_id": "dsp_abc123",
  "exit_code": 1,
  "reason": "non_zero_exit",
  "error": "Error: test suite failed with 3 failures",
  "duration_ms": 900000,
  "failed_at": "2026-04-08T09:15:00Z"
}
```

## Review Feedback Loop

When an agent creates a PR and a reviewer leaves comments, the hub can trigger a follow-up dispatch to the same agent to address the feedback.

### Flow

```
1. Agent completes task, creates PR #247
2. Hub transitions ticket to "in_review" in the tracker
3. Reviewer comments on PR: "This doesn't handle the edge case where..."
4. GitHub webhook fires -> Hub receives the comment
5. Hub creates a follow-up dispatch to the same agent:
   - Same ticket, same worktree
   - Prompt includes the review comment
6. Agent reads feedback, iterates, pushes new commits
7. Reviewer approves, merges
8. Hub transitions ticket to "done"
```

The follow-up dispatch includes the review context:

```json
{
  "type": "dispatch",
  "dispatch_id": "dsp_xyz789",
  "ticket": { ... },
  "context": {
    "follow_up": true,
    "previous_dispatch_id": "dsp_abc123",
    "pr_url": "https://github.com/acme/backend/pull/247",
    "review_comments": [
      {
        "author": "charlie",
        "body": "This doesn't handle the edge case where user is null",
        "file": "src/routes/users.ts",
        "line": 42
      }
    ]
  }
}
```

The daemon formats this context and includes it in the agent's prompt, allowing the agent to address the specific feedback.
