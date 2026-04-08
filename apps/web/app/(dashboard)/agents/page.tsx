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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {machinesOnline} machine{machinesOnline !== 1 ? "s" : ""} online
            {" / "}
            {agents.length} agent{agents.length !== 1 ? "s" : ""} registered
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading agents...</div>
      ) : (
        <AgentTable agents={agents} />
      )}
    </div>
  );
}
