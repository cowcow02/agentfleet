---
name: harness-verify
description: "Phase skill: start the app and verify the deliverable works — browser checks via Claude in Chrome for UI, HTTP calls for API"
user-invocable: false
---

## Purpose

Prove the deliverable works by running the system and checking actual behavior. Verify by proof, not by reading code.

## Steps

1. **Start infrastructure:**

   ```bash
   docker compose up -d   # Postgres
   ```

   Wait for Postgres to be ready.

2. **Run DB migrations:**

   ```bash
   pnpm --filter @agentfleet/db drizzle-kit migrate
   ```

3. **Start dev servers:**

   ```bash
   pnpm --filter @agentfleet/api dev &   # API on port 9900
   pnpm --filter web dev &               # Web on port 3000
   ```

   Wait for both servers to be ready (check health endpoint or port availability).

4. **Verify the deliverable:**

   **For API changes:**
   - Make actual HTTP requests against `http://localhost:9900`
   - Validate response status codes, body structure, and data
   - Test both happy path and error cases relevant to the ticket
   - Capture response evidence in state outputs

   **For UI changes:**
   - Use Claude in Chrome MCP tools (`mcp__claude-in-chrome__*`)
   - Navigate to the relevant page on `http://localhost:3000`
   - Take screenshots as evidence (`mcp__claude-in-chrome__browser_take_screenshot`)
   - Verify visual output matches ticket requirements
   - Check interactive elements work (click, form input, etc.)

   **For both:**
   - Confirm behavior matches the ticket's acceptance criteria
   - Capture evidence (screenshots, response bodies) in state outputs

5. **Build check:**

   ```bash
   pnpm turbo build
   ```

   Production build must succeed.

6. **Shut down:**

   ```bash
   # Kill dev servers (background processes)
   docker compose down
   ```

7. **Record to conversation file:**
   - Append to `.harness/conversations/<task-id>.md`:
     ```
     ## Verify
     **API checks:** <results>
     **UI checks:** <results>
     **Build:** pass/fail
     **Evidence:** <screenshot paths or response summaries>
     ```

## Checklist

- [ ] Infrastructure started (Postgres via Docker)
- [ ] DB migrations applied
- [ ] Dev servers running
- [ ] Deliverable verified against acceptance criteria
- [ ] Evidence captured (screenshots / API responses)
- [ ] Production build succeeds
- [ ] Infrastructure shut down
- [ ] Conversation file updated

## Escalation

- If Docker is not available, skip infrastructure and verify what you can (build + API calls if server starts without DB)
- If the dev server fails to start, diagnose and fix — this is a real bug
- If verification reveals the implementation doesn't meet ACs, go back to implement phase
- Stuck after 2 attempts → surface to human with evidence of what's failing
