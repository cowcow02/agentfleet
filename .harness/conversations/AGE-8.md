# AGE-8: Simplify manual dispatch to modal with agent selector

## Pickup

**Ticket:** AGE-8 — Simplify manual dispatch to modal with agent selector
**Priority:** Medium
**Linear status:** In Progress (already)
**Linear assignee:** self (Charlie Mak)
**Description:** Reduce manual dispatch from a tab in the dispatch form to a lightweight modal triggered by a CTA button. Remove Manual tab from `apps/web/components/dispatch-form.tsx`, add a CTA button that opens a shadcn/ui Dialog with only agent selector + optional freeform description. May need to simplify `POST /api/dispatches` request schema in `packages/types/src/api.ts`.

<!-- Subsequent phases append their sections below -->

## Understand

**Scope:** Wire up the dormant "Manual Dispatch" button in `dispatch-form.tsx` to open a Sheet containing an agent selector (from `fetchAgents`) plus an optional freeform description. Add an ad hoc dispatch path to the API: widen `CreateDispatchRequest` to a `z.union` accepting either the existing ticket shape or a new `{ agentName, machineName, description? }` shape. Extend `lib/dispatch.ts` with `createAdHocDispatch` that looks up the agent by `(orgId, machineName, agentName)` directly rather than via label matching, synthesizing `ticketRef = "ADHOC-<short>"`, title from description (or "Ad hoc task"), and empty labels. Existing ticket tests need `mode: ticket` union discrimination handled — union by unique field (`ticketRef` vs `agentName`) keeps existing test payloads valid.

**Key findings from exploration:**

- The "Manual" vs "From Linear" tab switcher referenced in ticket description is already gone — `apps/web/components/dispatch-form.tsx` only shows Linear tickets with a non-functional "Manual Dispatch" button at `dispatch-form.tsx:49-65`. Ticket is stale in describing current state; the remaining work is wiring up the button.
- dispatches table has `ticketRef`, `title` NOT NULL (`packages/db/src/schema.ts:42-43`), `labels` array default `[]` — ad hoc path must synthesize these.
- `findAgentForDispatch` (`apps/api/src/lib/machines.ts:114`) does label-based scoring; ad hoc needs direct lookup instead. Machine/agent registry exposes `getAgentsForOrg` (`apps/api/src/lib/machines.ts:64`) returning `{ name, machine, ... }`.
- shadcn/ui library already has: `sheet.tsx`, `select.tsx`, `button.tsx`, `textarea.tsx`, `label.tsx`. No Dialog, so use Sheet.
- Existing test coverage: `apps/web/components/__tests__/dispatch-form.test.tsx` (already has "does not render Manual/From Linear tab" and "renders Manual Dispatch CTA button" tests — the baseline for my new UI), `packages/types/src/__tests__/api.test.ts` (CreateDispatchRequest), `apps/api/src/routes/__tests__/dispatches.test.ts` (route tests — need to verify).

**Files to touch:**

- `packages/types/src/api.ts` — widen `CreateDispatchRequest` to union + add `AdHocDispatchRequest`
- `packages/types/src/__tests__/api.test.ts` — add ad hoc validation tests
- `apps/api/src/lib/dispatch.ts` — add `createAdHocDispatch` (and export); or branch within `createDispatch`
- `apps/api/src/lib/machines.ts` — add `findAgentByName(orgId, machineName, agentName)` helper
- `apps/api/src/routes/dispatches.ts` — POST handler branches on shape
- `apps/api/src/routes/__tests__/dispatches.test.ts` — add ad hoc dispatch test
- `apps/web/lib/api.ts` — `createDispatch` already accepts `CreateDispatchRequest`; confirm union type is exposed
- `apps/web/components/dispatch-form.tsx` — wire up Manual Dispatch button to new `ManualDispatchSheet` component
- `apps/web/components/manual-dispatch-sheet.tsx` (new) — Sheet with agent Select + description Textarea
- `apps/web/components/__tests__/manual-dispatch-sheet.test.tsx` (new)
- `apps/web/components/__tests__/dispatch-form.test.tsx` — add tests for clicking the button opens the sheet

