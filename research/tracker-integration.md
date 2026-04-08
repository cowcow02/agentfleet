# Tracker Integration Research

## Overview: Three Platforms

AgentFleet needs to receive tickets from and post updates back to Jira, Linear, and GitHub Issues. Each platform has different APIs, webhook mechanisms, and authentication models.

## 1. Jira Cloud

### REST API v3

**Base URL:** `https://{your-domain}.atlassian.net/rest/api/3/`

**Key endpoints:**

| Endpoint | Method | Purpose |
|---|---|---|
| `/issue/{issueIdOrKey}` | GET | Read issue details |
| `/issue/{issueIdOrKey}` | PUT | Update issue fields |
| `/issue/{issueIdOrKey}/transitions` | GET | Get available status transitions |
| `/issue/{issueIdOrKey}/transitions` | POST | Transition issue to new status |
| `/issue/{issueIdOrKey}/comment` | POST | Add comment |
| `/search` | POST | JQL search |

### Authentication Options

| Method | Use Case | Setup |
|---|---|---|
| **API Token + Basic Auth** | Simplest, good for self-hosted | Generate at https://id.atlassian.com/manage-profile/security/api-tokens |
| **OAuth 2.0 (3LO)** | User-context actions | Register app in Atlassian Developer Console |
| **Atlassian Connect** | Full integration (webhooks + API) | Most complex, requires public URL |

**Recommendation for AgentFleet:** API Token + Basic Auth for the MVP. Simple to configure, works with all REST API endpoints. OAuth 2.0 can be added later if user-context actions are needed.

```typescript
// Basic Auth with API token
const headers = {
  'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
  'Content-Type': 'application/json',
};
```

### Status Transitions (Critical Nuance)

Jira does NOT support setting a status directly. You must use transition IDs:

```typescript
// Step 1: Get available transitions for the issue
const response = await fetch(
  `${jiraUrl}/rest/api/3/issue/${issueKey}/transitions`,
  { headers }
);
const { transitions } = await response.json();
// transitions: [{ id: "31", name: "In Progress" }, { id: "41", name: "Done" }]

// Step 2: Execute the transition by ID
await fetch(`${jiraUrl}/rest/api/3/issue/${issueKey}/transitions`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    transition: { id: "31" },  // Must use the transition ID, not the status name
    update: {
      comment: [{
        add: {
          body: {
            type: "doc",
            version: 1,
            content: [{
              type: "paragraph",
              content: [{ type: "text", text: "Agent started working on this issue." }]
            }]
          }
        }
      }]
    }
  }),
});
```

**Why this matters:** Transition IDs vary between Jira projects and workflows. You cannot hardcode "In Progress = 31". AgentFleet must query transitions dynamically for each issue before transitioning.

### Custom Fields

Custom fields use IDs like `customfield_10001`. To find field IDs:

```typescript
// Get all fields
const fields = await fetch(`${jiraUrl}/rest/api/3/field`, { headers });
// Find the one you need by name, e.g., "Acceptance Criteria"
```

### JQL for Polling (Fallback to Webhooks)

```
project = PROJ AND status = "To Do" AND labels = "agent-ready" ORDER BY priority DESC
```

### Webhook Setup

```typescript
// Register webhook via REST API
const webhook = await fetch(`${jiraUrl}/rest/api/3/webhook`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    webhooks: [{
      jqlFilter: 'project = PROJ',
      events: ['jira:issue_created', 'jira:issue_updated', 'comment_created'],
      url: 'https://hub.example.com/webhooks/jira',
    }]
  }),
});
```

**Webhook events payload:** Includes `issue`, `changelog` (field changes), `comment`, `user` (actor).

### Node.js Library: jira.js

```typescript
import { Version3Client } from 'jira.js';

const client = new Version3Client({
  host: 'https://your-domain.atlassian.net',
  authentication: {
    basic: { email: 'user@example.com', apiToken: 'your-api-token' },
  },
});

// Get issue
const issue = await client.issues.getIssue({ issueIdOrKey: 'PROJ-123' });

// Add comment
await client.issueComments.addComment({
  issueIdOrKey: 'PROJ-123',
  body: {
    type: 'doc',
    version: 1,
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'Agent update: PR created.' }],
    }],
  },
});

// Transition
await client.issues.doTransition({
  issueIdOrKey: 'PROJ-123',
  transition: { id: '31' },
});
```

## 2. Linear

### GraphQL API

