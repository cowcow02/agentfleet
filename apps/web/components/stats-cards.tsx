"use client";

import type { DashboardStatsResponse } from "@agentfleet/types";

interface StatsCardsProps {
  stats: DashboardStatsResponse | null;
}

const statConfig = [
  {
    key: "machinesOnline" as const,
    label: "Machines Online",
    colorVar: "var(--af-success)",
  },
  {
    key: "agentsRegistered" as const,
    label: "Agents Registered",
    colorVar: "var(--af-info)",
  },
  {
    key: "runningJobs" as const,
    label: "Running Jobs",
    colorVar: "var(--af-warning)",
  },
  {
    key: "totalDispatches" as const,
    label: "Total Dispatches",
    colorVar: "var(--af-accent)",
  },
  {
    key: "completed" as const,
    label: "Completed",
    colorVar: "var(--af-success)",
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div
      className="grid gap-3.5"
      style={{ gridTemplateColumns: "repeat(5, 1fr)" }}
    >
      {statConfig.map(({ key, label, colorVar }) => (
        <div
          key={key}
          className="flex flex-col justify-between"
          style={{
            background: "var(--af-surface)",
            border: "1px solid var(--af-border-subtle)",
            borderRadius: 12,
            padding: "20px 24px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--af-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
              minHeight: "2.4em",
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              fontFeatureSettings: "'tnum'",
              lineHeight: 1.1,
              color: colorVar,
            }}
          >
            {stats ? stats[key] : "\u2014"}
          </div>
        </div>
      ))}
    </div>
  );
}
