# Tracker Adapters

Tracker adapters are the hub-side plugins that connect AgentFleet to project management tools. Each adapter translates between a specific platform's API and AgentFleet's common `NormalizedTicket` format. This document describes the adapter interface, the NormalizedTicket format, and the specifics of each supported platform.

## Adapter Interface

Every tracker adapter implements a common interface with five operations:

### configure()

Sets up the integration between a project and the tracker. This includes the platform-specific connection details and the status mapping that translates platform-specific statuses into AgentFleet's normalized status set.

This is typically invoked through the dashboard's setup wizard when a team lead creates a new project integration.

### receiveWebhook(payload, headers)

Parses a platform-specific webhook payload and returns a `NormalizedTicket` along with an event type (created, updated, transitioned, commented).

This is the primary inbound path. When the tracker fires a webhook, the hub routes the raw HTTP payload to the appropriate adapter based on the project's `tracker_type`.

Returns `null` if the webhook event is not relevant (e.g., a field change that does not affect routing or status).

### poll()

Fetches recent ticket changes from the tracker via its API. Returns an array of `NormalizedTicket` objects.

This is the fallback mechanism for platforms that do not support webhooks reliably, or for catching events that were missed due to webhook delivery failures. Polling runs on a configurable interval (default: 60 seconds).

### transition(ticketId, toStatus)

Updates a ticket's status in the tracker. The adapter translates from AgentFleet's normalized status back to the platform-specific status value using the configured status map.

Used by the hub to move tickets through their lifecycle. For example, when an agent starts working, the hub transitions the ticket to `in_progress`. When a PR is created, it transitions to `in_review`.

### comment(ticketId, body)

Posts a comment on a ticket in the tracker. The body is markdown.

Used by the hub to post updates: agent assignment notifications, PR links, completion summaries, and error reports.

## NormalizedTicket

The `NormalizedTicket` is the common format that all tracker adapters produce. The rest of the system (routing engine, dispatcher, dashboard) only works with this format.

```
NormalizedTicket {
  id: string                      // Tracker-specific ID ("KIP-123", "ACME-456", "#42")
  title: string                   // Ticket title / summary
  description: string             // Full description in markdown
  acceptanceCriteria: string[]    // List of acceptance criteria (may be empty)
  priority: Priority              // urgent | high | medium | low
  labels: string[]                // Ticket labels / tags from the tracker
  assignee: string                // Assignee email (empty string if unassigned)
  status: NormalizedStatus        // See status definitions below
  url: string                     // Deeplink to the ticket in the tracker
  metadata: Record<string, any>   // Platform-specific data (for adapter use only)
}
```

### NormalizedStatus

AgentFleet normalizes all tracker statuses into a fixed set:

| Status | Meaning |
|--------|---------|
| `backlog` | Ticket exists but is not ready for work |
| `todo` | Ticket is ready for work (this is the default routing trigger) |
| `in_progress` | Work has started (agent is running) |
| `in_review` | Work is done, awaiting human review (PR created) |
| `done` | Ticket is complete (PR merged, verified) |
| `cancelled` | Ticket was cancelled or won't be done |

### Priority

| Priority | Meaning |
|----------|---------|
| `urgent` | Must be handled immediately. Jumps the queue. |
| `high` | Important. Dispatched before medium/low. |
| `medium` | Normal priority. Default if the tracker does not specify. |
| `low` | Can wait. Dispatched when higher-priority work is done. |

## Status Mapping

Each tracker has its own status vocabulary. A Jira instance might use "Selected for Sprint" where Linear uses "Todo" and GitHub Issues uses an "open" state. The status map translates these platform-specific values into AgentFleet's normalized statuses.

### Why Mapping Is Necessary

Every team customizes their tracker differently. Even within the same platform:
- One Jira instance might have statuses: "To Do", "In Progress", "In Review", "Done"
- Another might have: "Backlog", "Selected for Sprint", "Ready for Dev", "In Development", "Code Review", "QA", "Released"

AgentFleet cannot assume a fixed set of source statuses. The status map is configured per project and is part of the project's tracker configuration.

### Map Format

```yaml
status_map:
  backlog:
    - "Backlog"
    - "Icebox"
  todo:
    - "To Do"
    - "Selected for Sprint"
    - "Ready for Dev"
  in_progress:
    - "In Progress"
    - "In Development"
    - "Active"
  in_review:
    - "In Review"
    - "Code Review"
    - "QA"
  done:
    - "Done"
    - "Closed"
    - "Released"
    - "Resolved"
  cancelled:
    - "Cancelled"
    - "Won't Do"
    - "Duplicate"
```

