"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createDispatch, fetchAgents } from "@/lib/api";
import type { Agent } from "@agentfleet/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ManualDispatchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function agentKey(a: Pick<Agent, "machine" | "name">): string {
  return `${a.machine}::${a.name}`;
}

export function ManualDispatchSheet({ open, onOpenChange }: ManualDispatchSheetProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAgents()
      .then((res) => {
        setAgents(res.agents);
        if (res.agents.length > 0) {
          setSelected(agentKey(res.agents[0]));
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load agents");
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Reset form when the sheet closes so a re-open starts clean
  useEffect(() => {
    if (open) return;
    setDescription("");
    setSelected("");
    setAgents([]);
  }, [open]);

  const hasAgents = agents.length > 0;

  async function handleSubmit() {
    const target = agents.find((a) => agentKey(a) === selected);
    if (!target) return;

    setSubmitting(true);
    try {
      const result = await createDispatch({
        agentName: target.name,
        machineName: target.machine,
        description: description.trim() ? description.trim() : undefined,
      });
      toast.success(`Dispatched to ${result.agentName} on ${result.machineName}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Manual Dispatch</SheetTitle>
          <SheetDescription>
            Send an ad hoc task to a specific agent. Use this for one-off work that isn&apos;t
            tracked in Linear.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-dispatch-agent">Agent</Label>
            {loading && <div className="text-sm text-muted-foreground">Loading agents…</div>}
            {!loading && !hasAgents && (
              <div className="text-sm text-muted-foreground">
                No agents online. Start a daemon to dispatch ad hoc tasks.
              </div>
            )}
            {!loading && hasAgents && (
              <select
                id="manual-dispatch-agent"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {agents.map((agent) => {
                  const available = agent.capacity - agent.running;
                  return (
                    <option key={agentKey(agent)} value={agentKey(agent)}>
                      {agent.name} @ {agent.machine} ({available}/{agent.capacity} free)
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-dispatch-description">Description (optional)</Label>
            <Textarea
              id="manual-dispatch-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should the agent do?"
              rows={4}
            />
          </div>
        </div>

        <SheetFooter>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!hasAgents || submitting || !selected}
          >
            {submitting ? "Dispatching…" : "Dispatch"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
