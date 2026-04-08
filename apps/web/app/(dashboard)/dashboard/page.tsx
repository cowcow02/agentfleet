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
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-xs text-muted-foreground">
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Dispatch form */}
        <DispatchForm />

        {/* Fleet overview */}
        <Card>
          <CardHeader>
            <CardTitle>Fleet Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No agents connected. Start a daemon to register agents.
              </p>
            ) : (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div
                    key={`${agent.machine}-${agent.name}`}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{agent.name}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {agent.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {agent.running}/{agent.capacity} slots
                      </p>
                      <Badge
                        variant={agent.running < agent.capacity ? "default" : "secondary"}
                        className="mt-1"
                      >
                        {agent.running < agent.capacity ? "Available" : "Busy"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live feed */}
      <Card>
        <CardHeader>
          <CardTitle>Live Feed</CardTitle>
        </CardHeader>
        <CardContent>
          {feedItems.length === 0 && recentDispatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recent activity. Events will appear here in real time.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {feedItems.map((item, i) => (
                <div
                  key={`${item.timestamp}-${i}`}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <div
                    className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                      item.type === "error"
                        ? "bg-red-500"
                        : item.type === "success"
                          ? "bg-green-500"
                          : "bg-blue-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{item.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
