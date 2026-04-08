---
name: harness-setup
description: Discover your team's development lifecycle through a deep dive conversation, then generate a phased workflow tailored to how you actually work.
user-invocable: true
safety: read-heavy
---

**Safety:** This skill is primarily read-only during setup. It scans your codebase (read), asks you questions, then generates new skill files and a `.harness/` directory — all with your approval before each write. It does not modify your existing code, delete files, run builds, or start services. Every file write is presented for approval first.

When invoked, print this banner before doing anything else:

```
██╗  ██╗ █████╗ ██████╗ ███╗   ██╗███████╗███████╗███████╗
██║  ██║██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝
███████║███████║██████╔╝██╔██╗ ██║█████╗  ███████╗███████╗
██╔══██║██╔══██║██╔══██╗██║╚██╗██║██╔══╝  ╚════██║╚════██║
██║  ██║██║  ██║██║  ██║██║ ╚████║███████╗███████║███████║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝
```

Then, before anything else, **read the existing agent-facing config** if one exists — `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `GEMINI.md`, or similar. This gives you a head start on project context, team conventions, tech stack, and workflow preferences. Use what you learn to score coverage against the seven dimensions (see Phase 0) and determine which deep dive questions to skip.

Then output the intro and **in the same message**, use the Agent tool with `run_in_background: true` to dispatch the scan (Phase 1). Do NOT wait for the scan to return. Immediately start the deep dive (Phase 2) in the same response.

<CRITICAL>
You MUST use `Agent` with `run_in_background: true` for the scan. Do NOT use the Explore agent type in the foreground. Do NOT wait for scan results before asking questions. The scan and deep dive happen simultaneously — the user should see your first question within seconds, not after a multi-minute scan.
</CRITICAL>

Output this intro, then ask your first deep dive question right after it:

> **What is this?** Harnessable gives AI agents a disciplined, phased workflow for shipping software. Instead of one big prompt, every task follows focused phases — each with explicit instructions and an exit gate. A universal engine orchestrates them through a state file.
>
> ```
> Launcher → Engine → [phase 1] → [phase 2] → ... → [phase N] → COMPLETE
> ```
>
> I'm scanning your codebase in the background. Let me learn about how you work while that runs.

---

## Phase 0: Read Existing Config

Read `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `GEMINI.md` — whatever exists. Score coverage against seven dimensions to determine which deep dive questions are needed:

| Dimension               | Status          |
| ----------------------- | --------------- |
| Tech stack              | known / unknown |
| Commands                | known / unknown |
| Lifecycle steps         | known / unknown |
| Ownership boundaries    | known / unknown |
| Verification strategies | known / unknown |
| Conventions/constraints | known / unknown |
| Gates/handoffs          | known / unknown |

The question count maps to how many dimensions are unknown:

| Unknown dimensions              | Questions needed      |
| ------------------------------- | --------------------- |
| 5-7 (no config)                 | 6                     |
| 3-4 (tech stack known)          | 4-5                   |
| 1-2 (lifecycle partially known) | 3-4                   |
| 0 (fully documented)            | 3 (verification only) |

Minimum is always 3 (narrative, ownership, failure points) because even fully documented workflows have implicit knowledge.

---

## Phase 1: Scan the Codebase (background agent)

Use `Agent` tool with `run_in_background: true` to dispatch a scan agent. You will be notified when it completes. Do NOT poll or wait for it.

The scan validates and enriches the deep dive — it does NOT drive phase selection. Phases come from the human's description of their workflow.

The scan agent should explore:

**Build & Test Tooling:** package.json (npm/yarn/pnpm), Cargo.toml, go.mod, pyproject.toml, Gemfile. Build system (turbo.json, nx.json, Makefile). Test framework (vitest/jest, pytest, go test, rspec). Linter & formatter (eslint, prettier, ruff, golangci-lint). Type checker (tsconfig.json, mypy, pyright). Monorepo structure (workspace config, package directories).

