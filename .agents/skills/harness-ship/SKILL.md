---
name: harness-ship
description: "Phase skill: commit changes, push branch, and create a GitHub pull request"
user-invocable: false
---

## Purpose

Package the work into a well-described PR linked to the Linear ticket.

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

7. **Verify Railway deployment** — once CI is green, the PR will eventually get merged. For _post-merge_ deploy verification, this step targets the **production** environment after merge. Until merge happens, skip to step 8 and the human review gate.

   When the PR is merged (re-entered after the `review` gate completes), perform:

   ```bash
   # Read the production URLs from state config (set per-repo). Defaults below.
   API_HEALTH_URL="${RAILWAY_API_HEALTH_URL:-https://api.agentfleet.app/health}"
   WEB_HEALTH_URL="${RAILWAY_WEB_HEALTH_URL:-https://app.agentfleet.app/}"

   # Poll API healthcheck until it returns 200 or timeout (max 5 min)
   for i in $(seq 1 30); do
     STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_HEALTH_URL")
     [ "$STATUS" = "200" ] && break
     sleep 10
   done

   # Same for web
   for i in $(seq 1 30); do
     STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_HEALTH_URL")
     [ "$STATUS" = "200" ] && break
     sleep 10
   done
   ```

   - If both healthchecks return 200 within timeout: record `deploy_verified: true` in state
   - If either times out or returns non-200: surface to human with the URL and last status code
   - If `RAILWAY_API_HEALTH_URL` / `RAILWAY_WEB_HEALTH_URL` are not configured, skip with a note in conversation file (no Railway URLs known yet)

8. **Update Linear ticket on deploy success** — once both healthchecks pass, move the ticket to `Done` via `mcp__plugin_linear_linear__save_issue` with `state: "Done"`.

9. **Record to conversation file:**
   - Append to `.harness/conversations/<task-id>.md`:
     ```
     ## Ship
     **Branch:** <branch-name>
     **PR:** <url>
     **Commits:** <count>
     **CI:** pass (run: <url>) / fail
     **Railway deploy:** verified (api: <status>, web: <status>) / skipped (no URLs configured) / failed
     **Linear final status:** Done / In Review
     ```
   - **If you hit friction** (CI failed and required a fix, deploy timeout, healthcheck flake, Linear update failed), append an entry to the `## Harness Issues` section at the bottom of the file.

10. **Commit & push the ship-phase conversation update** — step 9 wrote the `## Ship` section to the conversation file _after_ the initial commit in step 1, so those changes are uncommitted. Capture them in a follow-up commit so they survive worktree cleanup and are visible on the PR:

    ```bash
    git add .harness/conversations/<task-id>.md
    git commit -m "chore: record ship phase to AGE-XX conversation log"
    git push
    ```

    If there are no changes (e.g. ship section was somehow already committed), skip silently.

11. **Set review phase to `waiting`** — human reviews the PR (CI watch and pre-merge gating happens before this; deploy watch happens after)

12. **Cleanup worktree** — if `state.worktree` exists in the state file:

    ```bash
    REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/worktree //')
    WORKTREE_PATH=$(pwd)

    # SAFETY: never remove a worktree with unstaged or untracked files —
    # we lost AGE-11's conversation file this way. Surface to human instead.
    DIRTY=$(git status --porcelain)
    if [ -n "$DIRTY" ]; then
      echo "ERROR: worktree has uncommitted changes — refusing to remove."
      echo "$DIRTY"
      # Stop here, surface to human, do NOT use --force
      exit 1
    fi

    cd "$REPO_ROOT"
    git worktree remove "$WORKTREE_PATH"
    ```

    This frees disk space and avoids stale worktrees accumulating. **Never use `--force`** — if the worktree is dirty, something was missed in steps 1 or 10.

## Checklist

- [ ] All code changes + conversation file committed with descriptive message
- [ ] Branch pushed to origin
- [ ] PR created with ticket reference and summary
- [ ] PR URL captured in state
- [ ] Linear ticket updated to "In Review" (status + PR link)
- [ ] CI watched to completion — green or surfaced to human
- [ ] Railway deploy healthchecked post-merge (or skipped with note)
- [ ] Linear ticket moved to "Done" on deploy success
- [ ] Ship-phase conversation update committed and pushed as follow-up
- [ ] Review phase set to waiting
- [ ] Worktree clean before removal (no `--force`); cleaned up on success

## Escalation

- If `git push` fails (e.g., auth issue), tell the human
- If CI fails on the PR, read the failure and attempt to fix — then push again
- After 2 CI fix attempts → surface to human
- If Railway healthcheck times out or returns non-200, surface to human with URL and last status — do not retry endlessly
- If the worktree is dirty at cleanup time, surface to human with the dirty file list — never `--force` remove. The conversation file is the most common offender; double-check it was staged in step 1 and any post-PR updates were committed in step 10
