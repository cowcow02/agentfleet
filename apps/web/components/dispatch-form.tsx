"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createDispatch, fetchLinearIssues, fetchProjects } from "@/lib/api";
import type { LinearIssue, Project } from "@agentfleet/types";

export function DispatchForm() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load projects once; pick the first one with Linear configured as default
  useEffect(() => {
    fetchProjects()
      .then((result) => {
        setProjects(result.projects);
        if (result.projects.length === 0) {
          setLoading(false);
          return;
        }
        const firstLinear = result.projects.find((p) => p.trackerType === "linear");
        setSelectedProjectId((prev) => prev ?? firstLinear?.id ?? result.projects[0].id);
      })
      .catch(() => {
        setProjects([]);
        setLoading(false);
      });
  }, []);

  // Load issues whenever selected project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    fetchLinearIssues(selectedProjectId)
      .then((result) => {
        setLinearIssues(result.issues);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load issues");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedProjectId]);

  async function handleDispatch(issue: LinearIssue) {
    setSubmitting(true);
    try {
      const result = await createDispatch({
        ticketRef: issue.identifier,
        title: issue.title,
        description: issue.description ?? undefined,
        labels: issue.labels,
        priority: "medium",
      });
      toast.success(`Dispatched to ${result.agentName} on ${result.machineName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="af-panel">
      <div className="af-panel-header">
        <span>Tickets</span>
        <button
          type="button"
          style={{
            background: "transparent",
            border: "1px solid var(--af-border-subtle)",
            color: "var(--af-text-secondary)",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 500,
            padding: "5px 14px",
            borderRadius: 6,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          Manual Dispatch
        </button>
      </div>

      <div style={{ padding: 8, minHeight: 200 }}>
        {loading && (
          <div
            style={{
              padding: 36,
              textAlign: "center",
              color: "var(--af-text-secondary)",
              fontSize: 13,
            }}
          >
            Loading issues from Linear...
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 36,
              textAlign: "center",
              color: "var(--af-text-secondary)",
              fontSize: 13,
            }}
          >
            {error}.{" "}
            <a href="/settings" style={{ color: "var(--af-accent)", textDecoration: "none" }}>
              Go to Settings
            </a>
          </div>
        )}

        {!loading && !error && linearIssues.length === 0 && (
          <div
            style={{
              padding: 36,
              textAlign: "center",
              color: "var(--af-text-secondary)",
              fontSize: 13,
            }}
          >
            No matching issues found in Linear.
          </div>
        )}

        {linearIssues.length > 0 && (
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {linearIssues.map((issue) => (
              <div
                key={issue.identifier}
                className="flex justify-between items-center"
                style={{
                  padding: "14px 18px",
                  borderRadius: 10,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--af-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
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
                  <div
                    className="flex gap-3.5"
                    style={{ fontSize: 12, color: "var(--af-text-secondary)" }}
                  >
                    <span>Status: {issue.state}</span>
                    {issue.labels.length > 0 && <span>Labels: {issue.labels.join(", ")}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDispatch(issue)}
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
    </div>
  );
}
