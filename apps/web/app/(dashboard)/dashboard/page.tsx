"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchDashboardStats, fetchAgents } from "@/lib/api";
import { useSSE } from "@/lib/use-sse";
import { StatsCards } from "@/components/stats-cards";
import { DispatchForm } from "@/components/dispatch-form";
import Link from "next/link";
import type {
  DashboardStatsResponse,
  Agent,
  SseEvent,
  Dispatch,
} from "@agentfleet/types";

interface FeedItem {
  message: string;
  timestamp: string;
  type: string;
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

const statusColorMap: Record<string, string> = {
  running: "var(--af-warning)",
  completed: "var(--af-success)",
  failed: "var(--af-danger)",
  dispatched: "var(--af-info)",
};

const statusBgMap: Record<string, string> = {
  running: "var(--af-warning-subtle)",
  completed: "var(--af-success-subtle)",
  failed: "var(--af-danger-subtle)",
  dispatched: "var(--af-info-subtle)",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [recentDispatches, setRecentDispatches] = useState<Dispatch[]>([]);

  useEffect(() => {
    fetchDashboardStats().then(setStats).catch(console.error);
    fetchAgents()
      .then((res) => setAgents(res.agents))
      .catch(console.error);
  }, []);

  const handleSSE = useCallback((event: SseEvent) => {
    switch (event.event) {
      case "agent:update":
        setAgents(event.data.agents);
        fetchDashboardStats().then(setStats).catch(console.error);
        break;
      case "dispatch:update":
        setRecentDispatches((prev) => {
          const existing = prev.findIndex(
            (d) => d.id === event.data.dispatch.id,
          );
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = event.data.dispatch;
            return updated;
          }
          return [event.data.dispatch, ...prev].slice(0, 10);
        });
        fetchDashboardStats().then(setStats).catch(console.error);
        break;
      case "feed:event":
        setFeedItems((prev) => [event.data, ...prev].slice(0, 50));
        break;
    }
  }, []);

  const { connected } = useSSE(handleSSE);

  return (
    <div>
      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 28 }}>
        Dashboard
      </h1>

      {/* Stats */}
      <div style={{ marginBottom: 32 }}>
        <StatsCards stats={stats} />
      </div>

      {/* Dispatch form */}
      <div style={{ marginBottom: 28 }}>
        <DispatchForm />
      </div>

      {/* Fleet Overview + Live Feed side by side */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Fleet overview panel */}
        <div className="af-panel">
          <div className="af-panel-header">
            <span>Fleet Overview</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--af-text-secondary)" }}>
              {agents.length} agents
            </span>
          </div>
          <div style={{ padding: 8, maxHeight: 380, overflowY: "auto" }}>
            {agents.length === 0 ? (
              <div className="af-empty" style={{ padding: 36 }}>Waiting for agents...</div>
            ) : (
              <div>
                {agents.map((agent) => {
                  const isIdle = agent.running < agent.capacity;
                  return (
                    <div
                      key={`${agent.machine}-${agent.name}`}
                      className="grid items-center"
                      style={{
                        gridTemplateColumns: "10px 1fr auto",
                        gap: 14,
                        padding: "12px 14px",
                        borderRadius: 8,
                        marginBottom: 2,
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
                      <div
                        className={`af-dot ${isIdle ? "af-dot-online" : "af-dot-busy"}`}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{agent.name}</div>
                        <div style={{ fontSize: 12, color: "var(--af-text-secondary)", marginTop: 2 }}>
                          {agent.machine}
                        </div>
                        <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 5 }}>
                          {agent.tags.map((tag) => (
                            <span key={tag} className={tagClass(tag)}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--af-text-secondary)",
                          whiteSpace: "nowrap",
                          fontFeatureSettings: "'tnum'",
                        }}
                      >
                        <span
                          style={{
                            color: agent.running > 0 ? "var(--af-warning)" : "var(--af-success)",
                            fontWeight: 600,
                          }}
                        >
                          {agent.running}
                        </span>
                        /{agent.capacity}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Live feed panel */}
        <div className="af-panel">
          <div className="af-panel-header">
            <span>Live Feed</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--af-text-secondary)" }}>
              {feedItems.length} events
            </span>
          </div>
          <div style={{ padding: 8, maxHeight: 380, overflowY: "auto" }}>
            {feedItems.length === 0 ? (
              <div className="af-empty" style={{ padding: 36 }}>No events yet</div>
            ) : (
              <div>
                {feedItems.map((item, i) => (
                  <div
                    key={`${item.timestamp}-${i}`}
                    className="flex items-baseline"
                    style={{
                      gap: 10,
                      padding: "8px 14px",
                      fontSize: 13,
                      borderRadius: 6,
                      marginBottom: 2,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--af-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        color: "var(--af-text-tertiary)",
                        fontFamily: "'SF Mono', monospace",
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      {formatTime(item.timestamp)}
                    </span>
                    <span
                      style={{
                        color:
                          item.type === "error"
                            ? "var(--af-danger)"
                            : item.type === "success"
                              ? "var(--af-success)"
                              : item.type === "status"
                                ? "var(--af-warning)"
                                : "var(--af-info)",
                      }}
                    >
                      {item.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Dispatches panel */}
      <div className="af-panel" style={{ marginBottom: 32 }}>
        <div className="af-panel-header">
          <span>Recent Dispatches</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: "var(--af-text-secondary)" }}>
            {recentDispatches.length}
          </span>
        </div>
        <div style={{ padding: 8, maxHeight: 500, overflowY: "auto" }}>
          {recentDispatches.length === 0 ? (
            <div className="af-empty" style={{ padding: 36 }}>
              No dispatches yet. Use the form above to send a ticket.
            </div>
          ) : (
            <div>
              {recentDispatches.map((d) => {
                const source = d.source || "manual";
                return (
                  <div
                    key={d.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 8,
                      marginBottom: 4,
                      borderLeft: `3px solid ${statusColorMap[d.status] || "var(--border)"}`,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--af-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                      <div className="flex items-center">
                        <span
                          style={{
                            fontWeight: 600,
                            fontFamily: "'SF Mono', monospace",
                            fontSize: 13,
                          }}
                        >
                          {d.ticketRef}
                        </span>
                        <span
                          style={{
                            color: "var(--af-text-secondary)",
                            marginLeft: 10,
                            fontSize: 13,
                          }}
                        >
                          {d.title}
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: 10,
                            fontWeight: 500,
                            padding: "2px 8px",
                            borderRadius: 100,
                            marginLeft: 8,
                            background: source === "linear" ? "var(--af-info-subtle)" : "var(--af-accent-subtle)",
                            color: source === "linear" ? "var(--af-info)" : "var(--af-accent)",
                          }}
                        >
                          {source === "linear" ? "Linear" : "Manual"}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "3px 10px",
                          borderRadius: 100,
                          background: statusBgMap[d.status] || "var(--af-border-subtle)",
                          color: statusColorMap[d.status] || "var(--af-text-secondary)",
                        }}
                      >
                        {d.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--af-text-secondary)", marginTop: 4 }}>
                      <span style={{ color: "var(--af-accent)" }}>{d.agentName}</span>
                      {" \u2014 "}
                      <span style={{ color: "var(--af-text-tertiary)" }}>
                        {formatTime(d.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <Link
          href="/dispatches"
          className="af-view-all"
        >
          View all dispatches &rarr;
        </Link>
      </div>
    </div>
  );
}
