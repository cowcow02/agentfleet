# Phase Skill Architecture

The driver + launcher + phase skills pattern decomposes a monolithic implementation workflow into focused, manageable pieces. Phases are discovered through the deep dive conversation with the human — they are not selected from a preset menu. This is the reference for generating and working with phase skills.

## Why Phase Skills Beat Monolithic Skills

A monolithic `/implement` skill grows to 300+ lines. By phase 7, the agent has forgotten phase 2's instructions. The phase skill pattern solves this:

| Layer            | Role                                                             | Size              | Varies per codebase? |
| ---------------- | ---------------------------------------------------------------- | ----------------- | -------------------- |
| **Driver**       | State machine loop — read state, dispatch, validate, loop        | ~45 lines         | No (ships static)    |
| **Launcher**     | Create worktree + state file, invoke driver                      | ~80-150 lines     | Yes (generated)      |
| **Phase skills** | Focused work for one phase — inputs, steps, checklist, exit gate | 40-140 lines each | Yes (generated)      |

The agent sees 40-140 lines per phase turn, not 300+ lines for the whole workflow. This is the key reliability improvement.

## The Flow

```
User invokes launcher (/<launcher-name> ISSUE-123)
  → Launcher fetches issue, creates worktree, writes state file
  → Launcher invokes /harness-engine with state file path
    → Driver reads state, finds first pending phase
    → Driver invokes phase skill (e.g., /harness-<phase-name>)
      → Phase skill does focused work, updates state file
    → Driver validates checklist, records completion
    → Driver loops to next phase
    → ... until all phases done
  → Driver announces "WORKFLOW COMPLETE"
```

## State File Schema

The state file is the single source of truth. It lives at `.harness/state.json` in the worktree (or project root if no worktree).

### Solo State File

Used when one agent works one task. Replaces the old `type: "build"` schema.

```json
{
  "version": 1,
  "type": "solo",
  "issue": "<id or null>",
  "issue_title": "<title or task description>",
  "profile": "<profile name>",
  "target_branch": "main",
  "state_file_path": "<absolute path>",
  "created_at": "<ISO timestamp>",
  "updated_at": "<ISO timestamp>",

  "environment": {
    "worktree_path": null,
    "branch": null,
    "dev_server_port": null,
    "dev_server_pid": null,
    "env_file_path": null,
    "conversation_file": null,
    "health_check": null
  },

  "lifecycle": [
    {
      "phase": "<name from deep dive>",
      "skill": "harness-<phase-name>",
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "outputs": {},
      "checklist": {}
    }
  ]
}
```

### Coordinated State File

Used when multiple agents work multiple tasks. Replaces the old `type: "orchestrate"` schema. The `coordination` field specifies the pattern.

```json
{
  "version": 1,
  "type": "coordinated",
  "coordination": "orchestrator",
  "milestone": "<milestone or batch description>",
  "team_name": "<agent team name>",
  "target_branch": "main",
  "integration_branch": "<branch for combining work>",
  "state_file_path": "<absolute path>",
  "created_at": "<ISO timestamp>",
  "updated_at": "<ISO timestamp>",

  "tickets": {
    "<issue-id>": {
      "group": 1,
      "ticket_state": "queued | dispatched | pr_ready | merged",
      "agent_id": null,
      "pr_number": null,
      "blocked_by": [],
      "last_heartbeat": null
    }
  },

  "lifecycle": [
    {
      "phase": "<name from deep dive>",
      "skill": "harness-<phase-name>",
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "outputs": {},
      "checklist": {}
    }
  ]
}
```

The `coordination` field values:

- `"orchestrator"` — one agent dispatches and manages multiple teammate agents
- `"pipeline"` — agents hand off sequentially (agent A output feeds agent B)
- `"peer"` — agents work independently, results merged at the end

### What Changed from the Old Schema

