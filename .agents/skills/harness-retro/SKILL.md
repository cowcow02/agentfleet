---
name: harness-retro
description: Review what happened during implementation, visualize friction patterns, and reshape your harness — fix issues, adopt concepts, generate new skills. The reflection half of the harness loop.
user-invocable: true
---

# Harness Retro

Review real work, see where friction occurred, and reshape your harness. Fix harness issues, adopt new concepts when the evidence is clear, and generate codebase-specific skills.

**Invoke with:** `/harness-retro`

This is the reflection half of the harness loop:

```
/harness-setup (shape) → use generated skills (real work) → /harness-retro (reflect) → /harness-setup ...
```

---

## Phase 1: Gather Evidence

### 1a. Harness Data

Read from `.harness/`:

- **`.harness/conversations/`** — all conversation files from recent implementations. Extract: phase progress, decisions, discoveries, verification evidence, harness issues, metrics. **Classify friction by phase** — which phase skill was active when the issue occurred.
- **`HARNESS.md`** — current workflow, adopted concepts, generated skills.
- **`.harness/retros/`** — past retro results. Check: were previous findings addressed? Are issues recurring?

If `.harness/conversations/` is empty or sparse, note this — the retro is limited to git history and PR comments. Suggest that recording be added to the phase skills.

### 1b. Git & PR History

- Recent PRs and their review comments — look for patterns in reviewer feedback
- Git log for recent agent work — what was shipped, how many rounds of fixes
- CI failures — what broke after push

### 1c. Cross-Round Patterns

If enough conversation files exist (5+), look for patterns across rounds:

- Which **phase skills** take longest consistently?
- Which types of harness issues recur in which phases?
- Are the same discoveries made repeatedly?
- What friction signals appear across multiple implementations?
- Are there phases that consistently pass without friction (candidates for simplification)?

This cross-round analysis is what drives structural workflow changes (not just fixing individual issues). After 10+ implementations, prompt: "You have enough data for a big-picture analysis. Want to look at patterns across all rounds?"

## Phase 2: Analyze Harness Issues

Classify each finding:

| Category                | Description                                 | Action                     |
| ----------------------- | ------------------------------------------- | -------------------------- |
| **Harness bug**         | Skill instruction is wrong/outdated/missing | Propose specific edit      |
| **Harness gap**         | Scenario the skill doesn't cover            | Propose new section/step   |
| **Repeated issue**      | Known issue that happened again             | Escalate — fix didn't work |
| **Process improvement** | Pattern that worked well                    | Propose codifying it       |
| **Not actionable**      | One-off, external dependency                | Note for context           |

### Harness Issues vs Product Bugs

Distinguish these during analysis:

- **Harness issue**: Problem with skill instructions (wrong command, missing step, unclear gate). Fix: edit the phase skill.
- **Product bug**: Problem with the application code. Fix: create a new task/issue.

When recording harness issues in conversation files, use this format:

```
### [Phase name] Brief title
- What happened: [attempt and failure]
- Root cause: [why skill was wrong]
- Workaround: [what you did instead]
- Suggested fix: [specific edit to phase skill]
- Turns wasted: [count]
```

For each finding:

```
### Finding N: [Brief title]

**Category:** harness bug | harness gap | repeated issue | process improvement | not actionable
**Phase:** [Which phase skill this occurred in — read from state file lifecycle[].skill]
**Evidence:** [What happened — be specific]
**Impact:** [Turns wasted / human interventions / quality degradation]
**Proposed fix:** [Exact phase skill file + section + change]
```

Phase-level classification makes fixes precise — "harness-verify step 3 should run coverage before E2E" instead of "step 14 in /implement should..."

## Phase 3: Present Friction Dashboard

Present the friction analysis in the terminal.

### 3a. Workflow Replay

Show the **state machine progression through phases** with annotations from this round:

- Which phases were reached, which were skipped (by profile)
- Time spent per phase (from state file timestamps)
- Where blockers occurred — which phase skill?
- Where the human had to intervene
- What went smoothly

If multiple implementations happened, compare them to reveal cross-round phase patterns.

