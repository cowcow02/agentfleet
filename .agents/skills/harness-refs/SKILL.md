---
name: harness-refs
description: First principles and core discipline for agent engineering, plus a concept library that maps workflow friction to solutions. Hub skill referenced by all Harnessable action skills.
---

This skill defines the first principles and engineering discipline that make AI agents reliable. It's the hub — every Harnessable action skill reads this for principles. It's also a concept library — when you hit friction in your workflow, the concepts here help you name the problem and shape a response.

## Prerequisite: Harness Context

Before applying any pattern below, read the `## Harness Context` section in the project's AI config file (CLAUDE.md, .cursorrules, GEMINI.md, etc.). If it doesn't exist, run `/harness-setup` first.

All commands, tools, and workflows referenced below should be adapted to the harness context. Never hardcode assumptions about tech stack, PM tool, or deploy target.

---

## First Principles

Every software development workflow, regardless of domain, is governed by six principles. These are the listening framework for the deep dive — the agent uses them to parse the human's narrative and identify gaps.

1. **Trigger** — something causes work to begin
2. **Artifact** — each step produces something that didn't exist before
3. **Verification** — artifacts must be proven correct through the running system
4. **Destination** — artifacts must reach where they have effect
5. **Ownership** — each step has an owner (human, agent, or automated)
6. **Constraints** — each step has rules (explicit or implicit)

---

## Core Principles

These are constant regardless of which concepts you've adopted or how your workflow is shaped.

### 1. Verify by Proof, Not Assumption

**DO**: Run the system, capture output, cite evidence for every claim
**DO**: Prove each acceptance criterion — execute against the running system, capture output
**DO**: Classify criteria by the verification strategy appropriate to the artifact type before starting

**DON'T**: Read code and claim it works without executing it
**DON'T**: Use a verification strategy that doesn't match the artifact type
**DON'T**: Mark acceptance criteria as complete without captured evidence

### 2. Persist Everything

**DO**: Write down decisions, discoveries, and progress at natural milestones
**DO**: Record verification evidence alongside the acceptance criteria it proves
**DO**: Make your work resumable — if a session drops, a fresh agent should be able to continue

**DON'T**: Keep progress only in memory — sessions die without warning
**DON'T**: Assume you'll be the same agent that continues the work

### 3. Adapt to the Repo

**DO**: Read harness context before every action skill invocation
**DO**: Use the repo's actual commands for build, test, lint, type-check
**DO**: Follow the repo's branching model, commit format, and review process

**DON'T**: Hardcode `npm test` when the repo uses `pytest`
**DON'T**: Assume GitHub Actions when the repo uses CircleCI

### 4. Fail Fast, Surface Early

**DO**: Hit a blocker → flag it immediately with context and options
**DO**: Scope larger than expected → tell the human before continuing
**DO**: Stuck after 2 fix attempts → escalate with what you've tried

**DON'T**: Spiral for 20 minutes on a failing test without surfacing it
**DON'T**: Silently expand scope beyond what was requested
**DON'T**: Retry the same failing approach hoping it'll work this time

### 5. Self-Improve

**DO**: Record harness issues (problems with skill instructions) separately from product bugs
**DO**: Run retrospectives after implementation rounds — they surface friction patterns
**DO**: Track what worked well, not just what broke

**DON'T**: Ignore repeated failures — if the same issue occurs twice, the skill needs updating
**DON'T**: Over-correct for one-off issues

---

## The Harness Anti-Pattern Test

Review your work against these anti-patterns — they are the fingerprints of undisciplined agent work:

| Anti-Pattern            | What It Looks Like                         | The Fix                                                    |
| ----------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| **Ship and pray**       | PR created without running verification    | Run every check in harness context before PR               |
| **Read-and-assume**     | "The code looks correct" without execution | Execute, capture output, cite as evidence                  |
| **Infinite retry**      | Same command retried 5 times               | Diagnose root cause after attempt 2                        |
| **Context amnesia**     | Session drops, all progress lost           | Write progress at natural milestones                       |
| **Scope creep silence** | Task grew 3x but no one was told           | Flag scope expansion immediately                           |
| **Mock everything**     | Tests pass, production breaks              | Verify against real systems where possible                 |
| **Solo hero**           | Sequential work that could be parallelized | Split independent tasks across parallel agents or sessions |
| **Zombie process**      | Dev servers, DBs left running after work   | Clean up every environment you create                      |
| **Blind merge**         | PR merged without checking CI status       | Wait for CI, verify checks pass                            |
| **Attribution gap**     | Agent actions look like human actions      | Prefix agent comments with attribution                     |

---

## Concept Library

These concepts address specific friction patterns that emerge as you use the harness. You don't need all of them. You don't need them in any order. When you hit a pattern of friction, find the concept that names it and decide whether to adopt it.

### Verification Discipline

Every claim about working software must be backed by evidence from the running system.

**You'll want this when:** An agent says "the code looks correct" without running it. Or acceptance criteria are marked done without evidence. Or a feature "works" locally but breaks in review because nobody actually tested the specific AC.

