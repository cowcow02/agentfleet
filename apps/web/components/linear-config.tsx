"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  fetchLinearConfig,
  updateLinearConfig,
  deleteLinearConfig,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { LinearConfigResponse } from "@agentfleet/types";

export function LinearConfig() {
  const [config, setConfig] = useState<LinearConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [apiKey, setApiKey] = useState("");
  const [triggerStatus, setTriggerStatus] = useState("");
  const [triggerLabels, setTriggerLabels] = useState("");

  useEffect(() => {
    fetchLinearConfig()
      .then((c) => {
        setConfig(c);
        if (c.configured) {
          setTriggerStatus(c.triggerStatus ?? "");
          setTriggerLabels(c.triggerLabels?.join(", ") ?? "");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const labels = triggerLabels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);

      const result = await updateLinearConfig({
        apiKey,
        triggerStatus,
        triggerLabels: labels,
      });
      setConfig(result);
      setApiKey(""); // Clear API key field after save
      toast.success("Linear integration updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save config",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove Linear integration? This cannot be undone.")) return;
    try {
      await deleteLinearConfig();
      setConfig({ configured: false });
      setApiKey("");
      setTriggerStatus("");
      setTriggerLabels("");
      toast.success("Linear integration removed");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove config",
      );
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Loading Linear config...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Linear Integration</CardTitle>
            <CardDescription>
              Configure automatic dispatching from Linear issues
            </CardDescription>
          </div>
          {config?.configured && (
            <Badge variant="default">Connected</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="linearApiKey">
              API Key {config?.configured && "(leave blank to keep current)"}
            </Label>
            <Input
              id="linearApiKey"
              type="password"
              placeholder="lin_api_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required={!config?.configured}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="triggerStatus">Trigger Status</Label>
            <Input
              id="triggerStatus"
              placeholder="In Progress"
              value={triggerStatus}
              onChange={(e) => setTriggerStatus(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Dispatches are triggered when an issue moves to this status
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="triggerLabels">
              Trigger Labels (comma-separated)
            </Label>
            <Input
              id="triggerLabels"
              placeholder="agent, automated"
              value={triggerLabels}
              onChange={(e) => setTriggerLabels(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Only issues with at least one of these labels will be dispatched
            </p>
          </div>

          {config?.configured && config.webhookUrl && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <code className="block text-xs bg-muted px-3 py-2 rounded break-all">
                  {config.webhookUrl}
                </code>
                <p className="text-xs text-muted-foreground">
                  Add this URL as a webhook in your Linear workspace settings
                </p>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : config?.configured
                  ? "Update"
                  : "Connect"}
            </Button>
            {config?.configured && (
              <Button type="button" variant="destructive" onClick={handleDelete}>
                Remove
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
