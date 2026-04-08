# AgentFleet v1 — Product Roadmap

**Last updated:** 2026-04-08
**Linear project:** [AgentFleet v1](https://linear.app/agentfleet/project/agentfleet-v1-c923d717bfd6)

## Vision

AgentFleet is a centralized orchestration hub for AI coding agents. Teams connect their project trackers (Linear, Jira) and their developer machines, and the platform automatically routes tickets to the right agents based on configurable workflows. Managers get real-time visibility into agent activity and team performance.

## Milestone Overview

```
Phase 1: Foundation          Phase 2: Intelligence         Phase 3: Scale & Distribution
─────────────────────        ──────────────────────        ─────────────────────────────
AGE-5  Projects               AGE-13 Workflow engine        AGE-12 Jira integration
AGE-9  Project-level config   AGE-17 Member mapping         AGE-14 Batch dispatch
AGE-10 OTLP receiver          AGE-7  Team analytics         AGE-15 CLI distribution
AGE-11 JSONL tailing           AGE-6  Dashboard redesign     AGE-16 Daemon setup UX
                               AGE-8  Manual dispatch modal
```

---

## Phase 1: Foundation

Establish the data model and telemetry infrastructure that everything else depends on.

| Ticket | Title | Priority | Blocked by |
|--------|-------|----------|------------|
| AGE-5  | Add projects concept to hub | High | — |
| AGE-9  | Move Linear/Jira config to project level | Medium | AGE-5 |
| AGE-10 | OTLP telemetry receiver in hub | High | — |
| AGE-11 | Real-time JSONL transcript tailing in daemon | High | — |

**AGE-5** is the keystone — projects are the organizational unit for everything: tracker config, workflows, dispatches, analytics.

**AGE-9** migrates the current team-level Linear config down to projects, setting up multi-project and multi-tracker support.

**AGE-10 + AGE-11** are the two telemetry layers. OTLP gives structured metrics (cost, tokens, tool usage). JSONL tailing gives the conversation narrative (what the agent is doing right now). Both run in real-time. These can be built in parallel with AGE-5/AGE-9.

**Exit criteria:** Projects exist in the hub, tracker config is per-project, and telemetry data flows from daemon to hub in real-time.

---

## Phase 2: Intelligence

Build the smart dispatch and analytics layer on top of the foundation.

| Ticket | Title | Priority | Blocked by |
|--------|-------|----------|------------|
| AGE-17 | Member identity mapping (AgentFleet <-> trackers) | High | — |
| AGE-13 | Workflow engine: trigger -> filter -> route | High | AGE-5, AGE-9, AGE-17 |
| AGE-7  | Dashboard: team performance analytics | High | AGE-10, AGE-11 |
| AGE-6  | Dashboard redesign: ticket-first layout | High | — |
| AGE-8  | Simplify manual dispatch to modal | Medium | — |

**AGE-17** maps AgentFleet members to their Linear/Jira identities via email matching. Required for the workflow engine's assignment-based trigger.

**AGE-13** replaces the current hardcoded dispatch logic with a configurable per-project pipeline: trigger (ticket creation, state change, label added, member assignment) -> filters (state, labels, priority with AND/OR logic) -> agent routing (by assignment, tags, or pool). This is the brain of the platform.

**AGE-7** surfaces per-member analytics for managers: total execution minutes (parallel agents stack), parallel utilization, and throughput. Standard time range selectors (7d, 30d, custom). Powered by OTLP metrics and JSONL data.

**AGE-6 + AGE-8** redesign the dashboard to be ticket-first. Linear/Jira tickets are the primary view. Manual dispatch is demoted to a CTA button that opens a minimal modal (agent selector + optional description).

**Exit criteria:** Tickets automatically route to agents via configurable workflows, managers can see per-member performance, and the dashboard reflects the ticket-first design.

---

## Phase 3: Scale & Distribution

Extend platform reach with Jira support, batch dispatch, and public CLI distribution.

| Ticket | Title | Priority | Blocked by |
|--------|-------|----------|------------|
| AGE-12 | Add Jira integration | Medium | AGE-5, AGE-9 |
| AGE-14 | Daemon-side batch dispatch | Medium | — |
| AGE-18 | Telemetry-driven idle detection | Medium | AGE-11 |
| AGE-15 | CLI public distribution via shell installer | Medium | — |
| AGE-16 | Improve daemon setup instructions | Low | AGE-15 |

**AGE-12** adds Jira as a second tracker option. Webhook receiver, API proxy, and settings UI — following the same patterns as Linear. A webhook payload normalization layer unifies both trackers for the workflow engine.

**AGE-14** enables agents to declare batch support in `agents.yaml`. The daemon queues incoming dispatches and flushes them as a single orchestrated session after a configurable timeout. The hub stays simple — batching is entirely daemon-side.

**AGE-18** replaces the current CPU-based idle detection (best-effort, unreliable) with telemetry-driven detection. Uses JSONL transcript activity and OTLP event flow to accurately distinguish between waiting for human, waiting for API, genuinely idle, and finished states.

**AGE-15** packages the CLI as standalone binaries (macOS/Linux, x64/arm64) distributed via `curl -fsSL https://get.agentfleet.dev | sh`. GitHub Actions builds and publishes to GitHub Releases on version tags.

**AGE-16** improves the post-install onboarding: setup wizard, config validation, and clear documentation.

**Exit criteria:** Platform supports both Linear and Jira teams, advanced users can batch tickets, idle detection is accurate, and anyone can install the CLI with a one-liner.

---

## Dependency Graph

```
AGE-5 (projects)
  └── AGE-9 (project-level config)
        ├── AGE-12 (Jira)
        └── AGE-13 (workflow engine) ← AGE-17 (member mapping)

AGE-10 (OTLP) ──┐
                 ├── AGE-7 (analytics)
AGE-11 (JSONL) ──┤
                 └── AGE-18 (telemetry-driven idle detection)

AGE-6 (dashboard redesign)
AGE-8 (manual dispatch modal)
AGE-14 (batch dispatch)

AGE-15 (CLI distribution)
  └── AGE-16 (setup UX)
```

## Parallel workstreams

Three independent tracks can proceed simultaneously:

1. **Data model track:** AGE-5 -> AGE-9 -> AGE-13/AGE-12
2. **Telemetry track:** AGE-10 + AGE-11 -> AGE-7
3. **Distribution track:** AGE-15 -> AGE-16

The dashboard work (AGE-6, AGE-8) can start anytime but benefits from having the telemetry and workflow engine in place.
