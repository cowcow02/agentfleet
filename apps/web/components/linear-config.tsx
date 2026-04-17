"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { fetchLinearConfig, updateLinearConfig, deleteLinearConfig } from "@/lib/api";
import { Copy } from "lucide-react";
import type { LinearConfigResponse } from "@agentfleet/types";

interface LinearConfigProps {
  projectId: string;
}

export function LinearConfig({ projectId }: LinearConfigProps) {
  const [config, setConfig] = useState<LinearConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [apiKeyVal, setApiKeyVal] = useState("");
  const [triggerStatus, setTriggerStatus] = useState("");
  const [triggerLabels, setTriggerLabels] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    setLoading(true);
    setConfig(null);
    setApiKeyVal("");
    setTriggerStatus("");
    setTriggerLabels("");
    fetchLinearConfig(projectId)
      .then((c) => {
        setConfig(c);
        if (c.configured) {
          setTriggerStatus(c.triggerStatus ?? "");
          setTriggerLabels(c.triggerLabels?.join(", ") ?? "");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const labels = triggerLabels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);

      const result = await updateLinearConfig(projectId, {
        apiKey: apiKeyVal,
        triggerStatus,
        triggerLabels: labels,
      });
      setConfig(result);
      setApiKeyVal("");
      setSaveMsg({ text: "Configuration saved.", type: "success" });
      setTimeout(() => setSaveMsg(null), 4000);
    } catch (err) {
      setSaveMsg({ text: err instanceof Error ? err.message : "Failed to save.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove Linear integration? This cannot be undone.")) return;
    try {
      await deleteLinearConfig(projectId);
      setConfig({ configured: false });
      setApiKeyVal("");
      setTriggerStatus("");
      setTriggerLabels("");
      toast.success("Linear integration removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove config");
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  }

  if (loading) {
    return (
      <div className="af-section">
        <div className="af-section-header">Linear Integration</div>
        <div className="af-section-body">
          <p style={{ fontSize: 13, color: "var(--af-text-secondary)" }}>
            Loading Linear config...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="af-section" style={{ marginBottom: 24 }}>
      <div className="af-section-header">Linear Integration</div>
      <div className="af-section-body">
        {/* Connection status */}
        <div className="flex items-center gap-2.5" style={{ marginBottom: 20, fontSize: 13 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: config?.configured ? "var(--af-success)" : "var(--af-text-tertiary)",
              boxShadow: config?.configured ? "0 0 0 3px var(--af-success-subtle)" : "none",
            }}
          />
          <span
            style={{
              color: config?.configured ? "var(--af-success)" : "var(--af-text-secondary)",
            }}
          >
            {config?.configured ? "Connected" : "Not configured"}
          </span>
        </div>

        <form onSubmit={handleSave}>
          <div className="flex flex-col" style={{ gap: 16 }}>
            {/* API Key + Trigger status row */}
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="flex flex-col" style={{ gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                  API Key {config?.configured && "(leave blank to keep current)"}
                </label>
                <input
                  type="password"
                  placeholder={
                    config?.configured
                      ? "lin_api_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved)"
                      : "lin_api_xxxxxxxx"
                  }
                  value={apiKeyVal}
                  onChange={(e) => setApiKeyVal(e.target.value)}
                  required={!config?.configured}
                />
              </div>
              <div className="flex flex-col" style={{ gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                  Trigger when status changes to
                </label>
                <select value={triggerStatus} onChange={(e) => setTriggerStatus(e.target.value)}>
                  <option value="backlog">Backlog</option>
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="in_review">In Review</option>
                </select>
              </div>
            </div>

            {/* Labels */}
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                Only for labels (comma-separated)
              </label>
              <input
                placeholder="agent-task, ready-to-build"
                value={triggerLabels}
                onChange={(e) => setTriggerLabels(e.target.value)}
              />
            </div>

            {/* Webhook URL */}
            {config?.configured && config.webhookUrl && (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--af-text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  Webhook URL (configure in Linear):
                </div>
                <div className="af-mono-box">
                  <span style={{ color: "var(--af-info)" }}>{config.webhookUrl}</span>
                  <button
                    type="button"
                    onClick={() => copyText(config.webhookUrl!)}
                    style={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      color: "var(--af-text-secondary)",
                      padding: "5px 10px",
                      fontSize: 11,
                      fontWeight: 500,
                      borderRadius: 6,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center" style={{ marginTop: 2 }}>
              <button type="submit" disabled={saving} className="af-btn-primary">
                {saving ? "Saving..." : "Save Configuration"}
              </button>
              {config?.configured && (
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    marginLeft: 12,
                    background: "transparent",
                    border: "1px solid var(--af-danger-subtle)",
                    color: "var(--af-danger)",
                    padding: "10px 20px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  Remove
                </button>
              )}
              {saveMsg && (
                <span
                  style={{
                    marginLeft: 16,
                    fontSize: 13,
                    fontWeight: 500,
                    color: saveMsg.type === "success" ? "var(--af-success)" : "var(--af-danger)",
                  }}
                >
                  {saveMsg.text}
                </span>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
