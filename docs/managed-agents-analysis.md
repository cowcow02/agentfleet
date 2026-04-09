# Claude Managed Agents — Analysis & Adoption Strategy

**Date:** 2026-04-09
**Context:** Anthropic launched Claude Managed Agents (public beta, April 8 2026) — a cloud-hosted API for running Claude agents autonomously in isolated containers. This document analyzes what it offers, what we can learn from it, and how it affects AgentFleet's positioning.

## What Managed Agents Is

A cloud-hosted API for running Claude agents. Instead of running Claude Code on a developer's machine, you create an agent definition via API, spin up a session in Anthropic's cloud container, and it runs with its own filesystem, tools, and network access.

### Core Concepts

- **Agent** — versioned definition (model + system prompt + tools + MCP servers + callable agents). Each update creates a new immutable version. Sessions can pin to a specific version.
- **Environment** — container template (packages, networking rules). Ubuntu 22.04, up to 8GB RAM, 10GB disk. Pre-installed languages: Python, Node.js, Go, Rust, Java, Ruby, PHP, C/C++.
- **Session** — running agent instance. Event-driven, persists through disconnections, can run for hours. Has its own isolated container and filesystem.
- **Events** — bidirectional communication. You send `user.*` events, receive `agent.*`, `session.*`, and `span.*` events via SSE stream.

### Key Technical Details

**Session state machine:** `idle → running → idle` (or `rescheduling` on transient error, `terminated` on unrecoverable error)

