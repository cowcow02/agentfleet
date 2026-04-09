---
name: harness-implement
description: "Phase skill: TDD implementation — write tests first, then make them pass"
user-invocable: false
---

## Purpose

Implement the change using TDD: write failing tests, then write code to make them pass.

## Steps

1. **Read the plan** from state outputs

2. **If schema changes needed:**
   - Update Drizzle schema in `packages/db/src/schema.ts`
   - Update Zod types in `packages/types/src/entities.ts` and/or `api.ts`
   - Run `pnpm --filter @agentfleet/db drizzle-kit generate` to create migration

3. **TDD cycle — for each change in the plan:**
   - **Red:** Write the test first. Place tests in colocated `__tests__/` directories:
     - API tests: `apps/api/src/**/__tests__/`
     - Web tests: `apps/web/**/__tests__/` or `apps/web/components/__tests__/`
     - Type tests: `packages/types/src/__tests__/`
   - **Green:** Write the minimum code to make the test pass
   - **Refactor:** Clean up while tests stay green
   - Run the specific test to confirm: `pnpm --filter <package> vitest run <test-file>`

4. **Follow existing patterns:**
   - API routes: Hono router in `apps/api/src/routes/`, register in `apps/api/src/index.ts`
   - Zod validation: shared types in `packages/types/`, imported by both api and web
   - Frontend: React components in `apps/web/components/`, pages in `apps/web/app/(dashboard)/`
   - DB queries: use Drizzle query builder, import `db` from `@agentfleet/db`

5. **Record to conversation file:**
   - Append to `.harness/conversations/<task-id>.md`:
     ```
     ## Implement
     **Tests written:** <count>
     **Files changed:** <list>
     **Key decisions:** <any deviations from plan>
     ```
   - **If you hit friction** while implementing (failed test approach, unclear pattern, retried more than once, plan revision), append an entry to the `## Harness Issues` section at the bottom of the file.

## Checklist

- [ ] Tests written before implementation
- [ ] All new tests pass
- [ ] Existing tests not broken
- [ ] Schema migration generated (if applicable)
- [ ] Follows existing code patterns
- [ ] Conversation file updated

## Escalation

- If a test is fundamentally impossible to write (e.g., requires infrastructure not available), note it and proceed
- If implementation reveals the plan was wrong, go back and update the plan in state before continuing
- Stuck after 2 attempts → surface to human with what you tried