**Endpoint:** `https://api.linear.app/graphql`

**Authentication:**
- Personal API Key (for development/testing)
- OAuth 2.0 (for production integrations)

```typescript
// Using @linear/sdk
import { LinearClient } from '@linear/sdk';

const linear = new LinearClient({ apiKey: 'lin_api_xxx' });

// Get issue
const issue = await linear.issue('ISSUE-ID');
console.log(issue.title, issue.state?.name, issue.labels);

// Update issue state
await linear.updateIssue('ISSUE-ID', {
  stateId: 'STATE-ID',  // Must use state ID, similar to Jira transitions
});

// Add comment
await linear.createComment({
  issueId: 'ISSUE-ID',
  body: 'Agent update: Working on implementation.',
});

// Search issues
const issues = await linear.issues({
  filter: {
    team: { key: { eq: 'PROJ' } },
    state: { name: { eq: 'Todo' } },
    labels: { some: { name: { eq: 'agent-ready' } } },
  },
});
```

### GraphQL Queries (without SDK)

```graphql
# Get issue with details
query {
  issue(id: "ISSUE-ID") {
    id
    identifier
    title
    description
    state { id name }
    labels { nodes { id name } }
    assignee { id name }
    project { id name }
  }
}

# Update issue state
mutation {
  issueUpdate(id: "ISSUE-ID", input: { stateId: "STATE-ID" }) {
    success
    issue { id state { name } }
  }
}

# Create comment
mutation {
  commentCreate(input: { issueId: "ISSUE-ID", body: "Agent update" }) {
    success
    comment { id body }
  }
}

# List workflow states for a team
query {
  team(id: "TEAM-ID") {
    states { nodes { id name type } }
  }
}
```

### Webhook Setup

Via UI: Linear Settings -> API -> Webhooks -> Create
Via API:

```graphql
mutation {
  webhookCreate(input: {
    url: "https://hub.example.com/webhooks/linear"
    teamId: "TEAM-ID"
    resourceTypes: ["Issue", "Comment"]
  }) {
    success
    webhook { id enabled }
  }
}
```

**Webhook payload structure:**
```json
{
  "action": "update",
  "type": "Issue",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "data": {
    "id": "xxx",
    "identifier": "PROJ-123",
    "title": "Implement feature X",
    "state": { "id": "xxx", "name": "In Progress" }
  },
  "updatedFrom": {
    "stateId": "old-state-id"
  },
  "url": "https://linear.app/team/issue/PROJ-123"
}
```

**Signature verification:** HMAC-SHA256 via `Linear-Signature` header (see auth-security.md).

**Retry policy:** 3 attempts with backoff (1 min, 1 hour, 6 hours).

### Linear MCP Server

Linear provides an official MCP server at `https://mcp.linear.app/mcp`. This could be useful if running agents that use MCP tools directly, but for the hub's webhook receiver and API calls, the SDK is more appropriate.

### OAuth 2.0 Flow

```typescript
// 1. Redirect user to Linear auth
const authUrl = new URL('https://linear.app/oauth/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', LINEAR_CLIENT_ID);
authUrl.searchParams.set('redirect_uri', 'https://hub.example.com/auth/linear/callback');
authUrl.searchParams.set('scope', 'read write issues:create comments:create');

// 2. Exchange code for token at callback
const tokenResponse = await fetch('https://api.linear.app/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: 'https://hub.example.com/auth/linear/callback',
    client_id: LINEAR_CLIENT_ID,
    client_secret: LINEAR_CLIENT_SECRET,
  }),
});
```

## 3. GitHub Issues

### REST API v3 and GraphQL v4

**REST API key endpoints:**

| Endpoint | Method | Purpose |
|---|---|---|
| `/repos/{owner}/{repo}/issues/{number}` | GET | Read issue |
| `/repos/{owner}/{repo}/issues/{number}` | PATCH | Update issue (labels, state, assignee) |
| `/repos/{owner}/{repo}/issues/{number}/comments` | POST | Add comment |
| `/repos/{owner}/{repo}/issues` | GET | List issues (with query params) |

### Authentication: GitHub App vs PAT

| Aspect | GitHub App | Personal Access Token |
|---|---|---|
| **Rate limit** | 15,000 req/hr per installation | 5,000 req/hr per user |
| **Scope** | Per-repository permission | User-wide access |
| **Webhook** | Built-in webhook receiver | Separate configuration |
| **Identity** | Acts as the app (bot user) | Acts as the user |
| **Rotation** | Installation tokens auto-expire (1hr) | Manual rotation |
| **Setup** | Register GitHub App, install on org | Generate token in settings |

