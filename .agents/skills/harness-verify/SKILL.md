---
name: harness-verify
description: "Phase skill: start the app on an isolated per-task environment and verify the deliverable works — browser checks via Claude in Chrome for UI, HTTP calls for API"
user-invocable: false
---

## Purpose

Prove the deliverable works by running the system and checking actual behavior. Verify by proof, not by reading code.

**Parallel-safe:** every task runs on isolated ports and an isolated database, derived from the task ID, so multiple agents can verify in parallel without colliding.

## Per-task isolation scheme

Derive a 2-digit slot from the task ID (last two digits, zero-padded):

- `AGE-6` → slot `06`
- `AGE-23` → slot `23`
- `AGE-105` → slot `05`
- Plain-text task (no AGE-XX) → slot `00` (sequential single-runner)

From the slot, derive:

| Resource         | Pattern                                                             | Example (AGE-6)                                                     |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| API port         | `99XX`                                                              | `9906`                                                              |
| Web port         | `30XX`                                                              | `3006`                                                              |
| Postgres DB name | `agentfleet_age_XX`                                                 | `agentfleet_age_06`                                                 |
| `DATABASE_URL`   | `postgres://agentfleet:agentfleet@localhost:5432/agentfleet_age_XX` | `postgres://agentfleet:agentfleet@localhost:5432/agentfleet_age_06` |

The shared `docker compose` Postgres on port `5432` is reused (one Postgres, many DBs).

> **Collision note:** AGE-6 and AGE-106 share slot `06`. Rare in practice — if you spot a collision, surface it; don't silently overwrite.

## Steps

1. **Compute the per-task slot** from the task ID and store the derived values in the state file under `outputs.verify.env`:

   ```json
   {
     "slot": "06",
     "api_port": 9906,
     "web_port": 3006,
     "db_name": "agentfleet_age_06",
     "database_url": "postgres://agentfleet:agentfleet@localhost:5432/agentfleet_age_06"
   }
   ```

2. **Start shared Postgres** (idempotent — reuses an existing container):

   ```bash
   docker compose up -d
   ```

   Wait until `docker compose exec -T postgres pg_isready -U agentfleet` returns ready.

3. **Create the per-task database** (idempotent):

   ```bash
   docker compose exec -T postgres psql -U agentfleet -d postgres -c \
     "CREATE DATABASE agentfleet_age_06" 2>/dev/null || true
   ```

   Replace `06` with the actual slot. The `|| true` swallows the "already exists" error on retries.

4. **Run DB migrations against the per-task DB:**

   ```bash
   DATABASE_URL="postgres://agentfleet:agentfleet@localhost:5432/agentfleet_age_06" \
     pnpm --filter @agentfleet/db drizzle-kit migrate
   ```

5. **Start dev servers with isolated env:**

   ```bash
   # API on isolated port + isolated DB + CORS pointed at isolated web port
   PORT=9906 \
   DATABASE_URL="postgres://agentfleet:agentfleet@localhost:5432/agentfleet_age_06" \
   WEB_URL="http://localhost:3006" \
     pnpm --filter @agentfleet/api dev &

   # Web on isolated port + proxy pointed at isolated API port
   PORT=3006 \
   NEXT_PUBLIC_API_URL="http://localhost:9906" \
     pnpm --filter web dev &
   ```

   Capture both background PIDs so you can shut them down later. Wait for both servers to be ready (poll the port or hit `/health` with curl).

6. **Verify the deliverable** against the isolated environment:

   **For API changes:**
   - Make HTTP requests against `http://localhost:<api_port>` (e.g. `http://localhost:9906`)
   - Validate response status, body structure, data
   - Test happy path + error cases relevant to the ticket
   - Capture response evidence in state outputs

   **For UI changes:**
   - Use Claude in Chrome MCP tools (`mcp__claude-in-chrome__*`)
   - Navigate to `http://localhost:<web_port>` (e.g. `http://localhost:3006`)
   - Take screenshots as evidence
   - Verify visual output matches ticket requirements
   - Check interactive elements work

   **For both:**
   - Confirm behavior matches the ticket's acceptance criteria
   - Capture evidence (screenshots, response bodies) in state outputs

7. **Build check** (uses default config, no isolation needed):

   ```bash
   pnpm turbo build
   ```

   Production build must succeed.

8. **Tear down isolated environment:**

   ```bash
   # Kill the dev server PIDs you captured in step 5
   kill <api_pid> <web_pid> 2>/dev/null || true

   # Drop the per-task database to free space and avoid stale state
   docker compose exec -T postgres psql -U agentfleet -d postgres -c \
     "DROP DATABASE IF EXISTS agentfleet_age_06"
   ```

   Leave the shared `docker compose` Postgres running — other agents may still need it.

9. **Record to conversation file:**
   - **Insert before** the `## Harness Issues` marker in `.harness/conversations/<task-id>.md` (use Edit tool with `## Harness Issues` as the anchor — do NOT literally append, that would land below the issues section):

     ```
     ## Verify
     **Slot:** 06 (api=9906, web=3006, db=agentfleet_age_06)
     **API checks:** <results>
     **UI checks:** <results>
     **Build:** pass/fail
     **Evidence:** <screenshot paths or response summaries>
     ```

   - **If you hit friction** (port still in use after kill, DB drop blocked, dev server crash, slot collision), append an entry to the **literal end** of the file — it will land inside the `## Harness Issues` section since that section is last.

## Checklist

- [ ] Per-task slot computed and stored in state
- [ ] Shared Postgres started
- [ ] Per-task database created
- [ ] DB migrations applied to per-task DB
- [ ] Dev servers running on isolated ports with isolated DATABASE_URL
- [ ] Deliverable verified against acceptance criteria on isolated env
- [ ] Evidence captured (screenshots / API responses)
- [ ] Production build succeeds
- [ ] Dev servers killed
- [ ] Per-task database dropped
- [ ] Conversation file updated

## Escalation

- If Docker is not available, skip infrastructure and verify what you can (build + API calls if server starts without DB)
- If a port is already in use even on the isolated slot, another agent may be running with the same slot — surface the collision
- If the dev server fails to start, diagnose and fix — this is a real bug
- If verification reveals the implementation doesn't meet ACs, go back to implement phase
- Stuck after 2 attempts → surface to human with evidence of what's failing
