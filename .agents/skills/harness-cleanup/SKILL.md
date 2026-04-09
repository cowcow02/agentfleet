---
name: harness-cleanup
description: "Phase skill: post-merge cleanup — merge the approved PR, verify Railway deploy, finalize Linear status, remove worktree"
user-invocable: false
---

## Purpose

After the human approves the PR, finalize the work: merge the PR, verify the Railway deployment is healthy, move the Linear ticket to Done, record the outcome, and remove the worktree.

This phase only runs after the `review` phase has flipped from `waiting` to `done` (i.e. the human gave approval). The agent performs the actual merge — the human's role ends at "approved, go ahead."

## Steps

1. **Read state outputs** — pick up `pr_number`, `pr_url`, `branch`, `worktree`, ticket id, and any `RAILWAY_*` config from earlier phases.

2. **Confirm PR is ready to merge:**

   ```bash
   gh pr view <pr-number> --json state,mergeable,mergeStateStatus
   ```

   - If `state == "MERGED"` already (rare — manual merge by human): skip to step 4
   - If `mergeable != "MERGEABLE"`: surface to human with the reason, set phase to `blocked`
   - Otherwise proceed

3. **Merge the PR:**

   ```bash
   gh pr merge <pr-number> --squash --delete-branch
   ```

   - `--squash` keeps master history linear
   - `--delete-branch` removes the remote branch (the worktree's local branch is removed in step 8)

4. **Sync the main repo to merged master** — subsequent commits (e.g. cleanup section) land on up-to-date master, not on the now-stale feature branch.

   The main repo is the **common dir's parent** of the worktree — `git rev-parse --git-common-dir` gives `<repo>/.git`, so its parent is the main repo root:

   ```bash
   REPO_ROOT=$(cd "$WORKTREE_PATH" && dirname "$(git rev-parse --git-common-dir)")
   git -C "$REPO_ROOT" fetch origin master
   git -C "$REPO_ROOT" merge --ff-only origin/master
   ```

   This is more robust than parsing `git worktree list --porcelain` (which assumed the first entry was the main repo — true today but not guaranteed if the worktree ordering ever changes).

5. **Verify Railway deployment** — poll API + Web healthchecks until 200 or 5-minute timeout:

   ```bash
   API_HEALTH_URL="${RAILWAY_API_HEALTH_URL:-https://api.agentfleet.app/health}"
   WEB_HEALTH_URL="${RAILWAY_WEB_HEALTH_URL:-https://app.agentfleet.app/}"

   API_STATUS=000
   for i in $(seq 1 30); do
     API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_HEALTH_URL")
     [ "$API_STATUS" = "200" ] && break
     sleep 10
   done

   WEB_STATUS=000
   for i in $(seq 1 30); do
     WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_HEALTH_URL")
     [ "$WEB_STATUS" = "200" ] && break
     sleep 10
   done
   ```

   - Both 200 within timeout → record `deploy_verified: true` in state outputs with both URLs and statuses
   - Either timeout / non-200 → surface to human with the URL and last status code, set phase to `blocked`
   - If `RAILWAY_API_HEALTH_URL` / `RAILWAY_WEB_HEALTH_URL` are not configured for this repo, skip with a note in the conversation file

6. **Update Linear ticket to "Done"** — only on Railway success (or on skipped Railway with explicit note). Use `mcp__plugin_linear_linear__save_issue` with `state: "Done"`. Skip entirely for plain-text tasks (no Linear ticket).

7. **Record to conversation file** — the conversation file is now on master (it was committed by `harness-ship` and then merged). Update the master copy in the main repo, NOT the worktree copy:

   ```bash
   cd "$REPO_ROOT"
   ```

   **Insert before** the `## Harness Issues` marker in `.harness/conversations/<task-id>.md` (use Edit tool with `## Harness Issues` as the anchor — do NOT literally append, that would land below the issues section):

   ```
   ## Cleanup
   **Merged at:** <timestamp>
   **Railway deploy:** verified (api: <api_status>, web: <web_status>) / skipped (no URLs configured) / failed
   **Linear final status:** Done
   ```

   - **If you hit friction** (merge blocked, deploy timeout, healthcheck flake, Linear update failed, worktree dirty), append an entry to the **literal end** of the file — it will land inside the `## Harness Issues` section since that section is last.

8. **Commit the cleanup section to master:**

   ```bash
   git add .harness/conversations/<task-id>.md
   git commit -m "chore: record cleanup phase to <task-id> conversation log"
   git push
   ```

   If there are no changes, skip silently.

9. **Remove worktree** — only after every step above succeeded. Hard safety check first:

   ```bash
   cd "$WORKTREE_PATH"
   DIRTY=$(git status --porcelain)
   if [ -n "$DIRTY" ]; then
     echo "ERROR: worktree has uncommitted changes — refusing to remove."
     echo "$DIRTY"
     # Surface to human, do NOT use --force
     exit 1
   fi
   cd "$REPO_ROOT"
   git worktree remove "$WORKTREE_PATH"
   ```

   **Never use `--force`.** A dirty worktree at this point means something was missed in `harness-ship` step 1 (staging the conversation file) or in step 7 above (committing the cleanup section). Surface and investigate.

## Checklist

- [ ] PR merged (or already merged by human)
- [ ] Main repo synced to merged master
- [ ] Railway deploy verified (or skipped with note)
- [ ] Linear ticket moved to "Done" (Linear tickets only)
- [ ] Conversation file updated with `## Cleanup` section
- [ ] Cleanup commit pushed to master
- [ ] Worktree clean before removal; removed on success

## Escalation

- If `gh pr merge` fails (branch protection, conflicts, failing checks), surface to human with the error — do not bypass branch protection
- If the human approved but said "hold off on merging," set cleanup phase to `blocked` with that reason and stop
- If Railway healthcheck times out or returns non-200, surface to human with URL and last status — do not retry endlessly past the 5-minute window
- If the worktree is dirty at cleanup time, surface with the file list — never `--force` remove
