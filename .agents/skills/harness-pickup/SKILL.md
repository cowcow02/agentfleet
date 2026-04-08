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

3. **Write to state outputs:**

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

4. **Record to conversation file:**
   - Write to `.harness/conversations/<task-id>.md`:
     ```
     ## Pickup
     **Ticket:** AGE-XX — <title>
     **Priority:** <priority>
     **Description:** <summary>
     ```

## Checklist

- [ ] Ticket/task context loaded
- [ ] Context written to state outputs
- [ ] Conversation file started

## Escalation

- If the ticket doesn't exist or Linear MCP fails, stop and tell the human
- If the ticket description is empty or vague, note this and proceed — the understand phase will explore
