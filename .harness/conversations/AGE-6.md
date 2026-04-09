# AGE-6: Dashboard redesign: ticket-first layout

## Understand

**Scope:** Redesign dashboard to make Linear/Jira tickets the primary content area. Enhance stats cards. Restructure layout for manager view. No API/schema changes needed.

**Files:**

- `apps/web/app/(dashboard)/dashboard/page.tsx` — main dashboard page
- `apps/web/components/dispatch-form.tsx` — dispatch form with manual/linear tabs
- `apps/web/components/stats-cards.tsx` — stats cards showing 5 metrics
- `apps/web/components/__tests__/dispatch-form.test.tsx` — extensive tests
- `apps/web/components/__tests__/stats-cards.test.tsx` — stats card tests

**Key patterns:**

- CSS: af-panel/af-panel-header classes, inline styles with CSS custom properties
- Design: warm cream/dark theme, system fonts, compact layouts
- API response already has failed, avgDurationSeconds, totalAgentSeconds (not previously displayed)

## Plan

**Approach:** 3-step bottom-up refactor. (1) Enhance stats-cards to display 7 metrics with duration formatting. (2) Refactor dispatch-form.tsx to remove manual/linear tabs, auto-load Linear issues. (3) Restructure dashboard page layout: stats → tickets hero → fleet/feed/dispatches secondary.

**Test strategy:** TDD at component level. Update stats-cards tests for 7 cards + formatDuration helper. Rewrite dispatch-form tests: no tab buttons, auto-load on mount, Linear issues as primary.

**Files to change:** 5 (3 components + 2 test files)

## Implement

**Tests written:** 20 (7 stats-cards + 13 dispatch-form)
**Files changed:**

- `apps/web/components/stats-cards.tsx` — expanded to 7 stat cards, added formatDuration
- `apps/web/components/__tests__/stats-cards.test.tsx` — 7 tests covering formatting + loading
- `apps/web/components/dispatch-form.tsx` — removed tabs, Linear-first auto-load, "Manual Dispatch" CTA
- `apps/web/components/__tests__/dispatch-form.test.tsx` — 13 tests, tab-free behavior
- `apps/web/app/(dashboard)/dashboard/page.tsx` — tickets hero, 3-col secondary panels

## Quality

**Typecheck:** pass (pre-existing errors in dispatch-list.test.tsx and sidebar.test.tsx — not our files)
**Tests:** 118 passed, 0 failed (web); 169 passed (api); 163 passed (types)
**Lint:** pass (pre-existing errors in settings/page.tsx and use-sse.ts — not our files)
**Format:** pass

## Verify

**UI checks:** All acceptance criteria verified via Chrome browser:

- 7 stat cards with correct labels (including Failed, Avg Duration with "0s" formatting)
- "Tickets" heading (no "Dispatch")
- No Manual/Linear tab switcher
- "Manual Dispatch" CTA button in panel header
- Linear issues auto-loaded on mount (shows config error with "Go to Settings" link — correct)
- 3-column secondary layout: Fleet Overview, Live Feed, Recent Dispatches
- "View all dispatches" link present
  **Evidence:** Screenshot ss_5367v5jm0

## Ship

**Branch:** age-6-dashboard-redesign-ticket-first
**PR:** https://github.com/cowcow02/agentfleet/pull/2
**Commits:** 1 (f9d4f2e)
