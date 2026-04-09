---
name: harness-understand
description: "Phase skill: explore the codebase to understand what needs to change for the ticket"
user-invocable: false
---

## Purpose

Build a clear picture of the current state — what files exist, what patterns are used, what needs to change.

## Steps

1. **Read the ticket context** from state outputs (pickup phase)

2. **Explore affected areas:**
   - Search for relevant files, functions, components, routes, schema
   - Read key files to understand current patterns
   - Check existing tests for the area being changed
   - Note the tech stack for the affected area:
     - `apps/api/` — Hono routes, Drizzle ORM, Zod validation
     - `apps/web/` — Next.js 16, React 19, Tailwind v4, shadcn/ui
     - `packages/db/` — Drizzle schema, PostgreSQL
     - `packages/types/` — Zod schemas for API/WS/SSE types
     - `apps/daemon/` — Plain JS, WebSocket client

3. **Identify scope:**
   - Files to create or modify
   - Dependencies between changes (e.g., schema change → API route → frontend)
   - Existing tests that might break
   - Related code that should stay consistent

4. **Write to state outputs:**

   ```json
   {
     "affected_files": ["..."],
     "dependencies": ["..."],
     "existing_patterns": "...",
     "scope_summary": "..."
   }
   ```

5. **Record to conversation file:**
   - **Insert before** the `## Harness Issues` marker in `.harness/conversations/<task-id>.md` (use the Edit tool with `## Harness Issues` as the anchor — do NOT literally append to the end of the file, that would land below the issues section):

     ```
     ## Understand
     **Scope:** <summary>
     **Files:** <list>
     **Key patterns:** <what to follow>
     ```

   - **If you hit friction** during exploration (couldn't find expected patterns, scope unclear, repeated retries), append an entry to the **literal end** of the file — it will land inside the `## Harness Issues` section since that section is last. Use the documented format (phase, what happened, root cause, workaround, suggested fix, turns wasted).

## Checklist

- [ ] Relevant code explored
- [ ] Scope identified and documented
- [ ] Existing patterns noted
- [ ] Conversation file updated

## Escalation

- If the ticket requires changes across 10+ files or multiple unfamiliar domains, flag scope risk to the human
- If the ticket description conflicts with what the code actually does, stop and ask
