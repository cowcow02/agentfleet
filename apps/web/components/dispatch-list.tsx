"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Dispatch } from "@agentfleet/types";

interface DispatchListProps {
  dispatches: Dispatch[];
}

const statusColors: Record<string, string> = {
  dispatched: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  running: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  completed: "bg-green-500/15 text-green-400 border-green-500/20",
  failed: "bg-red-500/15 text-red-400 border-red-500/20",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/15 text-blue-400",
  high: "bg-orange-500/15 text-orange-400",
  critical: "bg-red-500/15 text-red-400",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function DispatchList({ dispatches }: DispatchListProps) {
  if (dispatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No dispatches found. Create one from the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticket</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dispatches.map((dispatch) => (
            <TableRow key={dispatch.id}>
              <TableCell>
                <span className="font-mono text-sm">{dispatch.ticketRef}</span>
              </TableCell>
              <TableCell>
                <span className="text-sm max-w-[200px] truncate block">
                  {dispatch.title}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm">{dispatch.agentName}</span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {dispatch.source}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`text-xs ${priorityColors[dispatch.priority] ?? ""}`}
                >
                  {dispatch.priority}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`text-xs ${statusColors[dispatch.status] ?? ""}`}
                >
                  {dispatch.status}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {formatDuration(dispatch.durationMs)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {new Date(dispatch.createdAt).toLocaleString()}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
