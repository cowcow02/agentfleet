"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createDispatch, fetchLinearIssues } from "@/lib/api";
import type { LinearIssue } from "@agentfleet/types";

export function DispatchForm() {
  // Manual form state
  const [ticketRef, setTicketRef] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [labels, setLabels] = useState("");
  const [priority, setPriority] = useState("medium");
  const [submitting, setSubmitting] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<"manual" | "linear">("manual");

  // Linear form state
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [linearLoaded, setLinearLoaded] = useState(false);
  const [linearError, setLinearError] = useState<string | null>(null);

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const labelArray = labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);

      if (labelArray.length === 0) {
        toast.error("At least one label is required for agent matching");
        setSubmitting(false);
        return;
      }

      const result = await createDispatch({
        ticketRef,
        title,
        description: description || undefined,
        labels: labelArray,
        priority: priority as "low" | "medium" | "high" | "critical",
      });

      toast.success(
        `Dispatched to ${result.agentName} on ${result.machineName}`,
      );
      setTicketRef("");
      setTitle("");
      setDescription("");
      setLabels("");
      setPriority("medium");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoadLinear() {
    if (linearLoaded) return;
    setLoadingIssues(true);
    setLinearError(null);
    try {
      const result = await fetchLinearIssues();
      setLinearIssues(result.issues);
      setLinearLoaded(true);
    } catch (err) {
      setLinearError(
        err instanceof Error ? err.message : "Failed to load Linear issues",
      );
    } finally {
      setLoadingIssues(false);
    }
  }

  async function handleLinearDispatch(issue: LinearIssue) {
    setSubmitting(true);
    try {
      const result = await createDispatch({
        ticketRef: issue.identifier,
        title: issue.title,
        description: issue.description ?? undefined,
        labels: issue.labels,
        priority: "medium",
      });
      toast.success(
        `Dispatched to ${result.agentName} on ${result.machineName}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  }

  function switchTab(tab: "manual" | "linear") {
    setActiveTab(tab);
    if (tab === "linear") handleLoadLinear();
  }

  return (
    <div
      style={{
        background: "var(--af-surface)",
        border: "1px solid var(--af-border-subtle)",
        borderRadius: 12,
        padding: 24,
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>Dispatch</h2>

      {/* Segment tabs */}
      <div
        style={{
          display: "inline-flex",
          background: "var(--background)",
          borderRadius: 8,
          padding: 3,
          marginBottom: 20,
          gap: 2,
        }}
      >
        <button
          type="button"
          onClick={() => switchTab("manual")}
          style={{
            background: activeTab === "manual" ? "var(--af-surface-elevated)" : "transparent",
            border: "none",
            color: activeTab === "manual" ? "var(--af-text)" : "var(--af-text-secondary)",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 500,
            padding: "7px 18px",
            borderRadius: 6,
            cursor: "pointer",
            transition: "all 0.15s",
            boxShadow: activeTab === "manual" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
          }}
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => switchTab("linear")}
          style={{
            background: activeTab === "linear" ? "var(--af-surface-elevated)" : "transparent",
            border: "none",
            color: activeTab === "linear" ? "var(--af-text)" : "var(--af-text-secondary)",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 500,
            padding: "7px 18px",
            borderRadius: 6,
            cursor: "pointer",
            transition: "all 0.15s",
            boxShadow: activeTab === "linear" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
          }}
        >
          From Linear
        </button>
      </div>

      {/* Manual tab */}
      {activeTab === "manual" && (
        <form onSubmit={handleManualSubmit}>
          <div
            className="grid items-end"
            style={{ gridTemplateColumns: "140px 1fr 1fr 140px auto", gap: 12 }}
          >
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                Ticket ID
              </label>
              <input
                placeholder="KIP-301"
                value={ticketRef}
                onChange={(e) => setTicketRef(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                Title
              </label>
              <input
                placeholder="Describe the ticket"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                Labels (comma-sep)
              </label>
              <input
                placeholder="backend, feature"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="af-btn-primary"
              style={{ alignSelf: "end" }}
            >
              {submitting ? "Dispatching..." : "Dispatch"}
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                Description (optional)
              </label>
              <textarea
                placeholder="Additional context for the agent..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </form>
      )}

      {/* Linear tab */}
      {activeTab === "linear" && (
        <div>
          {loadingIssues && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--af-text-secondary)", fontSize: 13 }}>
              Loading issues from Linear...
            </div>
          )}

          {linearError && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--af-text-secondary)", fontSize: 13 }}>
              {linearError}.{" "}
              <a href="/settings" style={{ color: "var(--af-accent)", textDecoration: "none" }}>
                Go to Settings
              </a>
            </div>
          )}

          {!loadingIssues && !linearError && linearIssues.length === 0 && linearLoaded && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--af-text-secondary)", fontSize: 13 }}>
              No matching issues found in Linear.
            </div>
          )}

          {linearIssues.length > 0 && (
            <div className="space-y-1.5" style={{ maxHeight: 300, overflowY: "auto" }}>
              {linearIssues.map((issue) => (
                <div
                  key={issue.identifier}
                  className="flex justify-between items-center"
                  style={{
                    padding: "14px 18px",
                    borderRadius: 10,
                    background: "var(--af-surface-hover)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--af-surface-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--af-surface-hover)";
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, lineHeight: 1.4 }}>
                      <span
                        style={{
                          color: "var(--af-info)",
                          marginRight: 10,
                          fontFamily: "'SF Mono', monospace",
                          fontSize: 13,
                        }}
                      >
                        {issue.identifier}
                      </span>
                      {issue.title}
                    </h4>
                    <div className="flex gap-3.5" style={{ fontSize: 12, color: "var(--af-text-secondary)" }}>
                      <span>Status: {issue.state}</span>
                      {issue.labels.length > 0 && (
                        <span>Labels: {issue.labels.join(", ")}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleLinearDispatch(issue)}
                    style={{
                      background: "var(--af-accent)",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      flexShrink: 0,
                      transition: "all 0.15s",
                    }}
                  >
                    Dispatch
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