1. `type: "build"` becomes `type: "solo"`. `type: "orchestrate"` becomes `type: "coordinated"`.
2. Added `coordination` field for coordinated workflows.
3. Phase names in `lifecycle[]` are no longer constrained to a preset list — they come from the deep dive.
4. Removed `db_name` from environment block (not all projects have databases — domain-specific, captured by the deep dive as custom environment fields).
5. The engine treats a missing `coordination` field as solo — no special handling needed.
6. Everything else unchanged: version, status values (`pending | in_progress | done | skipped | waiting | blocked`), checklist semantics (`null | true | false | "skipped"`), timestamps, outputs.

### State File Rules

- **Real timestamps only** — run `date -u +%Y-%m-%dT%H:%M:%SZ`, never fabricate.
- **Single writer** — only one agent writes to a state file at a time.
- **Trust if fresh** — if updated within 4 hours, trust it. Otherwise reconstruct from live sources.
- **Lifecycle is ordered** — phases execute top-to-bottom. The driver never reorders.

### Phase Status Values

| Status        | Meaning                                     |
| ------------- | ------------------------------------------- |
| `pending`     | Not yet started                             |
| `in_progress` | Currently executing                         |
| `done`        | Completed successfully                      |
| `skipped`     | Skipped by profile (include `reason` field) |
| `waiting`     | Paused, waiting for external input          |
| `blocked`     | Cannot proceed, dependency unmet            |

### Checklist Validation

Each phase can have a `checklist` object. The driver validates it after the phase skill returns:

| Value       | Meaning               | Driver action             |
| ----------- | --------------------- | ------------------------- |
| `null`      | Not yet evaluated     | Stop — report the gap     |
| `true`      | Passed                | Continue                  |
| `"skipped"` | Intentionally skipped | Continue                  |
| `false`     | Failed                | Stop — report the failure |

## Phase Skill Template

Every generated phase skill follows this structure:

```markdown
---
name: harness-<phase-name>
description: <One-line description of what this phase does>
user-invocable: false
---

# <Phase Name>

## Inputs

Read from the state file:

- [What data this phase needs from previous phases or environment]

## Instructions

[Step-by-step instructions with actual commands for this codebase.
Each step is concrete — no placeholders, no "adapt as needed."
Include escalation rules: when to stop and ask the human.]

## Update State File

After completing work:

- Set `lifecycle[this_phase].status` to `"done"`
- Set `lifecycle[this_phase].outputs` with any data the next phase needs
- Update `lifecycle[this_phase].checklist` items to `true`, `false`, or `"skipped"`
- Update `environment` fields if this phase set up resources
- Set `updated_at` to current timestamp

## Checklist

The driver validates these after this phase returns:

| Item        | What it means       |
| ----------- | ------------------- |
| `item_name` | [What must be true] |

## Exit Gate

[Human-readable description of what must be true before the driver advances.
This is documentation — the checklist is the machine-readable version.]
```

## Launcher Template

The launcher is a user-invocable skill that creates the state file and invokes the driver. Profiles and lifecycle phases come from the deep dive, stored in `.harness/lifecycle.md`.

```markdown
---
name: <project-specific name, e.g., "implement">
description: "Launch agent — creates state file, invokes harness driver for the full task lifecycle."
user-invocable: true
---

# /<launcher-name>

**YOUR ONLY JOB:** fetch the task, create a state file, invoke the driver. Do NOT implement anything yourself.

**Usage:** `/<launcher-name> ISSUE-123` or `/<launcher-name> ISSUE-123 --profile feature`

## Steps

### 1. Fetch task

[PM tool integration OR accept plain text description]

### 2. Determine profile

Read profiles from `.harness/lifecycle.md`. Apply default unless overridden by flag or label.

### 3. Create branch (or worktree)

[Branching strategy for this codebase]

### 4. Write state file

Write `.harness/state.json` with lifecycle array based on the selected profile.
Phases and profiles are defined in `.harness/lifecycle.md` — read them from there, do not hardcode.

### 5. Invoke driver

Invoke `/harness-engine`: "State file: `<path>/.harness/state.json`"

## Session Recovery

If state file exists for this issue:

1. Read `.harness/state.json`
2. Invoke `/harness-engine` — it resumes from current phase.
```

