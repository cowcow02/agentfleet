---
name: harness-ship
description: "Phase skill: commit changes, push branch, create a GitHub pull request, and watch CI to green"
user-invocable: false
---

## Purpose

Package the work into a well-described PR linked to the Linear ticket, then watch CI to green so the human review gate has a known-good state to evaluate.

**Scope:** ship is **pre-merge only**. PR merge, Railway healthcheck, Linear "Done", and worktree removal happen in `harness-cleanup` after the human approves and the `review` phase flips from waiting to done.

## Steps

1. **Stage and commit:**
   - Stage all changed code files (be specific — don't `git add -A`)
   - **Also stage `.harness/conversations/<task-id>.md`** — this file is part of the deliverable and lives outside the typical source dirs, so it's easy to miss. It is NOT gitignored.
   - Exclude sensitive files (.env, credentials, etc.)
   - Write a commit message:
     - First line: concise summary (e.g., "Add projects table and CRUD API")
     - Body: reference ticket (e.g., "Implements AGE-5")
     - Follow any existing commit style from recent `git log`

2. **Push branch:**

   ```bash
   git push -u origin <branch-name>
   ```

3. **Create PR:**

   ```bash
   gh pr create --title "<concise title>" --body "$(cat <<'EOF'
   ## Summary
   <what changed and why, 1-3 bullets>

   ## Linear ticket
   <ticket-id>: <title>

   ## Changes
   <list of key changes>

   ## Test plan
   - [ ] <checklist of what to verify>

   ## Evidence
   <screenshots or API response summaries from verify phase>
   EOF
   )"
   ```

4. **Capture PR URL** in state outputs

5. **Update Linear ticket** — if the task is a Linear ticket (AGE-XX pattern):
   - Move status to `In Review`
   - Attach the PR link to the ticket using `save_issue` with a `links` entry:
     ```
     links: [{ url: "<pr-url>", title: "Pull Request: <pr-title>" }]
     ```
   - This keeps Linear in sync so the team can see progress without checking GitHub

6. **Watch CI** — wait for all checks to complete on the PR:

   ```bash
   gh pr checks <pr-number> --watch
   ```

   - On success: capture the run URL(s) in state outputs as `ci_runs`
   - On failure: read the failing job's logs (`gh run view <run-id> --log-failed`), attempt one fix, push, and re-watch
   - After 2 fix attempts → surface to human with the failing log

7. **Record to conversation file:**
   - Append to `.harness/conversations/<task-id>.md`:
     ```
     ## Ship
     **Branch:** <branch-name>
     **PR:** <url>
     **Commits:** <count>
     **CI:** pass (run: <url>) / fail
     ```
   - **If you hit friction** (CI failed and required a fix, push rejected, PR creation failed), append an entry to the `## Harness Issues` section at the bottom of the file.

8. **Commit & push the ship-phase conversation update** — step 7 wrote the `## Ship` section to the conversation file _after_ the initial commit in step 1, so those changes are uncommitted. Capture them in a follow-up commit so they survive worktree cleanup and are visible on the PR:

   ```bash
   git add .harness/conversations/<task-id>.md
   git commit -m "chore: record ship phase to <task-id> conversation log"
   git push
   ```

   If there are no changes, skip silently.

9. **Mark ship phase done.** The engine will move to the `review` phase, see status `waiting`, and stop. The human reviews on GitHub and signals approval. Once review flips to `done`, the engine resumes into `harness-cleanup`, which performs the merge, Railway healthcheck, Linear → "Done", and worktree removal.

   **Do not** merge the PR, run Railway checks, or remove the worktree from this skill — those are `harness-cleanup`'s job.

## Checklist

- [ ] All code changes + conversation file committed with descriptive message
- [ ] Branch pushed to origin
- [ ] PR created with ticket reference and summary
- [ ] PR URL + PR number captured in state
- [ ] Linear ticket updated to "In Review" (status + PR link)
- [ ] CI watched to completion — green or surfaced to human
- [ ] Ship-phase conversation update committed and pushed as follow-up
- [ ] Phase marked done (engine will proceed to `review` waiting gate)

## Escalation

- If `git push` fails (e.g., auth issue), tell the human
- If CI fails on the PR, read the failure and attempt to fix — then push again
- After 2 CI fix attempts → surface to human
