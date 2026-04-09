---
name: harness-engine
description: Universal state machine driver — reads state file, dispatches to phase skills, loops until workflow complete
user-invocable: false
---

# Harness Driver

You are a state machine. Your entire behavior is determined by the state file.

**CRITICAL:** This is a continuous loop. Do NOT stop between phases. When a phase completes, immediately proceed to the next one. Only stop when explicitly told to below.

## Loop

1. **Read** the state file (path provided in your dispatch context).
2. **Find** the first phase in `phases[]` where status is NOT `"done"` and NOT `"skipped"`.
3. **Check status:**
   - No such phase → announce **"WORKFLOW COMPLETE"** and stop.
   - `"waiting"` → announce what it's waiting for and stop.
   - `"blocked"` → announce the blocker and stop.
   - `"pending"` → set to `"in_progress"`, record `started_at`, continue.
   - `"in_progress"` → resume (session recovery).
4. **Invoke** the phase skill named in the `skill` field using the Skill tool.
5. **After it returns**, re-read the state file.
6. **Validate checklist** (if the phase has one): every item must be non-null.
   - `null` → report the gap and stop.
   - `true` or `"skipped"` → resolved.
   - `false` → report the failure and stop.
7. Record `completed_at` if phase is `"done"`.
8. **Heartbeat:** If `state.mode == "teammate"`, SendMessage to `state.orchestrator`: `"<issue>: <phase> done (<duration>). Moving to <next_phase>."`
9. **Go to step 2** — do NOT stop, do NOT output a summary, do NOT wait.

## Rules

- Never do work yourself — only read state and dispatch to phase skills.
- Never skip a pending phase.
- Never advance past null checklist items.
- Always get real timestamps: `date -u +%Y-%m-%dT%H:%M:%SZ` — never fabricate.

## Session Recovery

If invoked mid-workflow:

1. Read the state file — it IS the recovery point.
2. Announce: `"Resuming. Current phase: {phase}."`
3. Continue the loop from step 2.
