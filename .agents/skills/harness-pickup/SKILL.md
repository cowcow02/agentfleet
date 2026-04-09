---
name: harness-pickup
description: "Phase skill: fetch Linear ticket or parse task description into structured context"
user-invocable: false
---

## Purpose

Load the task context so all subsequent phases have a clear picture of what to build.

## Steps

1. **If ticket identifier (AGE-XX):**
   - Use `mcp__plugin_linear_linear__get_issue` to fetch the full ticket
   - Extract: title, description, acceptance criteria, labels, priority, assignee
   - If the ticket has linked issues or parent, note them as context

2. **If plain text description:**
   - Use the description as-is
   - Note: no labels or priority available, downstream phases should infer from content

3. **Update Linear status to "In Progress"** — if the task is a Linear ticket (AGE-XX pattern):
   - Use `mcp__plugin_linear_linear__save_issue` with `state: "In Progress"`
   - This signals the team that work has started without manual board updates
   - Skip silently if the ticket is already in `In Progress` or a later state
   - Skip entirely for plain-text tasks (no Linear ticket)

4. **Write to state outputs:**

   ```json
   {
     "ticket_id": "AGE-XX",
     "title": "...",
     "description": "...",
     "labels": [],
     "priority": "high|medium|low",
     "acceptance_criteria": "..."
   }
   ```

5. **Initialize the conversation file** at `.harness/conversations/<task-id>.md` (pickup owns file creation):

   ```
   # <task-id>: <title>

   ## Pickup
   **Ticket:** AGE-XX — <title>
   **Priority:** <priority>
   **Linear status:** moved to In Progress
   **Description:** <summary>

   <!-- Subsequent phases append their sections below -->

   ## Harness Issues

   <!--
   Record any friction encountered during this implementation. Format per issue:

   ### [Phase] Brief title
   - What happened: <attempt and failure>
   - Root cause: <why the skill instruction was wrong/missing>
   - Workaround: <what you did instead>
   - Suggested fix: <specific edit to phase skill>
   - Turns wasted: <count>

   Leave empty if no friction occurred.
   -->
   ```

## Checklist

- [ ] Ticket/task context loaded
- [ ] Linear ticket moved to "In Progress" (Linear tickets only)
- [ ] Context written to state outputs
- [ ] Conversation file initialized with Harness Issues section

## Escalation

- If the ticket doesn't exist or Linear MCP fails, stop and tell the human
- If the ticket description is empty or vague, note this and proceed — the understand phase will explore
