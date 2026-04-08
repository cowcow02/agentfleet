# Routing

Routing is the process of matching incoming tickets to the right agents. When a ticket arrives from a tracker, the hub must determine which agents should work on it. This document describes routing rules, tag matching, the dispatch algorithm, and edge cases.

## Overview

The routing flow has four steps:

```
1. Ticket arrives     2. Rules evaluate     3. Registry query     4. Dispatch
+---------------+     +----------------+     +----------------+    +------------+
| NormalizedTicket|-->| Match ticket    |-->| Find agents     |-->| Select best |
| from tracker   |   | against ordered |   | with required   |   | agent, send |
| adapter        |   | routing rules   |   | tags + capacity |   | via WebSocket|
+---------------+     +----------------+     +----------------+    +------------+
```

## Routing Rules

Each project defines an ordered list of routing rules. Rules are evaluated top-to-bottom. The first matching rule determines the required tags.

### Rule Structure

```yaml
routing:
  - match: { <conditions> }
    require_tags: [<tag>, <tag>, ...]
```

Each rule has two parts:
- **match** -- conditions that the ticket must satisfy
- **require_tags** -- tags that candidate agents must have

### Match Conditions

A rule matches when ALL of its conditions are true.

**labels** -- Ticket has at least one of the listed labels.

```yaml
- match: { labels: [backend, api] }
  require_tags: [backend]
```

This matches any ticket that has the label "backend" OR the label "api". It requires agents tagged with "backend".

**priority** -- Ticket priority is one of the listed values.

```yaml
- match: { priority: [low, medium] }
  require_tags: [simple]
```

This matches tickets with priority "low" or "medium".

**assignee** -- Ticket is assigned to a specific person.

```yaml
- match: { assignee: "charlie@acme.com" }
  require_tags: [backend]
```

**type** -- Ticket type (when the tracker supports it).

```yaml
- match: { type: [bug] }
  require_tags: [bug]
```

**default** -- Catch-all rule. Always matches. Should be last in the list.

```yaml
- match: { default: true }
  require_tags: [backend]
```

### Combining Conditions

When a rule has multiple conditions, ALL must be true (AND logic):

```yaml
- match: { labels: [bug], priority: [low, medium] }
  require_tags: [simple]
```

This matches tickets that have the label "bug" AND have priority "low" or "medium".

Within a single condition, values are OR'd. `labels: [bug, hotfix]` means the ticket has "bug" OR "hotfix".

### Rule Evaluation Order

Rules are evaluated in order. The first match wins.

```yaml
routing:
  # Rule 1: urgent bugs get special handling
  - match: { labels: [bug], priority: [urgent, high] }
    require_tags: [backend, urgent]

  # Rule 2: regular bugs
  - match: { labels: [bug] }
    require_tags: [simple]

  # Rule 3: backend work
  - match: { labels: [backend, api, database] }
    require_tags: [backend]

  # Rule 4: frontend work
  - match: { labels: [frontend, ui, css] }
    require_tags: [frontend]

  # Rule 5: catch-all
  - match: { default: true }
    require_tags: [backend]
```

An urgent bug with the "bug" label would match Rule 1, not Rule 2, because Rule 1 is evaluated first and it matches.

### Full Project Configuration Example

```yaml
# Project: Acme Backend
tracker_type: jira
tracker_config:
  instance: https://acme.atlassian.net
  project_key: ACME
  webhook_secret: whsec_xxxxxxxxxxxx

status_map:
  todo: ["To Do", "Selected for Sprint", "Ready for Dev"]
  in_progress: ["In Progress", "In Development"]
  in_review: ["In Review", "Code Review"]
  done: ["Done", "Closed", "Released"]

routing:
  - match: { labels: [security], priority: [urgent, high] }
    require_tags: [backend, security]

  - match: { labels: [backend, api] }
    require_tags: [backend]

  - match: { labels: [frontend, ui] }
    require_tags: [frontend]

  - match: { labels: [bug], priority: [low, medium] }
    require_tags: [simple]

  - match: { labels: [docs, documentation] }
    require_tags: [docs]

  - match: { default: true }
    require_tags: [backend]
```