### 3b. Friction Map

Map friction to the workflow:

- Each friction point: what happened, how many times, total impact
- Group by concept: "These 3 friction points all relate to Environment Isolation"
- Which friction points are addressed by existing skills vs. which need new concepts

Ask: "Does this match your experience? Anything I missed?" Wait for the user's response before proceeding.

## Phase 4: Walk Through Findings & Suggestions

<CRITICAL>
Do NOT dump all findings and suggestions in one message. Present each one individually using AskUserQuestion, wait for the user's decision, then move to the next. This prevents the user from having to scroll back through a wall of text.
</CRITICAL>

### 4a. Actionable Findings (one at a time)

For each finding that has a proposed fix (harness bug, harness gap, process improvement), present it individually and ask for a decision:

> **Finding: [Brief title]**
> **Phase:** [which phase skill]
> **What happened:** [evidence — be specific]
> **Proposed change:** [exact edit to the phase skill]
> **Recommendation:** Apply / Skip
>
> (apply / skip)

Wait for the user's answer before showing the next finding. Track which ones they approved.

Skip "not actionable" findings in this step — they'll appear in the summary.

### 4b. Concept Suggestions (one at a time)

For each concept with concrete friction evidence (max 2-3 per retro), present individually:

> **Suggestion: [Concept name]**
> **Friction observed:** [specific incidents from this round]
> **What would change:** [which phase skills get augmented or generated]
> **Recommendation:** Adopt
>
> (adopt / not now / not relevant)

Wait for the user's answer before showing the next suggestion.

**Rules:**

- Suggest at most 2-3 concepts per retro
- Only suggest with concrete evidence from this round
- Respect previous "not now" and "not relevant" decisions

### 4c. Summary

After all decisions are collected, output a brief summary:

```
Decisions: N findings reviewed, M approved. K concepts suggested, J adopted.
Applying changes now.
```

## Phase 5: Apply Changes

Apply only what the user approved:

### Fix Harness Issues

- Edit specific **phase skill files** with approved changes — small, targeted edits to 40-140 line files

### Generate or Update Phase Skills

For adopted concepts OR improvements to existing phase skills:

1. Read the `## Harness Context`
2. Read the phase skill architecture reference for skill template and state file schema in [phase-skill-architecture.md](../harness-refs/reference/phase-skill-architecture.md)
3. Determine which phase skills are affected:
   - **Augment existing phase** → edit the phase skill file (add steps, update checklist)
   - **Add new phase** → generate a new phase skill file + update the launcher's lifecycle array
   - **Add coordination** → generate coordination launcher + phase skills appropriate to the team's coordination pattern
4. Write or update SKILL.md files with **this repo's actual commands, paths, and tools**
5. Present to user for review before writing
6. Write to the project's skill directory
7. If phases were added/removed, update the launcher's lifecycle and profile matrix

### Update Harness State

- Write retro results to `.harness/retros/YYYY-MM-DD-retro.md`
- Update `HARNESS.md` if the workflow changed: new concepts adopted, skills generated/updated, workflow steps added or removed. `HARNESS.md` should always reflect the current state.

### Update Harness Context

- If new skills or workflow changes affect the context, update it
- Record adopted/deferred/dismissed concepts so future retros respect decisions

### Report

- List what changed: skill edits, new skills, context updates
- If significant workflow reshape happened, suggest: "Run `/harness-setup` to re-examine the workflow shape."

## Guidelines

- **Evidence over theory.** Only suggest concepts with concrete friction from this round.
- **Show, don't tell.** Make friction obvious with concrete examples, not abstract descriptions.
- **Be specific.** "Step 4 should run `pnpm build` after `pnpm install`" — not "the skill should be clearer."
- **Don't over-correct.** One-off issues don't need permanent skill changes.
- **Record successes.** What worked well should be codified too.
- **Generate, don't prescribe.** Skills use this repo's actual tools, not placeholders.
- **Coach, don't lecture.** Concept suggestions are offers, not mandates.
- **Respect decisions.** "Not now" means not now. "Not relevant" means stop.