**Key patterns to follow:**

- Zod schemas live in `packages/types`, exported types via `z.infer`
- API routes register in `apps/api/src/index.ts` (no new route path needed — same POST)
- Tests use Vitest + @testing-library/react; mocks at `vi.mock("@/lib/api")`
- Component styling uses inline `af-*` CSS vars for legacy/prototype-matching panels, Tailwind for newer components

## Plan

**Approach:** Bottom-up — types first (widen `CreateDispatchRequest` to union), then api lib + route branches on union shape, then web `manual-dispatch-sheet` component + wire it into `dispatch-form`.

**Test strategy (TDD):**

1. `packages/types/src/__tests__/api.test.ts` — add describe block `CreateDispatchRequest ad hoc` with 5 cases:
   - valid ad hoc `{ agentName, machineName }` parses
   - ad hoc with description parses
   - rejects empty `agentName`, empty `machineName`
   - existing ticket shape still parses (regression)
   - rejects shape that matches neither union arm
2. `apps/api/src/routes/__tests__/dispatches.test.ts` — add test: POST with `{ agentName, machineName, description }` dispatches directly to that agent (mock registry), inserts row with `source="manual"` and synthesized `ticketRef`.
3. `apps/web/components/__tests__/dispatch-form.test.tsx` — add tests:
   - clicking "Manual Dispatch" opens the sheet (asserts visible agent selector label/title)
4. `apps/web/components/__tests__/manual-dispatch-sheet.test.tsx` (new) — tests:
   - renders when `open=true`, calls `fetchAgents` on open
   - shows agents in select
   - submit calls `createDispatch` with `{ agentName, machineName, description }`
   - disabled submit while `agents.length === 0`
   - closes + toasts on success; toasts error on failure

**Implementation order:**

1. **packages/types/src/api.ts** — convert `CreateDispatchRequest` to `z.union([TicketDispatchRequest, AdHocDispatchRequest])`. Export both sub-schemas + inferred types. Keep `CreateDispatchRequest` as the union so existing call sites in lib/dispatch still type-check against the widened type. Narrow helper: `isAdHocDispatch(req)`.
2. **apps/api/src/lib/machines.ts** — add `findAgentByName(orgId, machineName, agentName)` returning `{agent, machine} | null`.
3. **apps/api/src/lib/dispatch.ts** — branch inside `createDispatch`: if `"agentName" in request` → direct lookup via `findAgentByName`, synthesize `ticketRef = "ADHOC-" + crypto.randomUUID().slice(0,8).toUpperCase()`, `title = request.description?.slice(0,80) || "Ad hoc task"`, `labels = []`, `priority = "medium"`; else existing path. Caller unchanged.
4. **apps/api/src/routes/dispatches.ts** — no changes beyond the widened schema; error messages already surface `parsed.error.issues`.
5. **apps/web/components/manual-dispatch-sheet.tsx** — new. Props: `{ open, onOpenChange }`. Fetches agents on open, renders shadcn `Sheet` + shadcn `Select` (agents keyed by `${machine}/${name}`) + shadcn `Textarea` + submit button. On submit calls `createDispatch({ agentName, machineName, description: description || undefined })`, toasts on success/failure, closes sheet.
6. **apps/web/components/dispatch-form.tsx** — add `useState` for sheet open, wire the existing "Manual Dispatch" button's onClick to open the sheet, render `<ManualDispatchSheet open onOpenChange />` at end of the component return.

**Schema changes:** None to database — dispatches table unchanged. Only the Zod request schema in `packages/types`.

**Files to change:** 8 (6 modified, 2 new).

## Implement

**Tests written:** 13 (5 types unit, 2 api route, 6 manual-dispatch-sheet unit + regression, 1 dispatch-form open-sheet)
**Files changed:**