**CI/CD & Deploy:** CI config (.github/workflows/, .circleci/, .gitlab-ci.yml). Deploy config (vercel.json, railway.toml, Dockerfile). Preview environments.

**Project Management:** PM tool config (.linear/, jira config, GitHub project references). Issue references in commit messages (KIP-XX, PROJ-XX, #123). Branching model from git log.

**Database & Services:** Database (PostgreSQL, MySQL, SQLite, MongoDB — migration tools, seed data). External services (APIs, message queues, caches). Dev environment (docker-compose, devcontainers, local setup scripts).

**Repository Structure:** README and docs. Existing workflow docs (CONTRIBUTING.md, ADRs). Code organization (src layout, test location conventions).

**Installed Skills:** Use `ls` or Glob to explicitly list directories inside `.claude/skills/`, `.cursor/skills/`, and `.agents/` in the project root. For each directory found that is NOT a `harness-*` skill, read its `SKILL.md` frontmatter (name, description). Only report skills that have an actual `SKILL.md` file on disk. Do NOT use your loaded skill context or system-level skills — only what exists in the project's skill directories. If no non-harness skills are found, report "none found".

The agent should return a structured summary of everything found — including the list of installed skills with their names and descriptions — and what remains unclear.

---

## Phase 2: Deep Dive (in parallel with scan)

This is the core of setup. Start the deep dive immediately — don't wait for the scan to complete. Use AskUserQuestion (or the platform's equivalent) for each question.

The six first principles serve as a **listening framework** — use them to parse the human's narrative and identify gaps. They are NOT a questionnaire. The human never hears "what's the trigger for this step?"

- **Trigger** — something causes work to begin
- **Artifact** — each step produces something that didn't exist before
- **Verification** — artifacts must be proven correct through the running system
- **Destination** — artifacts must reach where they have effect
- **Ownership** — each step has an owner (human, agent, or automated)
- **Constraints** — each step has rules (explicit or implicit)

### Question 1 — The Narrative (always asked)

> "Walk me through the last thing your team shipped — from the moment it started to the moment it was done. Include the boring parts."

If existing config describes conventions but not lifecycle:

> "Your config describes [tech stack / conventions]. But I don't know your workflow yet. Walk me through the last thing your team shipped — from the moment it started to the moment it was done."

Listen for all six principles. Extract steps. Most principles (Trigger, Artifact, Verification, Destination, Ownership) surface from this single narrative answer.

### Question 2 — Ownership Map (always asked)

Present the extracted lifecycle back to the human:

> "Here's what I heard:
>
> 1. [step] → [step] → [step] → ... → [step]
>
> For each step, who should own it — you, the agent, or automated?"

This defines which steps become phase skills (agent), gates (human), or checklist items (automated).

### Question 3 — Failure Points (always asked)

> "Where do things typically break or get stuck?"

Surfaces verification gaps, pain points, and friction that the concept library can address.

### Question 4 — Gates (skip if Q2 already made gates clear)

> "Where do you need to approve before the agent continues?"

### Question 5 — Conventions (skip if existing config covers constraints)

> "For the steps the agent will own — what would a new engineer get wrong?"

### Question 6 — Scan Enrichment (after scan returns)

> "I found [tools/configs] in your repo. Here's how that maps to what you described:
>
> - [step X]: I'll use `[exact command]` for this
> - [step Y]: I found [tool] but you didn't mention it — include it?
> - [step Z]: You mentioned [thing] but I couldn't find it — where is it?"

**Environment isolation probe:** If the scan detected Docker Compose, a database, or a dev server, AND the user didn't already describe isolation, ask:

> "I found [Docker Compose / PostgreSQL / dev server] in your repo. When you have multiple features in flight — do they share the same database and ports, or does each get its own? And how do you clean up when a feature is done?"

