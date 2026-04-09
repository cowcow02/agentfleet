---
name: harness-plan
description: "Phase skill: create an implementation plan with TDD test strategy"
user-invocable: false
---

## Purpose

Produce a concrete plan that covers all acceptance criteria with a TDD approach.

## Steps

1. **Read ticket context and scope** from state outputs

2. **Draft the plan:**
   - List changes in order of implementation
   - For each change, specify:
     - What tests to write first (TDD)
     - What code to implement to make them pass
     - What file(s) to create or modify
   - If schema changes are needed: include Drizzle migration step
   - If new API routes: include Zod schema updates in `packages/types/`

3. **Verify coverage:**
   - Every acceptance criterion from the ticket maps to at least one test
   - Every file change has a reason traced back to the ticket

4. **Write to state outputs:**

   ```json
   {
     "plan": "...",
     "test_strategy": "...",
     "schema_changes": true|false,
     "estimated_files": 5
   }
   ```

5. **Record to conversation file:**
   - Append to `.harness/conversations/<task-id>.md`:
     ```
     ## Plan
     **Approach:** <summary>
     **Test strategy:** <TDD approach>
     **Files to change:** <count>
     ```
   - **If you hit friction** while planning (had to revise the plan, ambiguous requirements, blocked on unknowns), append an entry to the `## Harness Issues` section at the bottom of the file.

6. **If profile is `full`:** set phase status to `waiting` — human reviews the plan before implementation starts. Present the plan clearly and ask for approval.

## Checklist

- [ ] Plan covers all acceptance criteria
- [ ] TDD test strategy defined
- [ ] Schema migration needs identified
- [ ] Conversation file updated
- [ ] (full profile) Human approved plan

## Escalation

- If requirements are ambiguous, stop and ask rather than guessing
- If the change requires an architecture decision not covered by existing patterns, escalate
- Stuck after 2 attempts at planning → surface to human
