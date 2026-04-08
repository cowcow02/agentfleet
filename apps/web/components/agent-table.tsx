"use client";

import type { Agent } from "@agentfleet/types";

interface AgentTableProps {
  agents: Agent[];
}

const knownTags = ["backend", "be", "api", "frontend", "fe", "bug", "feature", "question", "explore", "simple", "refactor"];

function tagClass(tag: string): string {
  const t = tag.toLowerCase();
  if (["backend", "be", "api"].includes(t)) return "af-tag af-tag-backend";
  if (["frontend", "fe"].includes(t)) return "af-tag af-tag-frontend";
  if (t === "bug") return "af-tag af-tag-bug";
  if (t === "feature") return "af-tag af-tag-feature";
  if (["question", "explore", "refactor"].includes(t)) return "af-tag af-tag-question";
  if (t === "simple") return "af-tag af-tag-simple";
  return "af-tag af-tag-default";
}

function getStatus(agent: Agent): "online" | "busy" | "offline" {
  if (!agent.online) return "offline";
  if (agent.running > 0) return "busy";
  return "online";
}

export function AgentTable({ agents }: AgentTableProps) {
  if (agents.length === 0) {
    return (
      <div className="af-empty">
        No agents connected. Start a daemon to register agents.
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--af-surface)",
        border: "1px solid var(--af-border-subtle)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Table header */}
      <div
        className="grid items-center"
        style={{
          gridTemplateColumns: "40px 1fr 1fr 1.5fr 0.6fr",
          gap: 12,
          padding: "14px 20px",
          background: "var(--af-surface-elevated)",
          borderBottom: "1px solid var(--af-border-subtle)",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--af-text-tertiary)",
        }}
      >
        <div />
        <div>Agent</div>
        <div>Member</div>
        <div>Tags</div>
        <div style={{ textAlign: "center" }}>Capacity</div>
      </div>

      {/* Table body */}
      <div style={{ maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
        {agents.map((agent) => {
          const status = getStatus(agent);
          const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

          return (
            <div
              key={`${agent.machine}-${agent.name}`}
              className="grid items-center"
              style={{
                gridTemplateColumns: "40px 1fr 1fr 1.5fr 0.6fr",
                gap: 12,
                padding: "14px 20px",
                minHeight: 48,
                borderBottom: "1px solid var(--af-border-subtle)",
                transition: "background 0.1s",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--af-surface-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {/* Status dot */}
              <div className="flex items-center justify-center">
                <div className={`af-dot af-dot-${status}`} />
              </div>

              {/* Agent info */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</div>
                <div style={{ fontSize: 12, color: "var(--af-text-secondary)", marginTop: 2 }}>
                  {agent.description || ""}
                </div>
              </div>

              {/* Member */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{agent.memberName || "\u2014"}</div>
                <div style={{ fontSize: 12, color: "var(--af-text-tertiary)", marginTop: 2 }}>
                  <span
                    style={{
                      fontWeight: 500,
                      color:
                        status === "online"
                          ? "var(--af-success)"
                          : status === "busy"
                            ? "var(--af-warning)"
                            : "var(--af-text-tertiary)",
                    }}
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>

              {/* Tags */}
              <div className="flex gap-1.5 flex-wrap">
                {agent.tags.map((tag) => (
                  <span key={tag} className={tagClass(tag)}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Capacity */}
              <div
                style={{
                  fontSize: 13,
                  color: "var(--af-text-secondary)",
                  textAlign: "center",
                  fontFeatureSettings: "'tnum'",
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    color: agent.running > 0 ? "var(--af-warning)" : "var(--af-success)",
                  }}
                >
                  {agent.running}
                </span>
                {" / "}
                {agent.capacity}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
