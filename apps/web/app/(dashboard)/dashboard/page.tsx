"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchDashboardStats, fetchAgents } from "@/lib/api";
import { useSSE } from "@/lib/use-sse";
import { StatsCards } from "@/components/stats-cards";
import { DispatchForm } from "@/components/dispatch-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [recentDispatches, setRecentDispatches] = useState<Dispatch[]>([]);

  // Load initial data
  useEffect(() => {
    fetchDashboardStats().then(setStats).catch(console.error);
    fetchAgents()
      .then((res) => setAgents(res.agents))
      .catch(console.error);
  }, []);

  // Handle SSE events
  const handleSSE = useCallback((event: SseEvent) => {
    switch (event.event) {
      case "agent:update":
        setAgents(event.data.agents);
        // Refresh stats when agents change
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
        // Refresh stats
        fetchDashboardStats().then(setStats).catch(console.error);
        break;
      case "feed:event":
        setFeedItems((prev) => [event.data, ...prev].slice(0, 50));
        break;
    }
  }, []);

  const { connected } = useSSE(handleSSE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
          />
          <span className="text-xs text-muted-foreground">
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Dispatch form — full width */}
      <DispatchForm />

      {/* Fleet Overview + Live Feed side by side */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Fleet overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-[13px] font-semibold">Fleet Overview</CardTitle>
            <span className="text-xs text-muted-foreground">{agents.length} agents</span>
          </CardHeader>
          <CardContent className="max-h-[380px] overflow-y-auto p-2">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-9">
                Waiting for agents...
              </p>
            ) : (
              <div className="space-y-0.5">
                {agents.map((agent) => (
                  <div
                    key={`${agent.machine}-${agent.name}`}
                    className="grid items-center gap-3.5 rounded-lg p-3 transition-colors hover:bg-muted"
                    style={{ gridTemplateColumns: "10px 1fr auto" }}
                  >
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        agent.running < agent.capacity
                          ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]"
                          : "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.10)]"
                      }`}
                    />
                    <div>
                      <p className="text-[13px] font-semibold">{agent.name}</p>
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {agent.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-[13px] text-muted-foreground tabular-nums whitespace-nowrap">
                      <span className={agent.running > 0 ? "text-amber-400 font-semibold" : "text-emerald-400 font-semibold"}>
                        {agent.running}
                      </span>
                      /{agent.capacity}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live feed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-[13px] font-semibold">Live Feed</CardTitle>
            <span className="text-xs text-muted-foreground">{feedItems.length} events</span>
          </CardHeader>
          <CardContent className="max-h-[380px] overflow-y-auto p-2">
            {feedItems.length === 0 && recentDispatches.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-9">
                No events yet
              </p>
            ) : (
              <div className="space-y-0.5">
                {feedItems.map((item, i) => (
                  <div
                    key={`${item.timestamp}-${i}`}
                    className="flex items-baseline gap-2.5 rounded-md px-3.5 py-2 text-[13px] transition-colors hover:bg-muted"
                  >
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span
                      className={
                        item.type === "error"
                          ? "text-red-400"
                          : item.type === "success"
                            ? "text-emerald-400"
                            : item.type === "status"
                              ? "text-amber-400"
                              : "text-violet-400"
                      }
                    >
                      {item.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