- `packages/types/src/api.ts` — split `CreateDispatchRequest` into `TicketDispatchRequest` + `AdHocDispatchRequest` union, added `isAdHocDispatch` type guard.
- `packages/types/src/__tests__/api.test.ts` — ad hoc validation cases.
- `apps/api/src/lib/machines.ts` — new `findAgentByName(orgId, machineName, agentName)`.
- `apps/api/src/lib/dispatch.ts` — new `resolveDispatchTarget` helper branches on union shape; ad hoc path synthesizes `ticketRef = ADHOC-<8char>`, `title = description slice || "Ad hoc task"`, `labels = []`.
- `apps/api/src/routes/__tests__/dispatches.test.ts` — ad hoc POST test + missing-machineName rejection.
- `apps/web/components/manual-dispatch-sheet.tsx` — new, uses shadcn `Sheet` + native `<select>` + `Textarea`.
- `apps/web/components/__tests__/manual-dispatch-sheet.test.tsx` — new, 6 tests.
- `apps/web/components/dispatch-form.tsx` — wired "Manual Dispatch" button onClick to open state; renders `<ManualDispatchSheet>` inside the panel.
- `apps/web/components/__tests__/dispatch-form.test.tsx` — added open-sheet-on-click test, mocked `fetchAgents`.

**Key decisions:**

- Used `z.union` rather than `z.discriminatedUnion` so existing ticket payloads parse without a `mode` field (keeps all legacy tests and callers untouched).
- Used a native `<select>` instead of shadcn `<Select>` (base-ui portals add noise in JSDOM; native select keeps the test surface minimal and is accessible by default).
- Default-select first agent on open — no explicit "select an agent" placeholder to confuse users in the common single-agent case.

## Quality

**Typecheck:** pass (my changes). Pre-existing errors on master: 4 (`dispatch-list.test.tsx:174`, `sidebar.test.tsx:189,196` — null/string and source enum mismatches, untouched).
**Tests:** 478 passed, 0 failed (types 168, api 185, web 125).
**Lint:** pass (my changes). Pre-existing `web` lint failures: `app/(dashboard)/settings/page.tsx:45` (explicit `any`) and `lib/use-sse.ts:58` (use-before-declare). Untouched.
**Format:** pass (ran prettier --write on `manual-dispatch-sheet.tsx` and `machines.ts`).
**Notes:** Ran individual `pnpm --filter` commands instead of `pnpm turbo typecheck` — turbo 2.9.5 aborts with "Missing packageManager field in package.json" regardless of branch, a pre-existing environment issue.

## Verify

**Slot:** 08 (api=9908, web=3008, db=agentfleet_age_08)
**API checks:** `/health` returned 200 on 9908. `POST /api/dispatches` is gated by auth — validation cases are covered by route unit tests in `routes/__tests__/dispatches.test.ts` rather than live HTTP (all 14 pass).
**UI checks:** Signed up a fresh user on the isolated env, dashboard rendered, clicked "Manual Dispatch" on the Tickets panel header → right-side Sheet opened with: title "Manual Dispatch", description copy "Send an ad hoc task to a specific agent. Use this for one-off work that isn't tracked in Linear.", Agent empty state "No agents online. Start a daemon to dispatch ad hoc tasks.", optional description Textarea with placeholder "What should the agent do?", disabled Dispatch button (correctly disabled because no agents). Screenshot captured.
**Build:** pass — `pnpm --filter web build` compiled 12 static pages + 1 dynamic route in Turbopack without errors.
**Evidence:** browser screenshot `ss_3694id8v2` (Manual Dispatch sheet open on isolated env).

## Ship

**Branch:** age-8-simplify-manual-dispatch
**PR:** https://github.com/cowcow02/agentfleet/pull/6
**Commits:** 3 (`feat(web): manual dispatch modal...`, `test(types): cover isAdHocDispatch...`, `test(api): cover findAgentByName + ad hoc...`)
**CI:** pass after two fix pushes — https://github.com/cowcow02/agentfleet/actions/runs/24184441447
**Linear:** AGE-8 moved to "In Review" with PR attached.

## Harness Issues

### [ship] CI coverage thresholds blocked first two pushes

