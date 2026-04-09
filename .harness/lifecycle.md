# AgentFleet — Workflow Lifecycle

Work unit: Linear ticket (AGE-XX)
Typical size: 30min – 2hrs

## Lifecycle

### 1. Pickup

- Owner: agent
- Trigger: user invokes launcher with a ticket identifier (AGE-XX) or plain text description
- Artifact: ticket context loaded (title, description, acceptance criteria, labels)
- Verification: ticket exists and is readable
- Destination: state file
- Constraints: must be a valid Linear ticket or text description
- Gate: ticket context captured in state

### 2. Understand

- Owner: agent
- Trigger: pickup complete
- Artifact: summary of what needs to change — affected files, relevant code paths, dependencies
- Verification: summary references actual files that exist in the repo
- Destination: state file outputs
- Constraints: read-only exploration, no code changes
- Gate: clear understanding of scope documented

### 3. Plan

- Owner: agent (human gate on full profile)
- Trigger: understand complete
- Artifact: implementation plan — approach, files to create/modify, test strategy
- Verification: plan addresses all acceptance criteria from ticket
- Destination: state file outputs
- Constraints: must include test strategy (TDD)
- Gate: plan documented; on full profile, human approves before continuing

### 4. Implement (TDD)

- Owner: agent
- Trigger: plan approved (or auto-approved on lighter profiles)
- Artifact: tests + implementation code
- Verification: tests written first, then implementation makes them pass
- Destination: working tree (feature branch)
- Constraints: TDD — write failing tests, then make them pass. Follow existing code patterns.
- Gate: all new tests pass

### 5. Quality Check

- Owner: agent
- Trigger: implementation complete
- Artifact: clean quality report
- Verification: run all checks:
  - `pnpm turbo typecheck` (type checking)
  - `pnpm turbo test` (full test suite)
  - `pnpm --filter web lint` (ESLint for web)
  - `prettier --check` (formatting, once configured)
- Destination: state file with pass/fail results
- Constraints: all checks must pass; fix issues before proceeding
- Gate: zero errors across all checks

### 6. Verify (Deliverable Verification)

- Owner: agent
- Trigger: quality check passes
- Artifact: evidence that the change works — screenshots, API response captures, build output
- Verification: actually run the system and prove the deliverable works:
  - Start Postgres via `docker compose up -d`
  - Run DB migrations via `pnpm --filter @agentfleet/db migrate`
  - Start API server (`pnpm --filter @agentfleet/api dev`)
  - Start web server (`pnpm --filter web dev`)
  - For UI changes: use Claude in Chrome (MCP browser tools) to navigate, take screenshots, verify rendered output
  - For API changes: make actual HTTP requests against localhost:9900 and validate responses
  - For both: confirm behavior matches ticket acceptance criteria
  - `pnpm turbo build` — confirms production build succeeds
  - Shut down dev servers and docker after verification
- Destination: state file with evidence (screenshots, response captures)
- Constraints: must verify by proof — run the system and capture output, don't just read code
- Gate: deliverable proven working + build succeeds

### 7. Ship (PR Creation, pre-merge)

- Owner: agent
- Trigger: local verification passes
- Artifact: GitHub pull request with green CI
- Verification: PR created with proper title, description referencing ticket, `gh pr checks --watch` returns success
- Destination: GitHub
- Constraints: branch naming convention (e.g., `age-XX-short-description`), PR description includes ticket link and summary of changes; conversation file `.harness/conversations/<task-id>.md` MUST be staged in the initial commit; ship-phase conversation update committed in a follow-up commit
- Gate: PR URL + PR number captured in state, CI green, Linear → "In Review"

### 8. Review

- Owner: human
- Trigger: ship complete
- Artifact: approval ("approved, go merge it") or change requests
- Verification: human reviews code on GitHub
- Destination: GitHub PR
- Constraints: human decides whether to approve; agent does NOT merge until human says so
- Gate: review phase status flipped from `waiting` → `done` by human signal

### 9. Cleanup (post-merge)

- Owner: agent
- Trigger: review phase done
- Artifact: merged PR + verified production deploy + clean local state
- Verification:
  - `gh pr merge --squash --delete-branch` succeeds
  - Railway API + Web healthchecks return 200 within 5-min timeout
  - Linear ticket moved to `Done`
  - Conversation file `## Cleanup` section committed to master
  - Worktree removed (`git worktree remove`, NEVER `--force`)
- Constraints: hard safety check before worktree removal — `git status --porcelain` must be empty
- Gate: workflow complete

## Agent-owned phases (become phase skills)

- pickup
- understand
- plan
- implement
- quality
- verify
- ship
- cleanup

## Human-owned gates (become status: "waiting")

- plan review (full profile only)
- PR review / merge approval (always — between ship and cleanup)

## Automated steps (become checklist items)

- CI pipeline (GitHub Actions — runs automatically on PR)

## Profiles

- `full`: pickup → understand → plan (human gate) → implement → quality → verify → ship → review (human gate) → cleanup
- `standard`: pickup → understand → plan (auto) → implement → quality → verify → ship → review (human gate) → cleanup
- `quick`: pickup → implement → quality → verify → ship → review (human gate) → cleanup

## Friction-to-concept matches

- No formatting enforcement → add Prettier config + format step in quality phase
- No DB migration workflow → add drizzle-kit generate/migrate to implement phase when schema changes
- No local Postgres → add docker-compose.yml for dev environment
- No branching convention → enforce branch naming in ship phase
- README outdated → not a harness concern, separate ticket
- Daemon/CLI plain JS → not a harness concern, separate tickets (AGE-15, AGE-20)
