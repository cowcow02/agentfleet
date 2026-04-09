## Pickup

**Ticket:** AGE-10 — OTLP telemetry receiver in hub
**Priority:** High
**Blocks:** AGE-7 (Dashboard: team performance analytics)
**Description:** Implement OTLP HTTP/JSON receiver in the Hono API server. Three endpoints (POST /v1/metrics, /v1/logs, /v1/traces) receive OpenTelemetry data from Claude Code instances. New telemetry DB tables linked to dispatch ID. Cumulative usage JSONB on dispatches table. Daemon sets OTLP env vars before spawning Claude Code.

## Understand

**Scope:** New OTLP telemetry endpoints (3 routes), new DB tables, usage column on dispatches, daemon env var additions. ~7 files.
**Files:** schema.ts, telemetry.ts (new), index.ts, api.ts, entities.ts, daemon/index.js, telemetry.test.ts (new)
**Key patterns:** Hono Router instances registered in index.ts. Auth middleware on /api/\*. Drizzle ORM with pg. Tests use createTestApp() + mocked DB. Dispatches table has jsonb columns. OTLP endpoints should NOT require auth (daemon authenticates separately).

## Plan

**Approach:** 5 steps in dependency order — schema first, types, TDD routes, daemon env, route registration.
**Test strategy:** TDD — tests for each OTLP endpoint (valid/invalid payloads, DB storage, usage accumulation). Zod schema tests.
**Files to change:** ~8 (schema.ts, entities.ts, api.ts, telemetry.ts, telemetry.test.ts, index.ts, daemon/index.js, migration)

### Steps

1. **DB Schema**: Add `usage` JSONB to dispatches + 3 new tables (telemetryEvents, telemetryMetrics, telemetrySpans)
2. **Zod schemas**: OTLP payload schemas + DispatchUsage in packages/types
3. **Telemetry routes (TDD)**: POST /v1/metrics, /v1/logs, /v1/traces — API key auth, parse OTLP, store in DB, update dispatch usage
4. **Daemon env vars**: Set OTEL\_\* env vars when spawning Claude Code
5. **Register routes**: Mount telemetry router before auth middleware in index.ts

## Implement

**Tests written:** 10 initially (3 endpoints × auth + payload tests, usage accumulation, tool*calls counting); +4 added later for branch coverage = 14 total
**Files changed:** schema.ts, entities.ts, api.ts, telemetry.ts (new), telemetry.test.ts (new), index.ts, daemon/index.js, dispatch.ts, migration 0003
**Key decisions:** OTLP endpoints use API key auth (afk*_) via X-Dispatch-Id header for dispatch correlation. Mounted before auth middleware at /v1/_. Usage accumulated incrementally from api_request and tool_result events.

## Quality

**Typecheck:** pass (3/3 packages)
**Tests:** 183 passed, 0 failed (20 test files in apps/api after coverage tests added)
**Lint:** pre-existing errors only (not from this PR)
**Format:** pass (after auto-fix)

## Verify

**API checks:** All 6 live HTTP tests passed against running API server with real Postgres

- POST /v1/logs without auth → 401 ✓
- POST /v1/logs without X-Dispatch-Id → 400 ✓
- POST /v1/logs with api_request → 200, event stored, usage updated to {input:5000, output:3200, cost:0.045, requests:1} ✓
- POST /v1/metrics → 200, metric stored ✓
- POST /v1/traces → 200, span stored ✓
- Second /v1/logs (api_request + tool_result) → usage accumulated to {input:6000, output:3700, cost:0.055, requests:2, tool_calls:1} ✓

**Build:** pass (turbo build, web + api)
**Evidence:** SQL queries confirm telemetry_events, telemetry_metrics, telemetry_spans rows + dispatches.usage JSONB column populated correctly

## Ship

**Branch:** age-10-otlp-telemetry-receiver
**PR:** https://github.com/cowcow02/agentfleet/pull/3
**Commits:** 4

- `218e7dd` feat: add OTLP telemetry receiver in hub (initial implementation)
- `d88fca4` fix: make Dispatch.usage nullish to keep existing fixtures valid (CI fix: types-tests)
- `ceababa` test: cover additional OTLP branches to meet coverage threshold (CI fix: api-tests branch coverage 89.02% → 90.74%)
- (this commit) chore: include harness conversation file in PR

## Retro

**Friction encountered:**

1. **Worktree turbo failure** — recreated worktree was missing `packageManager` field in package.json, causing turbo to fail with "Could not resolve workspaces". Worked around by adding the field locally; this should be added to master in a follow-up so future worktrees don't hit it.
2. **Drizzle migrate vs push** — the existing dev DB was created via `drizzle-kit push` (no migration journal), so `drizzle-kit migrate` failed with "relation already exists". Used `drizzle-kit push --force` to apply the schema for verification.
3. **Skipped local coverage check** — quality phase ran tests without `--coverage`, so the branch coverage drop wasn't caught locally. CI caught it after push, requiring two follow-up commits. Should add `pnpm vitest run --coverage` to the harness-quality skill.
4. **Schema-breaking change to shared types** — adding required `usage` field to `DispatchSchema` broke pre-existing fixtures in `@agentfleet/types` SSE/WS tests. Used `.nullish()` instead of `.nullable()` to keep them valid. Lesson: when adding fields to a shared schema with existing test fixtures, default to nullish unless the field is genuinely required at the boundary.