### Session Resilience (baked in)

Progress, decisions, and discoveries must live in files, not agent memory.

**Baked into every generated phase skill** — agents record progress to `.harness/conversations/` at phase transitions. This data also powers `/harness-retro`. Not a separate concept to adopt.

### Environment Isolation

Each piece of work gets its own code, data, and runtime isolation. Cleanup is deterministic.

**You'll want this when:** Agents conflict on the same resources. Or you can't context-switch between features. Or cleanup is manual and zombie processes accumulate.

### Quality Gates

Before shipping, run parallel review agents checking different quality dimensions. Confidence-score findings to filter false positives.

**You'll want this when:** Quality issues caught during human review that agents should have caught. Or review rounds dominated by mechanical fixes rather than design discussions.

### Process Profiles

Match ceremony to task complexity. Not all work needs the same depth.

**You'll want this when:** Simple tasks feel over-processed. Or complex tasks are under-verified because the process doesn't distinguish them.

### Multi-Agent Coordination

One coordinator dispatches, manages dependencies, tracks state, and coordinates delivery.

**You'll want this when:** Tickets worked sequentially that could be parallel. Or parallel agents stepping on each other. Or there's no coordination point between individual deliverables and the integrated result.

### Integration Quality

Quality checks on the combined result, not just individual pieces.

**You'll want this when:** Individual deliverables pass review but the combined result has inconsistencies. Or features work in isolation but conflict when integrated.

### PM Integration

Work with your PM tool as part of the workflow, not as extra ceremony.

**You'll want this when:** Issue status out of sync with actual work. Or stakeholders can't see progress without asking.

### Self-Improvement Loop (baked in)

After each round, retrospect, distinguish harness issues from product bugs, apply fixes.

**Handled by `/harness-retro`** — not a separate concept to adopt.

### AC Discipline

Every acceptance criterion must be specific enough to verify through the running system.

**You'll want this when:** Agents interpret vague criteria differently. Or "it works" passes as an acceptance criterion.

### Architecture Lock-In

Lock hard-to-reverse decisions before creating implementation tasks.

**You'll want this when:** Agents discover missing schema mid-implementation. Or architecture changes after work starts, invalidating completed tasks.

### Vertical Feature Slices

Default to one task per user-visible capability, all layers end-to-end.

**You'll want this when:** Tasks split by layer create artificial sequential dependencies. Or integration issues surface only after all layers are "done."

---

## How Concepts Become Skills

Concepts are coaching material — patterns and principles. They don't ship as pre-built skills because every codebase needs different implementations.

When a concept is adopted, `/harness-setup` or `/harness-retro` integrates it into the appropriate phase skills for your workflow. The specific phases affected depend on your lifecycle — discovered during the deep dive.

> _See [phase-skill-architecture.md](reference/phase-skill-architecture.md) for the full architecture reference — state file schema, phase skill template, and launcher template._

## Example Harnesses

These illustrate what generated harnesses look like across domains — not templates to copy, but illustrations of the output. Your harness will have different phases based on how YOU work.

### Backend API

```
/implement "Add notification preferences"
  → plan → build → verify → api-test → pr
```

5 agent-owned phases. Build runs the full quality suite (tests + lint + type-check + security scan). API test phase curls endpoints against a local dev server and captures responses as evidence. Human gates for staging and production deploy.

### Frontend / Marketing Site

```
/implement "add dark mode to settings page"
  → code → build → e2e-test → push → deploy-check → cleanup
```

6 agent-owned phases. Build is a hard gate (`npm run build` must pass). E2E phase uses browser automation with screenshot evidence. Push to main requires human approval because it auto-deploys to production.

### Full-Stack Monorepo

```
/implement PROJ-135
  → pickup → understand → plan → implement → verify → ship → cloud-verify

/orchestrate M7
  → collect → analyze → dispatch → quality → cloud-verify → review
```

8 solo phases + 6 orchestration phases. Pickup fetches from a PM tool via MCP. Orchestration dispatches parallel agents per wave, grouped by dependency graph. Cloud-verify tests the preview deploy via browser automation.

### What to Notice

- **Phase names match how each team talks** — "build" vs "code" vs "implement", "pr" vs "ship"
- **Phase count varies** — 5 to 8, based on workflow complexity
- **Every harness evolves** — the first generation is usable, retros after real work make it sharper
- **The architecture is constant** — launcher → engine → phase skills, regardless of domain

## Implementation Notes

The right amount of process is the minimum needed to ship reliably. If you're spending more time on ceremony than code, simplify. If quality issues slip through, adopt the concept that addresses them.

Run `/harness-setup` to shape your harness. Use the generated skills on real work. Run `/harness-retro` to reflect and reshape. The workflow gets better every round because the skills get more specific to your actual needs.

The harness loop: `/harness-setup` (shape) → real work → `/harness-retro` (reflect) → `/harness-setup` ...
