"use client";

import { useState } from "react";
import type { Dispatch } from "@agentfleet/types";

interface DispatchListProps {
  dispatches: Dispatch[];
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour12: false });
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

const sourceBgMap: Record<string, string> = {
  manual: "var(--af-accent-subtle)",
  linear: "var(--af-info-subtle)",
};

const sourceColorMap: Record<string, string> = {
  manual: "var(--af-accent)",
  linear: "var(--af-info)",
};

export function DispatchList({ dispatches }: DispatchListProps) {
  const [openTimelines, setOpenTimelines] = useState<Set<string>>(new Set());

  if (dispatches.length === 0) {
    return (
      <div className="af-empty">
        No dispatches found. Create one from the dashboard.
      </div>
    );
  }

  function toggleTimeline(id: string) {
    setOpenTimelines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {dispatches.map((d) => {
        const source = d.source || "manual";
        const isOpen = openTimelines.has(d.id);
        const messages = d.messages || [];
        const hasTimeline = messages.length > 0 || d.status === "completed" || d.status === "failed";

        return (
          <div
            key={d.id}
            className={`af-dispatch-card ${d.status}`}
          >
            {/* Top row */}
            <div className="flex justify-between items-start" style={{ marginBottom: 8 }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--af-text-tertiary)",
                    background: "var(--background)",
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontFamily: "'SF Mono', monospace",
                  }}
                >
                  {d.id.slice(0, 8)}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    fontFamily: "'SF Mono', monospace",
                  }}
                >
                  {d.ticketRef}
                </span>
                <span style={{ color: "var(--af-text-secondary)", fontSize: 14 }}>
                  {d.title}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "4px 12px",
                  borderRadius: 100,
                  textTransform: "capitalize",
                  flexShrink: 0,
                  background: statusBgMap[d.status] || "var(--af-border-subtle)",
                  color: statusColorMap[d.status] || "var(--af-text-secondary)",
                }}
              >
                {d.status}
              </span>
            </div>

            {/* Meta row */}
            <div
              className="flex items-center flex-wrap"
              style={{ fontSize: 12, color: "var(--af-text-secondary)", gap: 18 }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "2px 8px",
                  borderRadius: 100,
                  background: sourceBgMap[source] || "var(--af-accent-subtle)",
                  color: sourceColorMap[source] || "var(--af-accent)",
                }}
              >
                {source === "linear" ? "Linear" : "Manual"}
              </span>
              <span>
                Agent:{" "}
                <span style={{ color: "var(--af-accent)", fontWeight: 500 }}>
                  {d.agentName || "\u2014"}
                </span>
              </span>
              <span>Dispatched: {formatTime(d.createdAt)}</span>
              <span>
                {d.status === "completed" ? "Duration: " : d.status === "failed" ? "Failed after " : "Running: "}
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    fontFeatureSettings: "'tnum'",
                    color: statusColorMap[d.status] || "var(--af-text-secondary)",
                  }}
                >
                  {formatDuration(d.durationMs)}
                </span>
              </span>
            </div>

            {/* Timeline toggle */}
            {hasTimeline && (
              <>
                <button
                  type="button"
                  onClick={() => toggleTimeline(d.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--af-text-secondary)",
                    fontSize: 12,
                    fontFamily: "inherit",
                    fontWeight: 500,
                    padding: "10px 0 0",
                    cursor: "pointer",
                    transition: "color 0.15s",
                  }}
                >
                  {isOpen ? "Hide" : "Show"} timeline
                </button>

                {isOpen && (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: "1px solid var(--af-border-subtle)",
                      paddingLeft: 12,
                    }}
                  >
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className="af-timeline-entry"
                      >
                        <span
                          style={{
                            color: "var(--af-text-tertiary)",
                            fontFamily: "'SF Mono', monospace",
                            fontSize: 11,
                          }}
                        >
                          {msg.timestamp ? formatTime(msg.timestamp) : ""}
                        </span>
                        <span
                          style={{
                            color: "var(--af-text-tertiary)",
                            fontFamily: "'SF Mono', monospace",
                            fontSize: 11,
                          }}
                        />
                        <span style={{ wordBreak: "break-word" }}>{msg.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
