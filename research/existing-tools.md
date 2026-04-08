# Existing Tools to Build On Research

## Tool-by-Tool Evaluation

### 1. Hookdeck (Webhook Relay)

**What it does:** Managed webhook infrastructure -- receives, queues, retries, and delivers webhooks with observability.

**Relevant to AgentFleet:** The hub receives webhooks from Jira, Linear, and GitHub. Hookdeck could sit between the trackers and the hub, handling:
- Retry logic (if hub is temporarily down)
- Signature verification
- Rate limiting
- Webhook event logging

**Assessment:**

| Aspect | Finding |
|---|---|
| **Value** | Medium -- solves reliability and observability for webhooks |
| **Cost** | Free tier: 100K events/month. Paid: $75/month+ |
| **Dependency risk** | Adds a managed service dependency for a self-hosted product |
| **Alternative** | Build simple retry + logging in the hub (10-20 lines of code) |

**Recommendation: Do not use.** AgentFleet's webhook volume is tiny (tens-hundreds per day for a small team). Built-in retry logic is trivial:

```typescript
// Simple webhook processing with retry
async function processWebhook(event: WebhookEvent): Promise<void> {
  try {
    await dispatchTicket(event);
  } catch (err) {
    // Log to audit table, retry later
    await db.insert(failedWebhooks).values({
      event: JSON.stringify(event),
      error: err.message,
      retryAt: new Date(Date.now() + 60_000),
    });
  }
}
```

Hookdeck becomes valuable only if webhook reliability is critical at scale (1000s of events/minute). For AgentFleet's scale, it is overhead.

**Hookdeck Outpost (self-hosted):** Hookdeck released an open-source self-hosted version called Outpost. This is interesting but focused on *outbound* webhooks (sending, not receiving). Not applicable to AgentFleet's use case.

### 2. mcp-ticketer (Multi-Platform Tracker Abstraction)

**What it does:** Universal ticket management MCP server that provides a unified API across Jira, Linear, GitHub Issues, and Asana. Normalizes tickets to a common model (Epic, Task, Comment).

**Relevant to AgentFleet:** The hub needs to read/update tickets across Jira, Linear, and GitHub.

**Assessment:**

| Aspect | Finding |
|---|---|
| **Value** | Medium -- solves the abstraction layer |
| **Architecture fit** | Poor -- designed as an MCP server for AI agents, not as a library |
| **Dependencies** | Pulls in MCP SDK, multiple tracker SDKs |
| **Webhook support** | None -- does not handle inbound webhooks |
| **Our needs** | Read ticket, update status, post comment, handle webhook events |

**Recommendation: Do not use.** mcp-ticketer is an MCP server -- it runs as a separate process and communicates via MCP protocol. AgentFleet needs a library, not a server. Our abstraction layer is simple (3 platform clients with a common interface -- see tracker-integration.md), and we need webhook normalization which mcp-ticketer does not provide.

The `@linear/sdk`, `jira.js`, and `@octokit/rest` packages are the right building blocks.

### 3. Haiflow Architecture (tmux + REST API for Claude Code)

**What it does:** Wraps Claude Code in tmux sessions, exposes a REST API to control them. Enables programmatic control over Claude Code instances without the SDK.

**Architecture pattern:**
```
HTTP Request → REST API → tmux send-keys → Claude Code
                        ← tmux capture-pane ← Claude output
```

**Assessment:**

| Aspect | Finding |
|---|---|
| **Value** | Low for AgentFleet -- we use `child_process.spawn` directly |
| **Pattern relevance** | The REST API wrapper idea is useful for the hub |
| **tmux dependency** | Unnecessary -- Node.js `spawn` with piped stdio is simpler and gives better control |
| **Output parsing** | tmux capture-pane is fragile vs NDJSON stream parsing |

**Recommendation: Do not adopt the tmux pattern.** Piping stdout/stderr from `child_process.spawn` gives us:
- Structured NDJSON events (with `--output-format stream-json`)
- Proper signal handling (SIGTERM/SIGKILL)
- Process group management
- No tmux dependency

The tmux approach is a workaround for when you cannot pipe the process directly. AgentFleet's daemon *owns* the agent process lifecycle, so direct spawning is strictly better.

**What to take from Haiflow:** The REST API pattern for controlling agents remotely is good. AgentFleet achieves this through the WebSocket connection (hub sends dispatch commands to daemon).

### 4. Cyrus Architecture (Linear Background Agent)

**What it does:** Open-source Linear agent that monitors issues assigned to a bot user, creates git worktrees, runs Claude Code, and posts updates back to Linear.

**Architecture:**
```
Linear Webhook → Cyrus → Git Worktree → Claude Code → PR + Linear Comment
```

**Assessment:**

