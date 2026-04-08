## Harness Context

### Repository

Monorepo (pnpm + Turborepo v2):

- `apps/api` — Hono v4 API server (port 9900), better-auth, Drizzle ORM, WebSocket (ws)
- `apps/web` — Next.js 16 + React 19, Tailwind v4, shadcn/ui (port 3000)
- `apps/daemon` — Plain JS daemon, connects to hub via WebSocket
- `packages/db` — Drizzle ORM schema + PostgreSQL (pg driver)
- `packages/types` — Shared Zod schemas (entities, API, WS, SSE)
- `cli/` — Standalone CLI (not in workspace, to be moved to apps/cli)

### Workflow Lifecycle

Every ticket follows: pickup → understand → plan → implement (TDD) → quality → verify → ship → review (human).
Invoke via `/implement AGE-XX`. See `HARNESS.md` for full details.

### Verification

- Type checking: `pnpm turbo typecheck`
- Tests: `pnpm turbo test` (Vitest across api, web, types)
- Lint: `pnpm --filter web lint` (ESLint, web only)
- Format: `pnpm prettier --check`
- Build: `pnpm turbo build`
- Live verification: Docker Compose for Postgres, Claude in Chrome for UI, HTTP calls for API

### Conventions

- Next.js 16 has breaking changes — read `node_modules/next/dist/docs/` before touching frontend code
- Tests: colocated `__tests__/` directories, Vitest, @testing-library/react for web
- API routes: Hono in `apps/api/src/routes/`, register in index.ts
- Shared types: Zod schemas in `packages/types/`, imported by api and web
- Schema changes: update `packages/db/src/schema.ts`, run `drizzle-kit generate`
- Frontend: shadcn/ui components, dark-only theme, `af-*` CSS variables

### Team & Process

- PM: Linear (workspace "AgentFleet", project "AgentFleet v1")
- Auth: better-auth with organizations plugin
- Deploy: Railway (api + web), GitHub Actions for CI
- Branch naming: `age-XX-short-description`
- PRs: require human review before merge

### CI/CD

- GitHub Actions (`test.yml`): types tests → api tests (with Postgres service) → web tests + build
- Deploy: Railway native integration for apps/api and apps/web
- Legacy `hub/` has its own deploy workflow — to be removed

### Project Management

- Linear tickets prefixed AGE-XX
- Roadmap: `docs/roadmap-v1.md` — 16 tickets across 3 phases
- Linear MCP tools available for ticket operations
