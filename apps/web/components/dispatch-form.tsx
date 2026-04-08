"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createDispatch, fetchLinearIssues } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LinearIssue } from "@agentfleet/types";

export function DispatchForm() {
  // Manual form state
  const [ticketRef, setTicketRef] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [labels, setLabels] = useState("");
  const [priority, setPriority] = useState("medium");
  const [submitting, setSubmitting] = useState(false);

  // Linear form state
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const labelArray = labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);

      if (labelArray.length === 0) {
        toast.error("At least one label is required for agent matching");
        setSubmitting(false);
        return;
      }

      const result = await createDispatch({
        ticketRef,
        title,
        description: description || undefined,
        labels: labelArray,
        priority: priority as "low" | "medium" | "high" | "critical",
      });

      toast.success(
        `Dispatched to ${result.agentName} on ${result.machineName}`,
      );
      // Reset form
      setTicketRef("");
      setTitle("");
      setDescription("");
      setLabels("");
      setPriority("medium");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoadIssues() {
    setLoadingIssues(true);
    try {
      const result = await fetchLinearIssues();
      setLinearIssues(result.issues);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load Linear issues",
      );
    } finally {
      setLoadingIssues(false);
    }
  }

  async function handleLinearDispatch() {
    if (!selectedIssue) return;
    setSubmitting(true);

    try {
      const result = await createDispatch({
        ticketRef: selectedIssue.identifier,
        title: selectedIssue.title,
        description: selectedIssue.description ?? undefined,
        labels: selectedIssue.labels,
        priority: "medium",
      });

      toast.success(
        `Dispatched to ${result.agentName} on ${result.machineName}`,
      );
      setSelectedIssue(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dispatch</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="manual">
          <TabsList className="mb-4">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="linear">From Linear</TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <form onSubmit={handleManualSubmit}>
              <div className="grid gap-3 items-end" style={{ gridTemplateColumns: "140px 1fr 1fr 140px auto" }}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ticketRef" className="text-xs text-muted-foreground">Ticket ID</Label>
                  <Input
                    id="ticketRef"
                    placeholder="KIP-301"
                    value={ticketRef}
                    onChange={(e) => setTicketRef(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="title" className="text-xs text-muted-foreground">Title</Label>
                  <Input
                    id="title"
                    placeholder="Describe the ticket"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="labels" className="text-xs text-muted-foreground">Labels (comma-sep)</Label>
                  <Input
                    id="labels"
                    placeholder="backend, feature"
                    value={labels}
                    onChange={(e) => setLabels(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="priority" className="text-xs text-muted-foreground">Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v ?? "medium")}>
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={submitting} className="whitespace-nowrap">
                  {submitting ? "Dispatching..." : "Dispatch"}
                </Button>
              </div>
              <div className="mt-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="description" className="text-xs text-muted-foreground">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Additional context for the agent..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="linear">
            <div className="space-y-4">
              <Button
                variant="outline"
                onClick={handleLoadIssues}
                disabled={loadingIssues}
              >
                {loadingIssues ? "Loading..." : "Load Linear Issues"}
              </Button>

              {linearIssues.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {linearIssues.map((issue) => (
                    <button
                      key={issue.identifier}
                      type="button"
                      onClick={() => setSelectedIssue(issue)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        selectedIssue?.identifier === issue.identifier
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          {issue.identifier}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {issue.state}
                        </span>
                      </div>
                      <p className="text-sm font-medium mt-1">{issue.title}</p>
                      {issue.labels.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {issue.labels.map((l) => (
                            <span
                              key={l}
                              className="text-xs bg-muted px-1.5 py-0.5 rounded"
                            >
                              {l}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {selectedIssue && (
                <Button
                  onClick={handleLinearDispatch}
                  disabled={submitting}
                  className="w-full"
                >
                  {submitting
                    ? "Dispatching..."
                    : `Dispatch ${selectedIssue.identifier}`}
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
