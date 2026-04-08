# Harness — AgentFleet Workflow

Every ticket follows a disciplined, phased workflow. Each phase is a focused skill with explicit instructions and an exit gate. A universal engine orchestrates them through a state file.

## Architecture

```
/implement AGE-XX → harness-engine → [pickup] → [understand] → [plan] → [implement] → [quality] → [verify] → [ship] → COMPLETE
```

- `/implement` — the launcher (the skill you invoke)
- 7 phase skills — focused work per phase
- `harness-engine` — universal state machine that loops through phases (ships with Harnessable)

## The Harness Loop

```
/harness-setup (shape) → real work → /harness-retro (reflect) → reshape
```

1. **Shape** — `/harness-setup` scans the codebase and generates phase skills tailored to how you work
2. **Use** — `/implement AGE-XX` drives a ticket through the phases
3. **Reflect** — `/harness-retro` reads recorded conversations, maps friction to skills, suggests improvements
4. **Reshape** — update phase skills based on evidence

## Current Workflow

### 1. Pickup

Fetch the Linear ticket via MCP or parse a plain text description. Load title, description, acceptance criteria, labels, priority into the state file.

### 2. Understand

Explore the codebase to understand what needs to change. Identify affected files, existing patterns, dependencies, and scope.

### 3. Plan

Create an implementation plan with a TDD test strategy. Map every acceptance criterion to at least one test. On `full` profile, human reviews the plan before proceeding.

### 4. Implement (TDD)

Write tests first, then implementation. Follow the TDD cycle: red → green → refactor. If schema changes are needed, generate Drizzle migrations. Follow existing code patterns.

**Key commands:**

- `pnpm --filter <package> vitest run <test-file>` — run specific tests
- `pnpm --filter @agentfleet/db drizzle-kit generate` — generate migration

### 5. Quality

Run all static and dynamic quality checks. Fix issues before proceeding.

**Key commands:**

- `pnpm turbo typecheck` — type checking
- `pnpm turbo test` — full test suite
- `pnpm --filter web lint` — ESLint for web
- `pnpm prettier --check "apps/**/*.{ts,tsx}" "packages/**/*.ts"` — formatting

### 6. Verify

Start the app and prove the deliverable works. Use Claude in Chrome for UI verification, HTTP calls for API verification. Capture evidence (screenshots, API responses).

**Key commands:**

- `docker compose up -d` — start Postgres
- `pnpm --filter @agentfleet/db drizzle-kit migrate` — run migrations
- `pnpm --filter @agentfleet/api dev` — API on port 9900
- `pnpm --filter web dev` — Web on port 3000
- `pnpm turbo build` — production build check

### 7. Ship

Commit, push, and create a PR on GitHub with ticket reference, summary, and evidence from the verify phase.

**Key commands:**

- `git push -u origin <branch>`
- `gh pr create`

### 8. Review (Human Gate)

Human reviews the PR, CI passes, human merges and deploys.

## Profiles

| Profile    | Phases                                       | When to use                         |
| ---------- | -------------------------------------------- | ----------------------------------- |
| `full`     | All phases, plan has human gate              | Large/risky tickets                 |
| `standard` | All phases, plan auto-approved               | Default for most tickets            |
| `quick`    | pickup → implement → quality → verify → ship | Trivial changes, typos, small fixes |

## Generated Skills

| Skill                | Purpose                                               | User-invocable |
| -------------------- | ----------------------------------------------------- | -------------- |
| `/implement`         | Launcher — pick up ticket and start the workflow      | Yes            |
| `harness-pickup`     | Fetch ticket context from Linear                      | No             |
| `harness-understand` | Explore codebase and identify scope                   | No             |
| `harness-plan`       | Create implementation plan with TDD strategy          | No             |
| `harness-implement`  | TDD implementation — tests first                      | No             |
| `harness-quality`    | Run typecheck, tests, lint, format                    | No             |
| `harness-verify`     | Start app, verify deliverable with browser/API checks | No             |
| `harness-ship`       | Commit, push, create PR                               | No             |

## Core Principles

1. **Verify by proof** — run the system and capture output, don't just read code
2. **Record at phase transitions** — progress survives session drops
3. **Fail fast** — stuck after 2 attempts? Surface it, don't spiral
4. **Improve through evidence** — `/harness-retro` reads conversations and reshapes skills

## Harness Data

```
.harness/
├── lifecycle.md          # workflow definition (overwritten each setup)
├── conversations/        # per-implementation records (committed)
└── retros/               # past retro results (committed)
```

Conversations and retros are committed to the repo — `/harness-retro` reads them to improve the workflow over time.

## Reshaping

Run `/harness-retro` after a few rounds of work to review friction and improve skills. Re-run `/harness-setup` when the codebase or workflow changes significantly.
