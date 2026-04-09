---
name: implement
description: Launcher — pick up a Linear ticket or task description and drive it through the full phased workflow (pickup → understand → plan → implement → quality → verify → ship).
user-invocable: true
---

## Usage

```
/implement AGE-XX [--profile full|standard|quick]
```

Or with a plain text description:

```
/implement "Add a health check endpoint to the API"
```

## Behavior

1. **Parse input** — extract ticket identifier (AGE-XX pattern) or use as plain text description
2. **Determine profile** — from `--profile` flag or default to `standard`
   - `full`: pickup → understand → plan (human gate) → implement → quality → verify → ship → review (human gate)
   - `standard`: pickup → understand → plan → implement → quality → verify → ship → review (human gate)
   - `quick`: pickup → implement → quality → verify → ship → review (human gate)
3. **Create worktree** — each agent gets an isolated workspace to avoid overlapping with other agents:
   ```bash
   BRANCH="age-xx-short-description"  # or feat/short-description for plain text
   git worktree add .worktrees/$BRANCH -b $BRANCH
   cd .worktrees/$BRANCH
   pnpm install
   ```

   - The `.worktrees/` directory is gitignored in the repo root
   - Each worktree is named after its branch for easy identification
   - Run `pnpm install` after creation to set up dependencies
4. **Write state file** — `.harness/state.json` (inside the worktree) with lifecycle phases and statuses based on profile

### State file format

```json
{
  "task": "AGE-XX",
  "branch": "age-xx-short-description",
  "worktree": ".worktrees/age-xx-short-description",
  "profile": "standard",
  "phases": [
    { "name": "pickup", "status": "pending" },
    { "name": "understand", "status": "pending" },
    { "name": "plan", "status": "pending" },
    { "name": "implement", "status": "pending" },
    { "name": "quality", "status": "pending" },
    { "name": "verify", "status": "pending" },
    { "name": "ship", "status": "pending" }
  ],
  "outputs": {}
}
```

Skipped phases (based on profile) get `{ "status": "skipped", "reason": "profile:quick" }`.

5. **Change working directory** — `cd` into the worktree before invoking the engine so all phase skills operate in the isolated workspace
6. **Invoke `/harness-engine`** with the state file path

### Worktree Cleanup

After the workflow completes (ship phase done or workflow aborted):

```bash
cd <repo-root>
git worktree remove .worktrees/$BRANCH
```

The `/harness-ship` phase should handle cleanup after pushing and creating the PR.

### Session Recovery

If `.harness/state.json` already exists in the worktree and matches the task:

- `cd` into the worktree first
- Read it, find the current phase
- If a phase has `status: "waiting"` (human gate), present context and ask for approval
  - Approved → set to `done`, invoke engine to continue
  - Rejected → set to `blocked` with reason, stop
- Otherwise invoke engine to resume from current phase

If the worktree path is recorded in the state file but doesn't exist (e.g., was cleaned up), recreate it:

```bash
git worktree add .worktrees/$BRANCH $BRANCH  # reattach existing branch
cd .worktrees/$BRANCH
pnpm install
```
