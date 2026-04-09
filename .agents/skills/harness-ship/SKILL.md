---
name: harness-ship
description: "Phase skill: commit changes, push branch, and create a GitHub pull request"
user-invocable: false
---

## Purpose

Package the work into a well-described PR linked to the Linear ticket.

## Steps

1. **Stage and commit:**
   - Stage all changed files (be specific — don't `git add -A`)
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

6. **Record to conversation file:**
   - Append to `.harness/conversations/<task-id>.md`:
     ```
     ## Ship
     **Branch:** <branch-name>
     **PR:** <url>
     **Commits:** <count>
     ```

7. **Set review phase to `waiting`** — human reviews the PR

8. **Cleanup worktree** — if `state.worktree` exists in the state file:
   ```bash
   REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/worktree //')
   WORKTREE_PATH=$(pwd)
   cd "$REPO_ROOT"
   git worktree remove "$WORKTREE_PATH"
   ```
   This frees disk space and avoids stale worktrees accumulating.

## Checklist

- [ ] All changes committed with descriptive message
- [ ] Branch pushed to origin
- [ ] PR created with ticket reference and summary
- [ ] PR URL captured in state
- [ ] Linear ticket updated (status + PR link)
- [ ] Conversation file updated
- [ ] Review phase set to waiting
- [ ] Worktree cleaned up (if applicable)

## Escalation

- If `git push` fails (e.g., auth issue), tell the human
- If CI fails on the PR, read the failure and attempt to fix — then push again
- After 2 CI fix attempts → surface to human