**Recommendation:** Start with a Personal Access Token (fine-grained) for MVP simplicity. Migrate to GitHub App later for better rate limits and bot identity.

### Webhook Setup

**Via GitHub UI:** Repository Settings -> Webhooks -> Add webhook

**Events to subscribe to:**
- `issues` (opened, edited, labeled, assigned)
- `issue_comment` (created)
- `pull_request` (opened, closed, merged)
- `pull_request_review` (submitted)

**Webhook payload:** Includes `action`, `issue`/`pull_request` object, `repository`, `sender`.

### Node.js Integration

```typescript
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: githubToken });

// Get issue
const { data: issue } = await octokit.issues.get({
  owner: 'org',
  repo: 'repo',
  issue_number: 123,
});

// Add comment
await octokit.issues.createComment({
  owner: 'org',
  repo: 'repo',
  issue_number: 123,
  body: 'Agent update: Implementation complete. PR: #456',
});

// Update labels
await octokit.issues.addLabels({
  owner: 'org',
  repo: 'repo',
  issue_number: 123,
  labels: ['agent-in-progress'],
});

// Close issue
await octokit.issues.update({
  owner: 'org',
  repo: 'repo',
  issue_number: 123,
  state: 'closed',
});
```

## Unified Tracker Abstraction

### Interface Design

```typescript
interface TrackerClient {
  platform: 'jira' | 'linear' | 'github';

  // Read
  getTicket(id: string): Promise<Ticket>;
  searchTickets(query: TicketQuery): Promise<Ticket[]>;

  // Write
  updateStatus(ticketId: string, status: TicketStatus): Promise<void>;
  addComment(ticketId: string, body: string): Promise<void>;
  addLabels(ticketId: string, labels: string[]): Promise<void>;
}

interface Ticket {
  id: string;
  externalId: string;     // PROJ-123, ENG-456, #789
  source: 'jira' | 'linear' | 'github';
  title: string;
  description: string;
  status: TicketStatus;
  labels: string[];
  assignee?: string;
  url: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  project?: string;
  acceptanceCriteria?: string;
  rawData: unknown;       // Platform-specific full payload
}

type TicketStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';

// Platform-specific status mapping
const statusMapping = {
  jira: {
    todo: ['To Do', 'Open', 'Backlog'],
    in_progress: ['In Progress', 'In Development'],
    in_review: ['In Review', 'Code Review'],
    done: ['Done', 'Closed', 'Resolved'],
    cancelled: ['Cancelled', 'Won\'t Do'],
  },
  linear: {
    todo: ['Todo', 'Backlog'],
    in_progress: ['In Progress'],
    in_review: ['In Review'],
    done: ['Done'],
    cancelled: ['Cancelled'],
  },
  github: {
    todo: ['open'],
    in_progress: ['open'],  // GitHub has no "in progress" -- use labels
    in_review: ['open'],
    done: ['closed'],
    cancelled: ['closed'],  // Use "not planned" close reason
  },
};
```

### Webhook Event Normalization