## Tag Matching

Once routing rules produce a set of required tags, the hub queries the agent registry for matching agents.

### Match Criteria

An agent is a candidate if ALL of the following are true:

1. **Assigned.** The agent is assigned to the project (via an Assignment).
2. **Tag superset.** The agent's tags include ALL required tags.
3. **Available.** The agent's `active_tasks` is less than its `capacity`.
4. **Online.** The agent's status is not `offline` or `paused`.

```
Required tags: [backend, api]

Agent                    Tags                        Assigned?  Available?  Match?
charlie/backend-agent    [backend, api, database]    Yes        Yes         YES
alice/fullstack-agent    [backend, frontend]         Yes        Yes         NO (missing "api")
charlie/quick-fixer      [bug, simple]               Yes        Yes         NO (missing tags)
dave/backend-agent       [backend, api]              No         Yes         NO (not assigned)
charlie/backend-agent    [backend, api, database]    Yes        No          NO (at capacity)
```

### Superset Matching

The agent's tags must be a superset of the required tags. This means agents can have additional tags beyond what is required. An agent with tags `[backend, api, database, python]` satisfies a requirement for `[backend, api]`.

This is intentional: it allows agents to be broadly capable while routing rules can be specific.

## Dispatch Algorithm

When multiple agents match, the dispatcher selects the best one using a priority sequence:

### Priority 1: Assignee Affinity

If the ticket has an assignee and that person has a machine with matching agents, prefer those agents.

```
Ticket KIP-123 is assigned to charlie@acme.com
charlie/backend-agent matches and has capacity
alice/fullstack-agent also matches and has capacity
--> Dispatch to charlie/backend-agent (assignee affinity)
```

Rationale: the ticket was assigned to a specific person, likely because they have context on this area. Their machine's agent should get first priority.

### Priority 2: Assignment Priority

Each Assignment can have a `priority` field. Lower numbers mean higher priority. If the team lead has marked certain agents as preferred for a project, those are selected first.

### Priority 3: Load Balancing

Among equally-prioritized candidates, select the agent with the most remaining capacity (largest gap between `capacity` and `active_tasks`). This distributes work evenly.

```
charlie/backend-agent   capacity: 2, active_tasks: 1  -> remaining: 1
alice/fullstack-agent   capacity: 3, active_tasks: 0  -> remaining: 3
--> Dispatch to alice/fullstack-agent (more remaining capacity)
```

### Priority 4: Round Robin

If remaining capacity is equal, use round-robin based on the last dispatch time. The agent that was dispatched to least recently goes first.

### Complete Algorithm

```
function dispatch(ticket, project):
    required_tags = evaluate_routing_rules(ticket, project.routing)

    candidates = registry.find_agents(
        assigned_to: project,
        tags_superset_of: required_tags,
        status: online,
        available: active_tasks < capacity
    )

    if candidates is empty:
        enqueue(ticket, project, required_tags)
        return

    # Sort candidates by priority
    sort candidates by:
        1. assignee_match(ticket.assignee, agent.teammate) DESC
        2. assignment.priority ASC
        3. (agent.capacity - agent.active_tasks) DESC
        4. agent.last_dispatched_at ASC

    selected = candidates[0]
    send_dispatch(selected, ticket)
    audit_log.record(dispatch, ticket, selected)
```

## Queue Behavior

When no matching agent has available capacity, the ticket is queued.

### Queue Structure

The queue is per-project and ordered by ticket priority, then arrival time:

```
Project Alpha Queue:
  1. KIP-100 (urgent)   requires: [backend]    queued at 09:00
  2. KIP-101 (high)     requires: [backend]    queued at 08:45
  3. KIP-102 (medium)   requires: [frontend]   queued at 08:30
```

### Queue Drain

When an agent completes a task and capacity becomes available, the hub checks the queue for that agent's projects. It finds the highest-priority ticket whose required tags match the now-available agent and dispatches it.

```
charlie/backend-agent completes KIP-099
Hub checks queue for projects assigned to charlie/backend-agent
Finds KIP-100 (urgent, requires [backend]) -> dispatches immediately
```

