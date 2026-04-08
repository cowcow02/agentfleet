"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchAgents } from "@/lib/api";
import { useSSE } from "@/lib/use-sse";
import { AgentTable } from "@/components/agent-table";
import type { Agent, SseEvent } from "@agentfleet/types";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [machinesOnline, setMachinesOnline] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgents()
      .then((res) => {
        setAgents(res.agents);
        setMachinesOnline(res.machinesOnline);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSSE = useCallback((event: SseEvent) => {
    if (event.event === "agent:update") {
      setAgents(event.data.agents);
      setMachinesOnline(event.data.machines);
    }
  }, []);

  useSSE(handleSSE);

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Agent Registry
        </h1>
        <span style={{ fontSize: 13, color: "var(--af-text-secondary)" }}>
          {agents.length} agent{agents.length !== 1 ? "s" : ""} / {machinesOnline} machine{machinesOnline !== 1 ? "s" : ""} online
        </span>
      </div>

      {loading ? (
        <div style={{ color: "var(--af-text-tertiary)", fontSize: 13 }}>Loading agents...</div>
      ) : (
        <>
          <AgentTable agents={agents} />

          {/* Setup panel */}
          <div
            style={{
              marginTop: 28,
              background: "var(--af-surface)",
              border: "1px solid var(--af-border-subtle)",
              borderRadius: 12,
              padding: 24,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
              Daemon Setup Instructions
            </h3>
            <p style={{ fontSize: 13, color: "var(--af-text-secondary)", marginBottom: 14 }}>
              To add agents, run on your machine:
            </p>
            <div className="af-code-block" style={{ marginBottom: 10 }}>
              <span style={{ color: "var(--af-text-tertiary)", marginRight: 8 }}>$</span>
              npx agentfleet login &lt;your-token&gt;
            </div>
            <div className="af-code-block" style={{ marginBottom: 10 }}>
              <span style={{ color: "var(--af-text-tertiary)", marginRight: 8 }}>$</span>
              npx agentfleet start
            </div>
            <p style={{ marginTop: 12, fontSize: 12, color: "var(--af-text-tertiary)" }}>
              Get your token from{" "}
              <a href="/settings" style={{ color: "var(--af-accent)", textDecoration: "none" }}>
                Settings &gt; API Keys
              </a>
              .
            </p>
          </div>
        </>
      )}
    </div>
  );
}
