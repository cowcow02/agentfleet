# Contributing to AgentFleet

## Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 15+

## Getting Started

```bash
# Clone the repo
git clone https://github.com/your-org/agentfleet.git
cd agentfleet

# Install dependencies
pnpm install

# Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Run database migrations
pnpm --filter db db:migrate

# Start all services in dev mode
pnpm dev
```

## Project Structure

```
agentfleet/
  apps/
    api/       # Hono REST API + WebSocket server
    web/       # Next.js frontend
    daemon/    # Node.js background agent runner
  packages/
    db/        # Drizzle ORM schema + migrations
    types/     # Shared Zod schemas and TypeScript types
```

## Branch Naming

- `feature/<description>` -- new functionality
- `fix/<description>` -- bug fixes
- `refactor/<description>` -- code restructuring
- `docs/<description>` -- documentation changes
- `chore/<description>` -- tooling, dependencies, CI

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add webhook retry logic
fix: resolve auth token expiry race condition
refactor: extract dispatch queue into shared module
docs: update API route documentation
chore: upgrade drizzle-orm to v0.35
```

## Pull Request Process

1. Create a feature branch from `main`.
2. Make your changes with clear, atomic commits.
3. Ensure `pnpm build` and `pnpm typecheck` pass.
4. Run `pnpm format:check` to verify formatting.
5. Open a PR against `main` with a clear description.
6. Request review from at least one maintainer.

## Code Style

- Prettier runs automatically on staged files via husky + lint-staged.
- Run `pnpm format` to format the entire codebase manually.
- TypeScript strict mode is enabled across all packages.