This surfaces whether to generate environment setup and cleanup phases with isolation (worktrees, per-feature DBs, dynamic ports) or keep it simple (shared environment). Don't assume isolation is needed — many solo developers share one database and that's fine.

---

<HARD-GATE>
Do NOT start Phase 3 until BOTH the background scan agent has returned AND you have the deep dive answers. If the scan is still running when the user finishes answering, tell the user "Waiting for the codebase scan to finish..." and wait. You will be automatically notified when it completes — do NOT poll, do NOT start a duplicate scan, do NOT use SendMessage to check on it. Just wait. If the user is still answering when the scan finishes, finish asking.
</HARD-GATE>

---

## Phase 3: Synthesize Lifecycle Document

Write to `.harness/lifecycle.md` for session resilience. If the session drops between synthesis and skill generation, the lifecycle document survives and can be read on resume. This file is overwritten on each `/harness-setup` run.

Produce from deep dive + scan:

```
Work unit: [description]
Typical size: [timeframe]

Lifecycle:
  1. [Step name in their words]
     Owner: human | agent | automated
     Trigger: [what starts this step]
     Artifact: [what it produces]
     Verification: [how correctness is checked]
     Destination: [where output goes]
     Constraints: [rules]
     Gate: [what must be true to proceed]
  2. ...

Agent-owned phases (become phase skills):
  - [list]

Human-owned gates (become status: "waiting"):
  - [list]

Automated steps (become checklist items):
  - [list]

Profiles:
  [default]: all phases
  [lighter]: skip [phases] — for [simpler work]
  [lightest]: only [phases] — for [trivial changes]

Friction-to-concept matches:
  [pain point] → [concept]
```

---

## Phase 4: Present & Confirm

Show the lifecycle to the human for approval:

> **Your workflow:**
>
> | Phase  | Owner | Produces   | Verified by | Gate          |
> | ------ | ----- | ---------- | ----------- | ------------- |
> | [name] | Agent | [artifact] | [method]    | [condition]   |
> | [name] | You   | [decision] | —           | Your approval |
>
> **Profiles:**
>
> - `[name]`: [phases] — for [when]
>
> **Concepts I'd recommend based on your pain points:**
>
> - [concept]: [one sentence]
>
> **Launcher name:** What should I call it? (default: `/implement`)
>
> Does this look right?

Human can adjust phases, ownership, names, concepts.

### Human-Owned Gates

When the engine encounters a phase with `status: "waiting"`, it announces what it's waiting for and stops. The human resolves the gate by re-invoking the launcher:

1. Human re-invokes `/<launcher>` (or resumes the session)
2. Launcher reads state file, finds the `waiting` phase
3. Launcher presents: "Phase [name] is waiting for your approval. [context from outputs]. Approve?"
4. Human approves → launcher sets status to `done`, engine continues to next phase
5. Human rejects → launcher sets status to `blocked` with reason, engine stops

---

## Phase 5: Write Harness Context

Synthesize findings into a `## Harness Context` section. Write to the AI config file:

- **Claude Code**: `CLAUDE.md`
- **Cursor**: `.cursorrules`
- **Gemini CLI**: `GEMINI.md`

```markdown
## Harness Context

### Repository

[from scan]

### Workflow Lifecycle

[lifecycle document in human-readable form]

### Verification

[per-phase verification strategies, enriched with exact commands from scan]

### Conventions

[constraints from deep dive, enriched with scan findings]

### Team & Process

[ownership map, gates, autonomy level]

### CI/CD

[from scan]

### Project Management

[from scan + deep dive if PM tool discussed]
```

---

## Phase 6: Initialize .harness/

Create the `.harness/` directory in the project root:

```
.harness/
├── lifecycle.md          # written in Phase 3, overwritten each setup run
├── conversations/        # per-implementation records (phase progress, decisions, evidence)
└── retros/               # past retro results
```

Conversations and retros should be committed to the repo — `/harness-retro` reads them to identify cross-round patterns and improve the workflow over time. Do NOT add `.harness/` to `.gitignore`.