| Aspect | Finding |
|---|---|
| **Value** | High -- solves nearly the same problem as AgentFleet's daemon |
| **Architecture** | Transitioning to edge-proxy pattern (OAuth/webhook handling separated from workers) |
| **Tech stack** | TypeScript, Node.js, pnpm monorepo |
| **Scope** | Single-tracker (Linear-first, GitHub/GitLab added), single-machine |
| **Missing** | Multi-machine fleet management, dispatch routing, dashboard, multi-tracker webhooks |

**Key patterns to adopt from Cyrus:**

1. **Worktree isolation per issue:** Cyrus creates a dedicated git worktree with a sanitized branch name for each issue. We should use the same pattern:
   ```
   git worktree add -b agentfleet/{ticket-id} ~/.agentfleet/worktrees/{ticket-id} origin/main
   ```

2. **AI classification of issues:** Before processing, Cyrus classifies issues by type (code, question, research). AgentFleet could adopt this for smarter routing.

3. **Comment-based progress updates:** Streaming agent activity back to the tracker as comments. This is a great UX pattern.

4. **Edge-proxy architecture:** Separating OAuth/webhook handling from the actual agent worker. Maps to AgentFleet's hub/daemon split.

**Recommendation: Study, do not depend on.** Cyrus is the closest existing tool to what AgentFleet builds. Key differences:
- Cyrus is a single-machine tool. AgentFleet distributes across a fleet.
- Cyrus handles webhooks directly. AgentFleet's hub centralizes webhook handling.
- Cyrus is Linear-first. AgentFleet is tracker-agnostic.

Adopt Cyrus's proven patterns (worktree management, progress comments) but build the fleet orchestration from scratch.

### 5. Composio Agent Orchestrator

**What it does:** Coordinates parallel AI coding agents across git worktrees. Plans tasks from GitHub/Linear issues, spawns agents (Claude Code, Codex, Aider), handles CI failures, and manages PRs.

**Architecture:**
```
ao start → Dashboard (localhost:3000)
         → Orchestrator Agent
           → Task Distribution (issue → agent in worktree)
           → Autonomous Execution
           → CI Feedback Routing
           → Human Approval Gates
```

**Plugin system (7 extensible slots):**

| Slot | Default | Alternatives |
|---|---|---|
| Runtime | tmux | process |
| Agent | claude-code | codex, aider, opencode |
| Workspace | worktree | clone |
| Tracker | github | linear, gitlab |
| SCM | github | gitlab |
| Notifier | desktop | slack, discord, webhook |
| Terminal | iterm2 | web |

**Assessment:**

| Aspect | Finding |
|---|---|
| **Value** | High -- most architecturally similar to AgentFleet |
| **Scope** | Single machine orchestration (no fleet distribution) |
| **Plugin system** | Excellent pattern for extensibility |
| **CI integration** | Automatic failure routing is a differentiating feature |
| **Config** | YAML-based (agent-orchestrator.yaml) |
| **Dashboard** | Built-in web dashboard at localhost:3000 |

**Key patterns to adopt:**

1. **Plugin architecture:** The 7-slot plugin system is well-designed. AgentFleet could adopt a similar pattern for tracker plugins and agent runtime plugins:
   ```typescript
   interface TrackerPlugin {
     name: string;
     parseWebhook(payload: unknown): NormalizedEvent;
     getTicket(id: string): Promise<Ticket>;
     updateStatus(id: string, status: string): Promise<void>;
     addComment(id: string, body: string): Promise<void>;
   }
   ```

2. **Reaction-driven feedback:** CI failures and code review comments automatically route back to the agent. AgentFleet should support this through GitHub webhook events for PR reviews and CI status.

3. **Configuration format:** The `agent-orchestrator.yaml` structure with defaults and reactions is a good reference for AgentFleet's hub config.

**What Composio Orchestrator lacks (that AgentFleet adds):**
- Fleet distribution (multi-machine)
- Centralized webhook reception
- Agent discovery across machines
- Persistent assignment tracking and audit log
- Team-level dashboard and metrics

**Recommendation: Study the plugin architecture, adopt the reaction pattern.** Do not use as a dependency -- the single-machine assumption permeates the codebase, and retrofitting fleet distribution would be harder than building fresh.

### 6. Claude Code Native Agent Teams

**What it does:** Built-in Claude Code feature for multi-agent coordination. Uses git-based coordination where agents claim tasks, merge changes, and resolve conflicts automatically.

**Assessment:**

| Aspect | Finding |
|---|---|
| **Value** | Low -- different scope (intra-session coordination, not fleet management) |
| **Architecture** | Git-based task claiming, automatic conflict resolution |
| **Scope** | Within a single repository, single machine |
| **Relevance** | Could be used *within* an agent spawned by AgentFleet |

**Recommendation: Orthogonal.** Agent Teams operates at a different level -- it coordinates within a Claude Code session. AgentFleet operates at the fleet level -- it decides *which machine* gets *which ticket*. A Claude Code agent spawned by AgentFleet could internally use Agent Teams for sub-task parallelism.