```typescript
interface NormalizedWebhookEvent {
  platform: 'jira' | 'linear' | 'github';
  action: 'created' | 'updated' | 'commented' | 'labeled';
  ticket: {
    id: string;
    externalId: string;
    title: string;
    status: TicketStatus;
    labels: string[];
    url: string;
  };
  changes?: {
    status?: { from: TicketStatus; to: TicketStatus };
    labels?: { added: string[]; removed: string[] };
    assignee?: { from?: string; to?: string };
  };
  comment?: {
    body: string;
    author: string;
  };
  rawPayload: unknown;
}

// Normalize Jira webhook
function normalizeJiraEvent(payload: any): NormalizedWebhookEvent {
  const issue = payload.issue;
  return {
    platform: 'jira',
    action: payload.webhookEvent.includes('created') ? 'created' : 'updated',
    ticket: {
      id: issue.id,
      externalId: issue.key,
      title: issue.fields.summary,
      status: mapJiraStatus(issue.fields.status.name),
      labels: issue.fields.labels || [],
      url: `${jiraUrl}/browse/${issue.key}`,
    },
    changes: payload.changelog
      ? parseJiraChangelog(payload.changelog)
      : undefined,
    rawPayload: payload,
  };
}

// Normalize Linear webhook
function normalizeLinearEvent(payload: any): NormalizedWebhookEvent {
  return {
    platform: 'linear',
    action: payload.action === 'create' ? 'created' : 'updated',
    ticket: {
      id: payload.data.id,
      externalId: payload.data.identifier,
      title: payload.data.title,
      status: mapLinearStatus(payload.data.state?.name),
      labels: payload.data.labels?.map((l: any) => l.name) || [],
      url: payload.url,
    },
    changes: payload.updatedFrom
      ? { status: { from: mapLinearStatus(payload.updatedFrom.stateName), to: mapLinearStatus(payload.data.state?.name) } }
      : undefined,
    rawPayload: payload,
  };
}

// Normalize GitHub webhook
function normalizeGithubEvent(payload: any): NormalizedWebhookEvent {
  const issue = payload.issue;
  return {
    platform: 'github',
    action: payload.action === 'opened' ? 'created' : 'updated',
    ticket: {
      id: issue.id.toString(),
      externalId: `#${issue.number}`,
      title: issue.title,
      status: issue.state === 'open' ? 'todo' : 'done',
      labels: issue.labels.map((l: any) => l.name),
      url: issue.html_url,
    },
    rawPayload: payload,
  };
}
```

## Dispatch Routing Logic

The hub matches incoming tickets to agents based on labels/tags:

```typescript
interface RoutingRule {
  id: string;
  source: 'jira' | 'linear' | 'github' | '*';
  matchLabels?: string[];        // Ticket must have ALL of these labels
  matchProject?: string;         // Project key pattern (e.g., "BACKEND-*")
  agentTag: string;              // Route to agents with this tag
  priority: number;              // Higher = checked first
}

function findMatchingAgent(
  event: NormalizedWebhookEvent,
  rules: RoutingRule[],
  fleet: FleetState
): { agentId: string; machineId: string } | null {
  // Sort rules by priority (highest first)
  const sortedRules = rules
    .filter(r => r.source === '*' || r.source === event.platform)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    // Check label match
    if (rule.matchLabels) {
      const hasAllLabels = rule.matchLabels.every(
        label => event.ticket.labels.includes(label)
      );
      if (!hasAllLabels) continue;
    }

    // Check project match
    if (rule.matchProject) {
      const pattern = new RegExp(
        '^' + rule.matchProject.replace('*', '.*') + '$'
      );
      if (!pattern.test(event.ticket.externalId)) continue;
    }

    // Find available agent with matching tag
    const agent = fleet.getAvailableAgent(rule.agentTag);
    if (agent) return agent;
  }

  return null; // No matching rule or no available agent
}
```

## Dependencies

```
jira.js                 # Jira Cloud REST API client
@linear/sdk             # Linear GraphQL SDK
@octokit/rest           # GitHub REST API client
```

## mcp-ticketer Evaluation

`mcp-ticketer` (npm) provides a unified interface across Jira, Linear, GitHub, and Asana with a universal ticket model. However:

**Pros:**
- Already solves the abstraction problem
- Supports all three target platforms
- Active development

**Cons:**
- MCP-oriented (designed for AI agent tool use, not webhook handling)
- Does not handle inbound webhooks
- Adds a dependency we would need to wrap anyway
- Our abstraction is simpler (we only need read/update/comment, not full CRUD)

**Recommendation:** Build our own thin abstraction using the platform-specific SDKs (`jira.js`, `@linear/sdk`, `@octokit/rest`). The unified interface is straightforward (see above), and we maintain full control over webhook normalization.

## Sources

- [Jira Cloud REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-webhooks/)
- [Jira Webhooks Guide 2025](https://inventivehq.com/blog/jira-webhooks-guide)
- [jira.js - GitHub](https://github.com/mrrefactoring/jira.js/)
- [Linear API and Webhooks](https://linear.app/docs/api-and-webhooks)
- [Linear Developers - GraphQL](https://linear.app/developers/graphql)
- [Linear Webhooks](https://linear.app/developers/webhooks)
- [Linear Webhooks Guide 2025](https://inventivehq.com/blog/linear-webhooks-guide)
- [GitHub Webhooks](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [GitHub App vs PAT](https://github.com/orgs/community/discussions/109668)
- [Building a GitHub App that Responds to Webhooks](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events)
- [mcp-ticketer - GitHub](https://github.com/bobmatnyc/mcp-ticketer)