Each normalized status maps to one or more platform-specific statuses. When the adapter receives a webhook, it looks up the ticket's current platform status in this map to determine the normalized status.

### Reverse Mapping (Transitions)

When the hub needs to transition a ticket (e.g., move from `todo` to `in_progress`), the adapter needs to know which platform-specific status to target. By default, it uses the FIRST entry in the map for the target normalized status.

```yaml
# To transition to in_progress, the adapter will use "In Progress"
# (the first entry under in_progress)
in_progress:
  - "In Progress"     # <-- this one is used for transitions
  - "In Development"
  - "Active"
```

Projects can override this with an explicit transition target:

```yaml
transition_targets:
  in_progress: "In Development"
  in_review: "Code Review"
  done: "Released"
```

## Jira Adapter

### Configuration

```yaml
tracker_type: jira
tracker_config:
  instance: https://acme.atlassian.net
  project_key: ACME
  api_email: bot@acme.com
  api_token: jira_xxxxxxxxxxxx
  webhook_secret: whsec_xxxxxxxxxxxx
```

### Webhook Events

The Jira adapter handles these webhook events:

| Jira Event | AgentFleet Action |
|------------|-------------------|
| `jira:issue_created` | Create NormalizedTicket, trigger routing if status maps to `todo` |
| `jira:issue_updated` (status change) | Update NormalizedTicket status, trigger routing if transitioning to `todo` |
| `jira:issue_updated` (field change) | Update NormalizedTicket fields (labels, priority, assignee) |
| `comment_created` | Forward comment content for review feedback iteration |

### Jira-Specific Complications

**Customizable workflows.** Jira allows teams to define arbitrary workflows with custom statuses. This is why the status map is essential and must be configured per project.

**Transitions require transition IDs.** Jira's API does not accept status names for transitions. The adapter must first fetch available transitions for the ticket, find the one whose target status matches, and then execute that transition. The adapter caches transition IDs per status to minimize API calls.

**Custom fields.** Some teams store acceptance criteria, story points, or other data in custom fields. The adapter extracts these via configurable field mappings:

```yaml
field_map:
  acceptance_criteria: customfield_10042
  story_points: customfield_10028
```

**Board filtering.** A Jira project may have multiple boards with different filters. The webhook URL can be scoped to a specific JQL filter to only receive events for relevant issues:

```yaml
jql_filter: "project = ACME AND issuetype in (Story, Bug, Task)"
```

### Priority Mapping

```yaml
priority_map:
  urgent: ["Highest", "Blocker"]
  high: ["High"]
  medium: ["Medium"]
  low: ["Low", "Lowest"]
```

## Linear Adapter

### Configuration

```yaml
tracker_type: linear
tracker_config:
  api_key: lin_api_xxxxxxxxxxxx
  team_id: TEAM-123
  webhook_secret: whsec_xxxxxxxxxxxx
```

### Webhook Events

The Linear adapter handles these webhook events:

| Linear Event | AgentFleet Action |
|--------------|-------------------|
| `Issue.create` | Create NormalizedTicket, trigger routing if applicable |
| `Issue.update` (state change) | Update status, trigger routing on `todo` transition |
| `Issue.update` (field change) | Update ticket fields |
| `Comment.create` | Forward comment for review feedback |

### Linear-Specific Details

**Simpler status model.** Linear has a more structured status model than Jira. Each team has a fixed set of workflow states (Backlog, Todo, In Progress, Done, Cancelled). The status map is typically straightforward:

```yaml
status_map:
  backlog: ["Backlog", "Triage"]
  todo: ["Todo"]
  in_progress: ["In Progress"]
  in_review: ["In Review"]
  done: ["Done"]
  cancelled: ["Cancelled", "Duplicate"]
```

**Labels.** Linear labels map directly to the NormalizedTicket labels field.

**Priority.** Linear uses numeric priorities (0-4) which map to:

```yaml
priority_map:
  urgent: [1]      # Urgent
  high: [2]        # High
  medium: [3]      # Medium
  low: [4]         # Low
  # 0 = No priority -> defaults to medium
```

**Sub-issues.** Linear supports sub-issues. The adapter treats each sub-issue as an independent ticket. Parent-child relationships are preserved in the `metadata` field but do not affect routing.

## GitHub Issues Adapter

### Configuration

```yaml
tracker_type: github
tracker_config:
  owner: acme-org
  repo: acme-backend
  webhook_secret: whsec_xxxxxxxxxxxx
  # Authentication uses a GitHub App or PAT
  app_id: 12345
  private_key_path: /path/to/key.pem
```

### Webhook Events

The GitHub Issues adapter handles these webhook events:

