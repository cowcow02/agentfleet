"use client";

import type { DashboardStatsResponse } from "@agentfleet/types";

interface StatsCardsProps {
  stats: DashboardStatsResponse | null;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

type StatKey = keyof DashboardStatsResponse;

const statConfig: {
  key: StatKey;
  label: string;
  colorVar: string;
  format?: (v: number) => string;
}[] = [
  { key: "machinesOnline", label: "Machines Online", colorVar: "var(--af-success)" },
  { key: "agentsRegistered", label: "Agents Registered", colorVar: "var(--af-info)" },
  { key: "runningJobs", label: "Running Jobs", colorVar: "var(--af-warning)" },
  { key: "totalDispatches", label: "Total Dispatches", colorVar: "var(--af-accent)" },
  { key: "completed", label: "Completed", colorVar: "var(--af-success)" },
  { key: "failed", label: "Failed", colorVar: "var(--af-danger)" },
  {
    key: "avgDurationSeconds",
    label: "Avg Duration",
    colorVar: "var(--af-text-secondary)",
    format: formatDuration,
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
      {statConfig.map(({ key, label, colorVar, format }) => (
        <div
          key={key}
          className="flex flex-col justify-between"
          style={{
            background: "var(--af-surface)",
            border: "1px solid var(--af-border-subtle)",
            borderRadius: 12,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--af-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 6,
              minHeight: "2.4em",
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              fontFeatureSettings: "'tnum'",
              lineHeight: 1.1,
              color: colorVar,
            }}
          >
            {stats ? (format ? format(stats[key]) : stats[key]) : "\u2014"}
          </div>
        </div>
      ))}
    </div>
  );
}