### Queue Notifications

The dashboard shows queued tickets with:
- How long they have been queued
- What tags are required
- Which agents would match if they had capacity
- Which agents would match if they were online

This helps team leads identify bottlenecks: "We have 5 backend tickets queued but only 2 agents with the backend tag."

## Routing Scenarios

### Scenario 1: Simple Label Match

```
Ticket: KIP-200
  labels: [backend, api]
  priority: medium

Rules:
  - match: { labels: [backend, api] }
    require_tags: [backend]

Result: require_tags = [backend]

Assigned agents with [backend] tag:
  charlie/backend-agent (capacity 2, active 0) -> SELECTED
```

### Scenario 2: Priority Override

```
Ticket: KIP-201
  labels: [bug]
  priority: urgent

Rules:
  - match: { labels: [bug], priority: [urgent, high] }
    require_tags: [backend, urgent]
  - match: { labels: [bug] }
    require_tags: [simple]

Result: matches Rule 1 -> require_tags = [backend, urgent]
(Rule 2 would match too, but Rule 1 is first)
```

### Scenario 3: Assignee Affinity

```
Ticket: KIP-202
  labels: [backend]
  assignee: charlie@acme.com

Required tags: [backend]

Candidates:
  charlie/backend-agent  (backend, api, database)  capacity: 2, active: 1
  alice/fullstack-agent  (backend, frontend)        capacity: 3, active: 0

Despite alice having more capacity, charlie's agent is preferred (assignee affinity).
```

### Scenario 4: Capacity Overflow to Queue

```
Ticket: KIP-203
  labels: [backend]

Required tags: [backend]

Candidates:
  charlie/backend-agent  capacity: 2, active: 2  -> FULL
  alice/fullstack-agent  capacity: 3, active: 3  -> FULL

No agents available -> ticket queued.
When any backend-tagged agent completes a task, KIP-203 dispatches.
```

### Scenario 5: No Matching Rule (Default)

```
Ticket: KIP-204
  labels: [documentation]

Rules:
  - match: { labels: [backend, api] }
    require_tags: [backend]
  - match: { labels: [frontend, ui] }
    require_tags: [frontend]
  - match: { default: true }
    require_tags: [backend]

No label match for Rules 1-2. Default rule matches.
Result: require_tags = [backend]
```

### Scenario 6: No Matching Rule, No Default

```
Ticket: KIP-205
  labels: [documentation]

Rules:
  - match: { labels: [backend, api] }
    require_tags: [backend]
  - match: { labels: [frontend, ui] }
    require_tags: [frontend]

No matching rule. No default.
Result: ticket is logged as unroutable. Dashboard shows alert.
Hub does NOT queue or dispatch. Requires manual intervention (add a routing rule or handle the ticket manually).
```

## Trigger Conditions

Not every ticket event triggers routing. The hub only routes a ticket when specific conditions are met.

### Status-Based Triggers

The hub triggers routing when a ticket transitions into a "ready" status. By default, this is the `todo` status (after normalization). Teams can configure which statuses trigger routing.

```yaml
trigger_on_status:
  - todo              # ticket moved to "To Do" or equivalent
```

This means:
- Creating a ticket in "Backlog" does NOT trigger routing
- Moving a ticket to "To Do" DOES trigger routing
- Moving a ticket back to "In Progress" from "In Review" can optionally re-trigger (for review feedback iteration)

### Label-Based Triggers

Optionally, a project can require a specific label for routing:

```yaml
trigger_on_label: agent-ready
```

Only tickets with the "agent-ready" label will be routed. This gives teams a manual gate: a human reviews the ticket, adds the label when they are confident it is agent-ready, and routing begins.

### Re-Dispatch

If an agent fails (non-zero exit code) or a dispatch times out, the hub can optionally re-dispatch to another agent. Re-dispatch is configurable:

```yaml
retry:
  enabled: true
  max_attempts: 2
  exclude_failed_agent: true   # don't send back to the same agent
```

If all retry attempts fail, the ticket is marked as requiring manual intervention and the dashboard shows an alert.