Note: `lifecycle.md` is already present from Phase 3. The `.harness/` directory may have been created then — ensure `conversations/` and `retros/` subdirectories exist.

---

## Phase 7: Generate Skills

Based on the lifecycle document, generate the skill architecture:

### One Launcher (user-invocable)

Named by the user (default: `/implement`). The launcher:

1. Fetches the task — from the detected PM tool or accepts a plain text description
2. Determines profile — from `--profile` flag, default, or task labels
3. Creates branch (or worktree if Environment Isolation is adopted)
4. Writes `.harness/state.json` with the lifecycle array — phases and statuses based on profile. Skipped phases get `{ "status": "skipped", "reason": "profile:<name>" }`
5. Invokes `/harness-engine` with the state file path
6. Session recovery — if state file already exists for this task, invoke engine directly (it resumes from current phase)

### One Phase Skill per Agent-Owned Step

Named `harness-<phase-name>` (using the phase names from the deep dive, NOT a preset list). Each phase skill contains:

- **Artifact** — what it must produce (from the Artifact principle)
- **Verification** — how correctness is checked (from the Verification principle)
- **Constraints** — rules to follow (from the Constraints principle)
- **Checklist** — machine-readable items derived from gate conditions. Every item starts as `null` and must be set to `true`, `false`, or `"skipped"`
- **Escalation rules** — when to stop and ask the human (ambiguous requirements, architecture decisions, stuck after 2 attempts)
- **Conversation file recording** — write progress to `.harness/conversations/` at each phase transition

### Profile Examples Across Domains

Profile names and shapes come from the deep dive (work unit variance), not from a fixed matrix. Here are examples to illustrate:

**Web team:**

- `feature`: pickup → understand → plan → execute → verify → ship
- `bugfix`: pickup → execute → verify → ship
- `quick`: execute → verify → ship

**AI app team:**

- `full`: design-prompt → build-eval → iterate → shadow → promote
- `prompt-only`: iterate → shadow → promote
- `guardrail`: add-rule → test-adversarial → deploy

**Data team:**

- `experiment`: hypothesis → explore → engineer → train → evaluate → deploy
- `retrain`: train → evaluate → deploy
- `hotfix`: fix-pipeline → verify → deploy

**DevOps team:**

- `change`: plan → apply-staging → verify → apply-prod → monitor
- `hotfix`: apply-staging → verify → apply-prod → monitor

### Coordinated Workflows

If the deep dive reveals coordination needs (human described parallel work or multi-agent scenarios), generate:

- A coordination launcher (separate from the solo launcher)
- Phase skills for the coordination lifecycle (phases come from the deep dive, NOT a preset list)
- A coordinated state file with the `tickets` block and `coordination` field

If no coordination is needed, skip entirely — teams adopt coordination later via `/harness-retro` when friction signals appear.

### Concept Integration

For each concept the user chose to adopt, integrate it into the appropriate phase skills. The specific phases affected depend on the discovered lifecycle. Accepted concepts are woven into the skills, not bolted on as separate steps.

### Generation Rules

1. **Use actual commands** — no `<placeholder>` syntax in any generated skill
2. **Present skills** to the user before writing
3. **Write as SKILL.md** in the project's skill directory (one directory per skill)
4. **Phase skills are not user-invocable** — only the launcher is
5. **40-140 lines per phase skill** — if a skill grows beyond this, it's doing too much
6. **Reference the harness-refs principles** where relevant

---

## Phase 7b: Validate Skills Against Scan

After generating skills but before writing HARNESS.md, cross-reference the generated phase skills against the scan findings to catch obvious gaps. This is a mechanical check, not a second brainstorm.

### Check 1: Prerequisites

For each agent-owned phase skill, check: does this phase depend on something the scan detected (Docker, database, dev server, package install) that no earlier phase sets up?

Examples of what to catch:

- A phase runs `docker compose` commands but no earlier phase starts Docker
- A phase tests API endpoints but no earlier phase runs database migrations
- A phase assumes dependencies are installed but no earlier phase runs the install command

### Check 2: Handoffs

Does each phase produce something that a later phase consumes? Is the handoff explicit in the state file outputs?

Examples:

- Plan phase produces ACs, but does build phase read them from state file?
- Build phase produces commits, but does PR phase reference the branch?

### Check 3: Unused Scan Findings

Are there tools, scripts, or configs the scan found that no phase skill uses?

Examples:

- Scan found a `cleanup` or `teardown` script but no phase cleans up
- Scan found a seed data script but no phase loads fixtures before testing
- Scan found a code formatter but no phase runs it

### Present Gaps

If gaps are found, present them concisely:

> **Pre-flight check — I found some gaps when cross-referencing your skills against the codebase:**
>
> - Your build phase runs `compose.sh run` but nothing starts Docker first. Add an environment setup step? (yes/no)
> - Your test phase starts the server but doesn't run migrations. Add that to the startup? (yes/no)
> - I found `compose.sh down` in your scripts but no phase cleans up. Add a cleanup step? (yes/no)
>
> These would prevent hard failures on the first run.

For each "yes": update the affected phase skill (add the missing step) or generate a new phase skill if needed. Update the lifecycle document, launcher profile matrix, and state file template to match.

If no gaps found, skip this phase silently — don't announce "no gaps found."

---

## Phase 8: Write HARNESS.md

Generate a `HARNESS.md` at the project root. This is the human-readable front door to the harness — it explains what harness engineering is, how the workflow works for this project, and references everything in `.harness/`.

The content reflects the discovered lifecycle — not a preset template. Include:

- What harness engineering is and why phases matter
- The architecture diagram (launcher → engine → phase skills)
- The harness loop: `/harness-setup` (shape) → real work → `/harness-retro` (reflect) → reshape
- Current workflow: each phase with what it does, key commands, exit gate (using the actual phases generated)
- Profile matrix showing which phases each profile includes
- Adopted concepts and what they mean for this project
- Generated skills table (skill name, purpose, user-invocable yes/no)
- Core principles (verify by proof, persist everything, adapt to repo, fail fast, self-improve)
- Harness data locations (`.harness/conversations/`, `.harness/retros/`)
- How to reshape (run `/harness-retro` after work, re-run `/harness-setup` to rethink)

`HARNESS.md` is committed to the repo — it's documentation for the team.

---

## Phase 9: Orient

After writing context, initializing `.harness/`, and generating skills, output:

> You're set up. Here's what was created:
>
> **Architecture:**
>
> - `/<launcher-name>` — your launcher (the skill you invoke)
> - N phase skills — focused work per phase ([list phase names from the discovered lifecycle])
> - `harness-engine` — universal state machine that loops through phases (ships with Harnessable)
>
> **Data:**
>
> - `.harness/` directory for recording progress and state
> - `HARNESS.md` documenting the workflow for your team
>
> **How to use it:** Run `/<launcher-name> ISSUE-123` (or a plain text description). The launcher creates a state file, the engine loops through your phase skills — each one does focused work with clear exit gates. Progress is recorded automatically.
>
> **How it improves:** After a few rounds of real work, run `/harness-retro`. It reads the recorded conversations, maps friction to specific phase skills, and suggests targeted improvements.
>
> The harness loop: `/harness-setup` (shape) → real work → `/harness-retro` (reflect) → reshape

---

## Re-running

`/harness-setup` can be run again anytime:

- After `/harness-retro` surfaces new concepts to explore
- After the codebase changes significantly (new tools, new deploy target)
- When the team grows or workflow changes
- When you want to rethink the harness shape

On re-runs, read `HARNESS.md`, `.harness/lifecycle.md`, and existing skills. Show what's changed since last exploration. Regenerate or update skills as needed.