## Skill Naming Convention

All phase skills use `harness-<phase-name>`, dropping the old `-build-` and `-orchestrate-` infixes.

| Skill type       | Naming                 | Examples                                                            |
| ---------------- | ---------------------- | ------------------------------------------------------------------- |
| Phase skills     | `harness-<phase-name>` | `harness-evaluate`, `harness-train`, `harness-ship`                 |
| Framework skills | `harness-<function>`   | `harness-engine`, `harness-setup`, `harness-retro`, `harness-learn` |

The state file `type` field distinguishes workflow types — the skill name alone does not imply solo vs coordinated.

### Backward Compatibility

Existing harnesses in the wild have `harness-build-*` and `harness-orchestrate-*` named skills. These keep working because the engine reads skill names from the state file's `lifecycle[].skill` field — it does not assume any naming convention. On the next `/harness-setup` run, new skills are generated with the new naming convention and old skills are replaced.

## Example Lifecycles

These are illustrations, not prescriptions. Every team's lifecycle is discovered through the deep dive conversation. The phases below show what real lifecycles look like across different domains.

### Web App

**Phases:** pickup → understand → plan → execute → verify → ship

| Profile   | Phases                                               | When to use                       |
| --------- | ---------------------------------------------------- | --------------------------------- |
| `feature` | pickup → understand → plan → execute → verify → ship | Standard feature work             |
| `bugfix`  | pickup → execute → verify → ship                     | Bug with clear reproduction steps |
| `quick`   | execute → verify → ship                              | One-file changes, docs, config    |

### AI App

**Phases:** design-prompt → build-eval → iterate → shadow-deploy → promote

| Profile       | Phases                                                         | When to use                           |
| ------------- | -------------------------------------------------------------- | ------------------------------------- |
| `full`        | design-prompt → build-eval → iterate → shadow-deploy → promote | New capability or major prompt change |
| `prompt-only` | iterate → shadow-deploy → promote                              | Tweaking existing prompts             |
| `guardrail`   | add-rule → test-adversarial → deploy                           | Adding safety rules                   |

### Data Science

**Phases:** hypothesis → explore-data → engineer-features → train → evaluate → deploy

| Profile      | Phases                                                                    | When to use              |
| ------------ | ------------------------------------------------------------------------- | ------------------------ |
| `experiment` | hypothesis → explore-data → engineer-features → train → evaluate → deploy | New model or feature set |
| `retrain`    | train → evaluate → deploy                                                 | Scheduled retraining     |
| `hotfix`     | fix-pipeline → verify → deploy                                            | Pipeline failure         |

### DevOps

**Phases:** plan → apply-staging → verify → apply-prod → monitor

| Profile  | Phases                                               | When to use                    |
| -------- | ---------------------------------------------------- | ------------------------------ |
| `change` | plan → apply-staging → verify → apply-prod → monitor | Standard infrastructure change |
| `hotfix` | apply-staging → verify → apply-prod → monitor        | Urgent production fix          |

### Embedded

**Phases:** understand-spec → implement → cross-compile → bench-test → release

| Profile   | Phases                                                             | When to use               |
| --------- | ------------------------------------------------------------------ | ------------------------- |
| `feature` | understand-spec → implement → cross-compile → bench-test → release | New firmware feature      |
| `patch`   | implement → cross-compile → bench-test → release                   | Small fix with clear spec |

## Profiles

Profiles control which phases are included. Skipped phases get `{ "status": "skipped", "reason": "profile:<name>" }` in the lifecycle.

Profile names and shapes come from the deep dive — they emerge from the human describing their typical vs unusual work. The examples above show common patterns, but every team defines their own.
