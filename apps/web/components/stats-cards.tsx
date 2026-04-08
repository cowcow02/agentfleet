"use client";

import {
  Monitor,
  Bot,
  Play,
  Send,
  CheckCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardStatsResponse } from "@agentfleet/types";

interface StatsCardsProps {
  stats: DashboardStatsResponse | null;
}

const statConfig = [
  {
    key: "machinesOnline" as const,
    label: "Machines Online",
    icon: Monitor,
    valueClass: "text-emerald-400",
  },
  {
    key: "agentsRegistered" as const,
    label: "Agents Registered",
    icon: Bot,
    valueClass: "text-violet-400",
  },
  {
    key: "runningJobs" as const,
    label: "Running Jobs",
    icon: Play,
    valueClass: "text-amber-400",
  },
  {
    key: "totalDispatches" as const,
    label: "Total Dispatches",
    icon: Send,
    valueClass: "text-teal-400",
  },
  {
    key: "completed" as const,
    label: "Completed",
    icon: CheckCircle,
    valueClass: "text-emerald-400",
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {statConfig.map(({ key, label, icon: Icon, valueClass }) => (
        <Card key={key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-[28px] font-bold tabular-nums leading-tight ${valueClass}`}>
              {stats ? stats[key] : "\u2014"}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