| GitHub Event | AgentFleet Action |
|--------------|-------------------|
| `issues.opened` | Create NormalizedTicket, trigger routing if applicable |
| `issues.labeled` | Update labels, re-evaluate routing |
| `issues.assigned` | Update assignee |
| `issues.milestoned` | Update metadata |
| `issue_comment.created` | Forward comment for review feedback |

### GitHub-Specific Details

**No built-in workflow statuses.** GitHub Issues has two states: open and closed. Workflow statuses are typically managed through labels (e.g., "status:todo", "status:in-progress") or GitHub Projects (column-based).

The adapter supports both approaches:

**Label-based status mapping:**

```yaml
status_map:
  backlog: ["status:backlog"]
  todo: ["status:todo", "status:ready"]
  in_progress: ["status:in-progress"]
  in_review: ["status:in-review"]
  done: ["status:done"]
  cancelled: ["status:wontfix", "status:duplicate"]
```

When transitioning, the adapter removes the old status label and adds the new one.

**GitHub Projects integration (optional):**

```yaml
github_project:
  project_number: 5
  status_field: "Status"
  status_map:
    backlog: "Backlog"
    todo: "Todo"
    in_progress: "In Progress"
    in_review: "In Review"
    done: "Done"
```

**Priority via labels.** GitHub Issues does not have a native priority field. The adapter uses labels:

```yaml
priority_labels:
  urgent: ["priority:urgent", "P0"]
  high: ["priority:high", "P1"]
  medium: ["priority:medium", "P2"]
  low: ["priority:low", "P3"]
```

## Writing a Custom Tracker Adapter

To add support for a new project management tool, implement the adapter interface:

```typescript
interface TrackerAdapter {
  /**
   * Configure the integration.
   * Called during project setup.
   */
  configure(config: TrackerConfig): Promise<void>;

  /**
   * Parse an incoming webhook payload.
   * Returns null if the event is not relevant.
   */
  receiveWebhook(
    payload: unknown,
    headers: Record<string, string>
  ): Promise<{
    ticket: NormalizedTicket;
    event: "created" | "updated" | "transitioned" | "commented";
  } | null>;

  /**
   * Poll for recent ticket changes.
   * Used as a fallback when webhooks are unreliable.
   */
  poll(since: Date): Promise<NormalizedTicket[]>;

  /**
   * Transition a ticket's status in the tracker.
   */
  transition(ticketId: string, toStatus: NormalizedStatus): Promise<void>;

  /**
   * Post a comment on a ticket.
   */
  comment(ticketId: string, body: string): Promise<void>;
}
```

### Adapter Registration

Custom adapters are registered with the hub at startup:

```typescript
hub.registerTrackerAdapter("asana", new AsanaAdapter());
hub.registerTrackerAdapter("shortcut", new ShortcutAdapter());
```

After registration, the adapter's `tracker_type` string can be used in project configurations.

## Webhook Security

All tracker adapters verify webhook signatures before processing payloads.

**Jira:** Uses HMAC-SHA256 with the configured webhook secret. The signature is in the `X-Hub-Signature` header.

**Linear:** Uses HMAC-SHA256. The signature is in the `Linear-Signature` header.

**GitHub:** Uses HMAC-SHA256. The signature is in the `X-Hub-Signature-256` header.

If signature verification fails, the adapter rejects the webhook with a 401 response and logs the event for security auditing.

## Outbound Communication

When the hub updates ticket status or posts comments, it uses the tracker's API. Each adapter manages its own API client, authentication, and rate limiting.

### Rate Limiting

Tracker APIs have rate limits. The adapters implement:
- **Request queuing** -- outbound API calls queue and execute within rate limits
- **Backoff** -- on rate limit errors (429), the adapter backs off exponentially
- **Batching** -- where the API supports it, multiple updates are batched into a single request

### Comment Formatting

When the hub posts comments, the adapter formats them for the target platform:

```
Jira:     Atlassian Document Format (ADF) or wiki markup
Linear:   Markdown
GitHub:   GitHub-flavored Markdown
```

A standard comment template:

```markdown
**AgentFleet** dispatched this ticket to `charlie/backend-agent`.

| Detail | Value |
|--------|-------|
| Agent | charlie/backend-agent |
| Type | claude-code |
| Started | 2026-04-08 09:00:15 UTC |

Updates will be posted as the agent progresses.
```

When the agent completes:

```markdown
**AgentFleet** -- agent completed successfully.

| Detail | Value |
|--------|-------|
| Agent | charlie/backend-agent |
| Duration | 25m 30s |
| PR | [#247](https://github.com/acme/backend/pull/247) |
| Branch | `agent/KIP-123-add-user-search` |
```
