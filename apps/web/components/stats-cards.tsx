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
  },
  {
    key: "agentsRegistered" as const,
    label: "Agents Registered",
    icon: Bot,
  },
  {
    key: "runningJobs" as const,
    label: "Running Jobs",
    icon: Play,
  },
  {
    key: "totalDispatches" as const,
    label: "Total Dispatches",
    icon: Send,
  },
  {
    key: "completed" as const,
    label: "Completed",
    icon: CheckCircle,
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {statConfig.map(({ key, label, icon: Icon }) => (
        <Card key={key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {label}
            </CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats[key] : "--"}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