- What happened: First push failed `types-tests` because `isAdHocDispatch` was the only function in `packages/types/src/api.ts` and had no test caller, dropping function coverage to 0% (below the 90% global threshold). Second push failed `api-tests` because branch coverage sat at 87.5% — my new `resolveDispatchTarget` ad hoc branch and `findAgentByName` body had no unit tests.
- Root cause: The implement and quality phases ran test suites without `--coverage`, so the coverage shortfalls never surfaced locally. The `harness-quality` skill's "tests" step runs `pnpm turbo test` (or per-package equivalent) without the coverage flag that CI enforces.
- Workaround: added `isAdHocDispatch` unit test to `packages/types/src/__tests__/api.test.ts`; added `findAgentByName` suite to `apps/api/src/lib/__tests__/machines.test.ts`; added three ad hoc dispatch tests to `apps/api/src/lib/__tests__/dispatch.test.ts` covering synthesized ticketRef, default title fallback, and NO_AGENT error. Re-pushed twice; CI went green on attempt 3.
- Suggested fix: `harness-quality` should run `pnpm --filter <pkg> test -- --coverage` (matching CI), not the unflagged variant, so new exports/branches without tests fail fast before ship. Any time you add an exported function or a new branch, include a test for it in the same TDD cycle.
- Turns wasted: 2 (one coverage push per threshold — first for function threshold in types, second for branch threshold in api).

### [verify] docker compose postgres collides with host-native postgres on port 5432

- What happened: `docker compose up -d` started a `postgres:16-alpine` container that bound to 5432, but the host's native postgres also listens on 5432 (localhost-only). psql/drizzle-kit connections to `localhost:5432` hit the host postgres, not the container, so `agentfleet_age_08` created inside the container was invisible to migrations and the skill's setup steps failed.
- Root cause: The harness-verify skill assumes a clean host with only the docker postgres on 5432. The skill has no fallback when host postgres is present.
- Workaround: stopped `docker compose down`, created `agentfleet_age_08` on the host postgres as a superuser (`psql cowcow02@.../postgres -c "CREATE DATABASE agentfleet_age_08 OWNER agentfleet"`), pointed `DATABASE_URL` at the host, and proceeded. Dropped the per-task DB in teardown the same way.
- Suggested fix: harness-verify should detect `lsof -iTCP:5432 -sTCP:LISTEN` and, if more than one listener (or a non-docker one) is present, either (a) use an alternate host port via `POSTGRES_HOST_PORT=543X` in a compose override, or (b) reuse the host postgres directly. Add a branch to step 2 that probes both and prefers whichever actually contains the per-task DB after CREATE.
- Turns wasted: 3 (docker up → migrate fail → psql debug → lsof → fall back to host postgres).

### [verify] api dev server needs BETTER_AUTH_SECRET in env

- What happened: `pnpm --filter @agentfleet/api dev` crashed at boot with a Zod error demanding `BETTER_AUTH_SECRET` (min 32 chars).
- Root cause: `apps/api/src/env.ts` requires `BETTER_AUTH_SECRET` but the harness-verify skill's env recipe doesn't list it.
- Workaround: added `BETTER_AUTH_SECRET="verify-secret-must-be-32-characters-long-xxxxxx"` to the command.
- Suggested fix: add `BETTER_AUTH_SECRET=<any-32-char-string>` to the harness-verify skill's "Start dev servers" step alongside `PORT`, `DATABASE_URL`, and `WEB_URL`.
- Turns wasted: 1.

### [quality] turbo aborts without packageManager field in root package.json

- What happened: `pnpm turbo typecheck` and `pnpm turbo test` fail before running anything with `x Could not resolve workspaces. '-> Missing 'packageManager' field in package.json`. Reproduces on master too.
- Root cause: root `package.json` has no `packageManager` field; turbo 2.9.5 requires it to resolve the pnpm workspace. Not caused by this ticket.
- Workaround: ran `pnpm --filter @agentfleet/types`, `pnpm --filter @agentfleet/api`, `pnpm --filter web` individually for typecheck and tests. Slightly slower but gives the same coverage.
- Suggested fix: add `"packageManager": "pnpm@9.x.x"` to root package.json in a separate chore. The quality skill doc should also note a fallback chain when `pnpm turbo ...` fails at workspace resolution.
- Turns wasted: 1 (one failed turbo invocation).

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
