---
name: harness-learn
description: Guided onboarding — teaches a newcomer (human or agent) what harness engineering is, then walks them through THIS project's specific harness with real examples.
user-invocable: true
safety: read-only
---

**Safety:** This skill only reads files. It does not modify code, run builds, or start services.

# Harness Onboarding

Walk a newcomer through harness engineering in three layers: the concept, this project's harness, and a hands-on walkthrough.

**Invoke with:** `/harness-learn`

---

## Layer 1: The Concept

Present this conversationally — not as a lecture. Adapt to who you're talking to (ask if they're a developer, PM, or agent new to this repo).

### What harness engineering is

> When AI agents work on software, they tend to drift — skipping verification, losing context between sessions, producing inconsistent quality. Harness engineering gives them a disciplined, phased workflow instead.
>
> Every task follows focused phases — each with explicit instructions, real commands, and an exit gate. A universal engine loops through them automatically.

### How it works

```
You invoke the launcher:  /implement "Add dark mode"
                              ↓
Launcher creates a state file and hands off to the engine
                              ↓
Engine loops through phase skills:
  [phase 1] → [phase 2] → ... → [phase N] → COMPLETE
                              ↓
Each phase is a focused 40-140 line skill that:
  - Knows exactly what to do (real commands, not placeholders)
  - Has a checklist the engine validates before advancing
  - Records progress to a conversation file (survives session drops)
```

### Why phases matter

A single big prompt ("implement this feature, test it, create a PR") loses agent attention by the end. By phase 7, the agent has forgotten phase 2's instructions. Phase skills keep each turn focused — the agent sees one phase at a time.

### The improvement loop

The harness gets better with use:

```
/harness-setup (discover your workflow, generate skills)
      ↓
Real work (/implement on actual tasks)
      ↓
/harness-retro (review what happened, fix skill gaps)
      ↓
Back to /harness-setup or next round of work
```

Pause here. Ask:

> "That's the general concept. Want me to show you how it works specifically on this project?"

---

## Layer 2: This Project's Harness

Read the project's harness files and present them in order.

### Step 1: Read the harness

Read these files (skip any that don't exist):

1. `HARNESS.md` — overview and architecture
2. `.harness/lifecycle.md` — the discovered workflow
3. `CLAUDE.md` (or `.cursorrules`, `GEMINI.md`) — the Harness Context section
4. List all phase skills in the project's skill directory (`harness-*` and the launcher)

### Step 2: Present the workflow

> "Here's how this project ships software:"

Show the lifecycle as a table:

| Phase               | Owner | What happens | Key command | Gate |
| ------------------- | ----- | ------------ | ----------- | ---- |
| [from lifecycle.md] |       |              |             |      |

Then show the profiles:

> "Not every task goes through all phases:"

| Profile             | When to use | Which phases |
| ------------------- | ----------- | ------------ |
| [from lifecycle.md] |             |              |

### Step 3: Walk through each phase

For each agent-owned phase, read the phase skill and explain:

> **[Phase name]** — [one sentence on what it does]
>
> - Produces: [artifact]
> - Verified by: [method]
> - Key commands: `[actual commands from the skill]`
> - Gate: [what must be true to proceed]
> - Checklist: [items the engine validates]

For human-owned gates, explain:

> **[Phase name]** — This is where YOU step in.
>
> - The engine stops and waits for your approval.
> - You [what the human does — review PR, test UI, approve deploy].
> - When you approve, the engine continues to the next phase.

### Step 4: Show a real example (if available)

Check `.harness/conversations/` for past implementation records. If any exist, pick the most recent completed one and narrate:

> "Here's what happened the last time someone used this harness:"
>
> - Task: [from conversation file]
> - Profile: [profile used]
> - Phases completed: [list with durations if available]
> - What was produced: [commits, PR, evidence]
> - Any friction: [issues from the conversation file]

If `.harness/retros/` has retro records, mention:

> "The harness has been through [N] retro rounds. Recent improvements: [list changes from retros]"

If no conversation files exist:

> "This harness hasn't been used yet — no past examples to show. Want to do a dry run?"

---

## Layer 3: Hands-On Walkthrough

Ask:

> "Want to try a dry run? Pick a task (or I'll suggest one) and I'll walk you through what each phase WOULD do — without actually running it."

If they say yes:

1. Ask for a task description (or suggest a small one from the backlog if PM tool is available)
2. Determine which profile would apply
3. For each phase in that profile, explain what the agent WOULD do:
   - "In the **[phase]** phase, the agent would [action]. It would run `[command]` and check that [gate condition]."
   - Show what the state file would look like at each transition
4. Point out where human gates would pause the workflow
5. At the end: "That's the full lifecycle. Ready to try it for real? Run `/implement [task]`"

If they say no:

> "No problem. When you're ready, run `/implement` with a task description to start. The engine handles the rest."

---

## Adapt to the Audience

- **Developer new to the repo:** Focus on the commands and where their code goes in the workflow. Skip philosophy.
- **PM or non-technical:** Focus on the phases, gates, and what they'll see (PRs, status updates). Skip commands.
- **Agent joining a team:** Focus on the state file, conversation recording, and escalation rules. They need to know when to stop and ask.
- **Someone who's used harnesses before:** Skip Layer 1, go straight to Layer 2.

Ask at the start:

> "Before we start — are you a developer, PM, or agent? And have you seen a harness workflow before?"

This shapes how deep each layer goes.