### 7. Claude Agent SDK (TypeScript)

**What it does:** Anthropic's official SDK that wraps Claude Code CLI as a programmable library. Handles subprocess management, tool registration, hooks, MCP servers, and subagent spawning.

**Assessment:**

| Aspect | Finding |
|---|---|
| **Value** | Medium-High -- could replace raw `child_process.spawn` for Claude Code |
| **Overhead** | ~12s startup per query call (can be mitigated with `startup()` pre-warming) |
| **API** | `query()` for single-turn, `startup()` for pre-warming |
| **Advantages** | Typed events, error handling, tool registration, hooks |
| **Disadvantages** | Couples daemon to Anthropic SDK, heavier than raw spawn |

```typescript
import { ClaudeAgent } from '@anthropic-ai/claude-agent-sdk';

const agent = new ClaudeAgent();
await agent.startup(); // Pre-warm: ~12s, but only once

const result = await agent.query({
  prompt: 'Implement the feature described in PROJ-123',
  options: {
    maxBudgetUsd: 5.0,
    permissionMode: 'auto',
  },
});
```

**Recommendation: Use for Claude Code agents, keep raw spawn for others.** The SDK provides better error handling and typed events than parsing NDJSON manually. But the daemon must also support non-Claude agents (Codex, Aider, custom scripts), which require raw `child_process.spawn`. Use the SDK as the default Claude Code runtime, with raw spawn as the fallback for other agents.

## Summary: Build vs Buy/Adopt

| Component | Decision | Rationale |
|---|---|---|
| Webhook handling | **Build** | Trivial at our scale, no external dependency needed |
| Tracker abstraction | **Build** (thin layer on SDKs) | Simple interface, webhook normalization needed |
| tmux-based agent management | **Skip** | Direct process spawning is strictly better |
| Worktree management | **Build** (adopt patterns from Cyrus) | Simple git commands, well-documented |
| Plugin architecture | **Adopt pattern** from Composio | Extensibility model for trackers and agents |
| CI feedback routing | **Adopt pattern** from Composio | Valuable feature, implement via GitHub webhooks |
| Claude Code spawning | **Use Agent SDK** for Claude, raw spawn for others | Best of both worlds |
| Fleet distribution | **Build** | Core differentiator, not available in any existing tool |
| Dashboard | **Build** | Specific to our data model and fleet visibility needs |

## Reusable npm Packages

These packages solve specific sub-problems and are worth using directly:

| Package | Purpose | Used By |
|---|---|---|
| `ws` | WebSocket server + client | Hub + Daemon |
| `hono` | HTTP framework | Hub |
| `better-sqlite3` | SQLite driver | Hub |
| `drizzle-orm` | TypeScript ORM | Hub |
| `jira.js` | Jira API client | Hub |
| `@linear/sdk` | Linear API client | Hub |
| `@octokit/rest` | GitHub API client | Hub |
| `yaml` | YAML parsing | Daemon |
| `zod` | Schema validation | Both |
| `pidusage` | Process monitoring | Daemon |
| `cross-keychain` | System keychain access | Daemon |
| `claude-code-parser` | NDJSON stream parser | Daemon (optional) |
| `@anthropic-ai/claude-agent-sdk` | Claude Code SDK | Daemon (optional) |
| `tree-kill` | Process tree termination | Daemon |
| `recharts` | Dashboard charts | Dashboard |
| `@tanstack/react-query` | Data fetching | Dashboard |

## Sources

- [Hookdeck - Reliable Webhook Infrastructure](https://hookdeck.com/)
- [Hookdeck Outpost - Open Source](https://hookdeck.com/outpost)
- [mcp-ticketer - GitHub](https://github.com/bobmatnyc/mcp-ticketer)
- [Cyrus - GitHub](https://github.com/ceedaragents/cyrus)
- [Cyrus: Claude Code as Linear Agent with Hookdeck](https://hookdeck.com/webhooks/platforms/how-to-run-claude-code-as-a-linear-agent-with-cyrus-and-hookdeck-cli)
- [Composio Agent Orchestrator - GitHub](https://github.com/ComposioHQ/agent-orchestrator)
- [Claude Code Agent Teams Documentation](https://code.claude.com/docs/en/agent-teams)
- [Claude Agent SDK - TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [oh-my-claudecode - GitHub](https://github.com/Yeachan-Heo/oh-my-claudecode)
- [Claude Code Agent Farm - GitHub](https://github.com/Dicklesworthstone/claude_code_agent_farm)
- [Ruflo - Agent Orchestration Platform](https://github.com/ruvnet/ruflo)
- [The Code Agent Orchestra - Addy Osmani](https://addyosmani.com/blog/code-agent-orchestra/)
