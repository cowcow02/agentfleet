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
3. **Create branch** — `git checkout -b age-XX-short-description` (from ticket title, kebab-cased) or `git checkout -b feat/short-description` for plain text
4. **Write state file** — `.harness/state.json` with lifecycle phases and statuses based on profile

### State file format

```json
{
  "task": "AGE-XX",
  "branch": "age-xx-short-description",
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

5. **Invoke `/harness-engine`** with the state file path

### Session Recovery

If `.harness/state.json` already exists and matches the task:

- Read it, find the current phase
- If a phase has `status: "waiting"` (human gate), present context and ask for approval
  - Approved → set to `done`, invoke engine to continue
  - Rejected → set to `blocked` with reason, stop
- Otherwise invoke engine to resume from current phase