**Stop reasons:** When idle, `end_turn` (finished naturally) or `requires_action` (blocked waiting for human input, with `event_ids` listing what's needed)

**Built-in tools:** bash, read, write, edit, glob, grep, web_fetch, web_search — same as Claude Code but running in cloud

**Multi-agent (research preview):** Coordinator agent declares callable agents. All share filesystem, isolated conversation contexts. Single-level delegation only. Persistent threads for multi-turn sub-agent conversations.

**Billing:** API token pricing + compute time. NOT covered by Claude Code subscriptions (Pro/Max/Team).

**No scheduling, no triggers, no webhooks, no team management, no tracker integration.**

---

## AgentFleet vs Managed Agents

### What Managed Agents replaces (execution layer)

| Capability         | Our current approach            | Managed Agents                           |
| ------------------ | ------------------------------- | ---------------------------------------- |
| Agent runtime      | Local daemon spawns Claude Code | Cloud container with built-in agent loop |
| Session durability | Dies with process               | Survives disconnections                  |
| Observability      | JSONL tailing + OTLP (planned)  | Events API with full replay              |
| Multi-agent        | Experimental agent teams        | Native coordinator/delegate              |
| Idle detection     | CPU polling (unreliable)        | Session status state machine             |

### What Managed Agents does NOT cover (our value)

| Capability                       | AgentFleet ticket                        |
| -------------------------------- | ---------------------------------------- |
| Ticket-to-dispatch orchestration | AGE-13 (workflow engine)                 |
| Project management layer         | AGE-5 (projects), AGE-9 (project config) |
| Team performance analytics       | AGE-7 (per-member metrics)               |
| Linear/Jira integration          | AGE-12 (Jira), existing Linear           |
| Member identity mapping          | AGE-17                                   |
| Non-Claude agent support         | AGE-19                                   |
| CLI distribution                 | AGE-15                                   |
| Cost model (subscription-based)  | Daemon uses existing Claude Code seats   |

---

## Design Principles to Adopt

### 1. Structured Event Taxonomy

Managed Agents uses a `{domain}.{action}` naming convention for all events. Every event has a unique ID and `processed_at` timestamp. Events are replayable and deduplicated.

**Adopt:** Replace our ad hoc WebSocket messages (`register`, `heartbeat`, `status`, `complete`) and SSE events (`agent:update`, `dispatch:update`, `feed:event`) with a structured taxonomy:

```
dispatch.created, dispatch.running, dispatch.completed, dispatch.failed
agent.connected, agent.disconnected, agent.busy, agent.idle
telemetry.tool_use, telemetry.model_request, telemetry.tokens
feed.event
```

Every event gets a unique ID. Store durably for replay.

### 2. Agent Versioning

Managed Agents versions every agent definition. Sessions pin to specific versions.

**Adopt:** Store agent definitions in the hub (not just local `agents.yaml`). Version on every change. Let dispatches reference a specific agent version. Enables rollback and A/B testing.

### 3. Enriched Session/Dispatch State Machine

Managed Agents has `idle → running → rescheduling → terminated` with explicit stop reasons.

**Adopt:** Enrich our dispatch status beyond `dispatched/running/completed/failed`:

- Add `rescheduling` for transient failures with auto-retry
- Add stop reasons: `end_turn`, `requires_action`, `error`
- Track `active_seconds` vs `duration_seconds` (work time vs wall clock)

### 4. Token/Cost Tracking Per Dispatch

Managed Agents tracks cumulative `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` per session.

**Adopt:** Add a `usage` object to dispatches. Populated from OTLP `span.model_request_end` events or JSONL transcript `usage` fields. This directly feeds AGE-7 (team analytics).

### 5. Permission-Based Confirmation Flow

Managed Agents supports `always_allow` and `always_ask` per tool. When `always_ask`, the session pauses and waits for human confirmation.

**Adopt in workflow engine (AGE-13):** Workflow rules can specify "require manager approval" for certain trigger conditions. The dispatch pauses, the dashboard shows a confirmation prompt, the manager approves, and the dispatch resumes.

---

## Telemetry Design: Intrusiveness vs Usefulness

AgentFleet is an **observer**, not the agent runtime. We see the agent through OTLP and JSONL, not by controlling the execution loop. This creates a design tension: how much of the agent's internal state should we surface?

### Recommended exposure levels

| Level                           | What we expose                                           | Default             | Use case                                   |
| ------------------------------- | -------------------------------------------------------- | ------------------- | ------------------------------------------ |
| **1. Dispatch lifecycle**       | Status, duration, exit code                              | Always on           | Basic tracking                             |
| **2. Structured metrics**       | Tokens, cost, tool call counts, files changed (via OTLP) | Always on           | Manager analytics, team performance        |
| **3. Activity stream**          | "Editing file X", "Running tests" (via JSONL)            | Always on           | Real-time dashboard "what is it doing now" |
| **4. Full conversation replay** | Every message, thinking block, tool I/O                  | Opt-in per dispatch | Debugging failed dispatches                |

Levels 1-3 are the default experience. Level 4 is a "debug mode" toggle for when things go wrong. The manager persona cares about metrics and activity, not every thinking block.

---

## Future Considerations

### 1. Managed Agents as an Optional Execution Backend

Design the hub's dispatch interface to be backend-agnostic:

- Today: hub sends WebSocket `dispatch` message → local daemon spawns Claude Code
- Future: hub calls `POST /v1/sessions` → Managed Agents runs in cloud

Same workflow engine, same analytics, different execution layer. The abstraction point is the dispatch interface — not the entire hub.

**When this makes sense:** Fully autonomous workloads with no human-in-the-loop, or teams that need cloud durability and don't have Claude Code seats. API billing is the blocker for teams already paying for subscriptions.

### 2. GitHub Repo Mounting

Managed Agents mounts repos at session creation with a specific branch/commit. If we support it as a backend, dispatch payloads should include repo + branch info so the session starts with the right code.

### 3. Centralized Credential Store

Their Vault pattern (OAuth credentials with auto-refresh, referenced by ID at session creation) is worth watching. As teams scale to many daemons, managing secrets locally becomes painful. A hub-level encrypted secrets store that injects credentials at dispatch time would be cleaner. Not v1 priority.

### 4. Outcomes / Self-Evaluation

The `user.define_outcome` → `session.outcome_evaluated` pattern lets the agent self-evaluate whether it achieved the goal. If this matures, we could use it to auto-transition Linear tickets when the agent confirms success — solving the dispatch feedback loop.

### 5. Skills System Mapping

Managed Agents supports up to 20 skills per session (built-in document processing + custom). If we support it as a backend, our local harnessable skills would need to map to their skills API format.

### 6. Competitive Risk

Anthropic's incentive is selling API tokens, not building PM tooling or team analytics. They deliberately left out scheduling, triggers, team management, and tracker integration. That's our lane. The risk is if they expand — but the absence of these features in a v1 launch suggests it's intentional.

---

## Adoption Roadmap

| What to adopt                        | Priority          | Ticket impact                                 |
| ------------------------------------ | ----------------- | --------------------------------------------- |
| Structured event taxonomy            | High              | New ticket — redesign WS/SSE message protocol |
| Token/cost tracking per dispatch     | High              | Enrich AGE-10 (OTLP receiver)                 |
| Enriched dispatch state machine      | Medium            | Update dispatch schema in AGE-5 or standalone |
| Agent versioning in hub              | Medium            | New ticket                                    |
| Permission confirmation in workflows | Medium            | Fits in AGE-13 (workflow engine)              |
| Backend-agnostic dispatch interface  | Low (design only) | Architecture note for AGE-13                  |
| Managed Agents as execution backend  | Future            | New ticket when pricing/access improves       |
