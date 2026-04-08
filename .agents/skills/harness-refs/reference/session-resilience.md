# Session Resilience

Patterns for surviving session drops, context loss, and agent handoffs.

## The Problem

Agent sessions die without warning — context window limits, network issues, user restarts. If progress exists only in the agent's memory, it's lost. The solution: externalize everything to files.

## Conversation Files

The primary persistence mechanism. A markdown file that tracks the full lifecycle of an implementation task.

### Format

```markdown
---
date: YYYY-MM-DD
topic: ISSUE-XX: Brief description
status: active | concluded
type: implementation
issue_id: ISSUE-XX
phase: <current phase name from lifecycle>
---

## Summary

[What this task is about]

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Key Decisions

[Design decisions made during implementation]

## Phase Progress

### Phase: Pickup (HH:MM)

[What was learned from the issue]

### Phase: Understand (HH:MM)

[Files identified, patterns discovered]

### Phase: Environment (HH:MM)

[Worktree path, port, DB name]

...

## Discoveries

[Non-obvious findings about the codebase]

## Harness Issues

[Problems with skill instructions — not product bugs]

## Verification Evidence

[Captured outputs proving AC]

## Metrics

- total_phases_completed: N
- phase_durations: {...}
- review_rounds: N
- token_usage: {...}
```

### Rules

- **Create**: After environment setup (the worktree must exist first)
- **Update**: After every phase transition — this is mandatory, not optional
- **Location**: Inside the worktree, in the project's docs or conversation directory
- **Commit**: Include in the PR so the record persists in git history

### Naming

```
YYYY-MM-DD-NNN-<issue-id>-<description>.md
```

## State Files

For multi-agent coordination (orchestrator pattern). A JSON file tracking all active tickets, their states, and agent assignments.

### Properties

- **Location**: Project root, gitignored (local-only)
- **Writer**: Single-writer (the orchestrator)
- **Freshness**: Trust if updated within 4 hours; otherwise reconstruct from live sources

### What to Track

```json
{
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp",
  "wave_branch": "wave/milestone-w1",
  "wave_state": "implementing",
  "tickets": { ... }
}
```

## Session Recovery Protocol

When resuming work after a session drop:

### Single Issue

1. Find the conversation file for the issue
2. Read the current phase and progress
3. Announce: "Resuming ISSUE-XX. Current phase: [phase]. [Brief context.]"
4. Pick up from the current phase — don't restart

### Orchestration

1. Read the state file
2. Validate against live sources:
   - Check wave branch and open PRs
   - Check worktree existence
   - Check PM tool for issue statuses
3. Reconcile any discrepancies
4. Resume from the current wave state

### Recovery Heuristics

When the state file is stale or missing, reconstruct from evidence:

| Evidence                     | Inferred State      |
| ---------------------------- | ------------------- |
| PR merged to wave branch     | `merged_to_wave`    |
| Open PR with review comments | `changes_requested` |
| Open PR, no comments         | `pr_ready`          |
| Worktree exists, no PR       | `dispatched`        |
| No worktree, no PR           | `queued`            |
| Wave PR merged to main       | `merged_to_main`    |

## Heartbeat as Resilience

In multi-agent setups, heartbeats serve dual purposes:

1. **Progress tracking**: The orchestrator knows what's happening
2. **Recovery anchor**: If a teammate dies, the last heartbeat indicates where to resume

## What NOT to Persist

- Transient debugging state (stack traces, temporary logs)
- Full file contents (reference by path instead)
- Credentials or secrets
- Large binary outputs (reference by path or summarize)
