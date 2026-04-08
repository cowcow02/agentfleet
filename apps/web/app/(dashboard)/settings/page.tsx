"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { organization, apiKey, useSession } from "@/lib/auth-client";
import { LinearConfig } from "@/components/linear-config";
import { Copy, Trash2, UserPlus, Plus } from "lucide-react";

interface Member {
  id: string;
  user: { id: string; name: string; email: string };
  role: string;
}

interface ApiKeyEntry {
  id: string;
  name: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { data: session } = useSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
    loadApiKeys();
  }, []);

  async function loadMembers() {
    try {
      const result = await organization.listMembers();
      const data = result.data;
      if (Array.isArray(data)) {
        setMembers(data as unknown as Member[]);
      } else if (data && typeof data === "object" && "members" in data) {
        setMembers((data as { members: Member[] }).members);
      }
    } catch {
      // Ignore
    }
  }

  async function loadApiKeys() {
    try {
      const result = await apiKey.listApiKeys();
      if (result.data) {
        setApiKeys(result.data as unknown as ApiKeyEntry[]);
      }
    } catch {
      // Ignore
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const result = await organization.inviteMember({
        email: inviteEmail,
        role: inviteRole as "member" | "admin",
      });
      if (result.error) {
        toast.error(result.error.message ?? "Failed to invite");
      } else {
        toast.success(`Invited ${inviteEmail}`);
        setInviteEmail("");
      }
    } catch {
      toast.error("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Remove this member from the team?")) return;
    try {
      await organization.removeMember({ memberIdOrEmail: memberId });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    }
  }

  async function handleCreateApiKey(e: React.FormEvent) {
    e.preventDefault();
    setCreatingKey(true);
    try {
      const result = await apiKey.createApiKey({
        name: newKeyName,
        expiresIn: undefined,
      });
      if (result.data) {
        const data = result.data as unknown as { key: string; id: string; name: string; createdAt: string };
        setNewKeyValue(data.key);
        setApiKeys((prev) => [
          ...prev,
          { id: data.id, name: data.name, createdAt: data.createdAt },
        ]);
        setNewKeyName("");
      }
    } catch {
      toast.error("Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleDeleteApiKey(keyId: string) {
    if (!confirm("Revoke this API key? Daemons using it will be disconnected."))
      return;
    try {
      await apiKey.deleteApiKey({ keyId });
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast.success("API key revoked");
    } catch {
      toast.error("Failed to revoke API key");
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 32 }}>
        Team Settings
      </h1>

      {/* Team Info */}
      <div className="af-section" style={{ marginBottom: 24 }}>
        <div className="af-section-header">Team Info</div>
        <div className="af-section-body">
          <div className="flex gap-12 flex-wrap">
            <div className="flex flex-col gap-1">
              <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--af-text-tertiary)" }}>
                Team
              </span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>
                {session?.user?.name ?? "\u2014"}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--af-text-tertiary)" }}>
                Organization ID
              </span>
              <span style={{ fontSize: 13, fontWeight: 400, color: "var(--af-text-secondary)", fontFamily: "'SF Mono', monospace" }}>
                {String((session?.session as Record<string, unknown>)?.activeOrganizationId ?? "\u2014")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="af-section" style={{ marginBottom: 24 }}>
        <div className="af-section-header">
          <span>Members</span>
        </div>
        <div style={{ padding: 0 }}>
          {/* Members list */}
          {members.length > 0 && (
            <div>
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: "14px 24px",
                    borderBottom: "1px solid var(--af-border-subtle)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--af-surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{member.user.name}</p>
                    <p style={{ fontSize: 12, color: "var(--af-text-secondary)" }}>{member.user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "3px 10px",
                        borderRadius: 100,
                      }}
                      className={member.role === "admin" ? "af-role-admin" : "af-role-member"}
                    >
                      {member.role}
                    </span>
                    {member.user.id !== session?.user?.id && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--af-danger-subtle)",
                          color: "var(--af-danger)",
                          padding: "5px 10px",
                          fontSize: 11,
                          fontWeight: 500,
                          borderRadius: 6,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          opacity: 0.7,
                          transition: "all 0.15s",
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invite form */}
          <form
            onSubmit={handleInvite}
            className="flex items-end"
            style={{ padding: 24, gap: 12, borderTop: members.length > 0 ? "1px solid var(--af-border-subtle)" : "none" }}
          >
            <div className="flex flex-col flex-1" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                Email
              </label>
              <input
                type="email"
                placeholder="teammate@team.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col" style={{ gap: 6, width: 120 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                Role
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="af-btn-primary"
            >
              <UserPlus className="h-3.5 w-3.5 inline mr-1" />
              {inviting ? "Inviting..." : "Invite"}
            </button>
          </form>
        </div>
      </div>

      {/* API Keys */}
      <div className="af-section" style={{ marginBottom: 24 }}>
        <div className="af-section-header">
          <span>API Keys</span>
        </div>
        <div className="af-section-body" style={{ padding: 0 }}>
          {/* New key display */}
          {newKeyValue && (
            <div
              style={{
                margin: 24,
                background: "var(--af-success-subtle)",
                border: "1px solid rgba(62,207,142,0.25)",
                borderRadius: 10,
                padding: "16px 20px",
              }}
            >
              <p style={{ color: "var(--af-success)", fontSize: 13, marginBottom: 10, fontWeight: 600 }}>
                New API key created. Copy it now — it won&apos;t be shown again.
              </p>
              <div className="af-mono-box">
                <code style={{ color: "var(--af-warning)", fontWeight: 600 }}>{newKeyValue}</code>
                <button
                  type="button"
                  onClick={() => copyText(newKeyValue)}
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
              <button
                type="button"
                onClick={() => setNewKeyValue(null)}
                style={{
                  marginTop: 8,
                  background: "transparent",
                  border: "none",
                  color: "var(--af-text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Existing keys */}
          {apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between"
              style={{
                padding: "14px 24px",
                borderBottom: "1px solid var(--af-border-subtle)",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--af-surface-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{key.name}</p>
                <p style={{ fontSize: 12, color: "var(--af-text-secondary)" }}>
                  Created {new Date(key.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDeleteApiKey(key.id)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--af-danger-subtle)",
                  color: "var(--af-danger)",
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  opacity: 0.7,
                  transition: "all 0.15s",
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Create key form */}
          <form
            onSubmit={handleCreateApiKey}
            className="flex items-end"
            style={{ padding: 24, gap: 12, borderTop: apiKeys.length > 0 ? "1px solid var(--af-border-subtle)" : "none" }}
          >
            <div className="flex flex-col flex-1" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
                Key name
              </label>
              <input
                placeholder="production-daemon"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={creatingKey}
              className="af-btn-primary"
            >
              <Plus className="h-3.5 w-3.5 inline mr-1" />
              {creatingKey ? "Creating..." : "Create"}
            </button>
          </form>
        </div>
      </div>

      {/* Linear Integration */}
      <LinearConfig />
    </div>
  );
}
