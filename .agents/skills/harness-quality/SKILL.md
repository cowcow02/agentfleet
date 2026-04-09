---
name: harness-quality
description: "Phase skill: run all quality checks — typecheck, tests, lint, format"
user-invocable: false
---

## Purpose

Ensure the codebase passes all static and dynamic quality checks before verification.

## Steps

1. **Type checking:**

   ```bash
   pnpm turbo typecheck
   ```

   Fix any type errors before proceeding.

2. **Full test suite:**

   ```bash
   pnpm turbo test
   ```

   All tests must pass — both new and existing. If any fail, fix them.

3. **Linting:**

   ```bash
   pnpm --filter web lint
   ```

   Fix any lint errors. Note: only `apps/web` has ESLint configured currently.

4. **Formatting** (once Prettier is configured):

   ```bash
   pnpm prettier --check "apps/**/*.{ts,tsx}" "packages/**/*.ts"
   ```

   If files are unformatted, run `pnpm prettier --write` on the changed files only.

5. **Record to conversation file:**
   - Append to `.harness/conversations/<task-id>.md`:
     ```
     ## Quality
     **Typecheck:** pass/fail
     **Tests:** X passed, Y failed
     **Lint:** pass/fail
     **Format:** pass/fail
     **Pre-existing issues noted:** <list any errors in files you didn't touch>
     ```
   - **If you hit friction** (broken pre-existing checks blocking you, flaky tests, slow checks), append an entry to the `## Harness Issues` section at the bottom of the file.

## Checklist

- [ ] `pnpm turbo typecheck` passes
- [ ] `pnpm turbo test` passes (all tests green)
- [ ] `pnpm --filter web lint` passes
- [ ] Formatting check passes (when configured)
- [ ] Conversation file updated

## Escalation

- If a pre-existing test is failing (not caused by your changes), note it and proceed — don't fix unrelated test failures
- If type errors are in code you didn't change, note and proceed
- If stuck on a quality issue after 2 fix attempts → surface to human
