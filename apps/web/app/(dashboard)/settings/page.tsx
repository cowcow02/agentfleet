"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { organization, apiKey, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LinearConfig } from "@/components/linear-config";
import { Copy, Trash2, Plus, UserPlus } from "lucide-react";

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

  // Members
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // API Keys
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
      if (result.data) {
        setMembers(result.data as unknown as Member[]);
      }
    } catch {
      // Ignore — may not be org admin
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your team, API keys, and integrations
        </p>
      </div>

      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>
            Organization: {String((session?.session as Record<string, unknown>)?.activeOrganizationId ?? "None")}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Manage team members and invitations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Member list */}
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{member.user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.user.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{member.role}</Badge>
                  {member.user.id !== session?.user?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Invite form */}
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              className="flex-1"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit" disabled={inviting} size="sm">
              <UserPlus className="h-4 w-4 mr-1" />
              {inviting ? "Inviting..." : "Invite"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Create API keys for daemon authentication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* New key display */}
          {newKeyValue && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium mb-2">
                New API key created. Copy it now — it won&apos;t be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded break-all">
                  {newKeyValue}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(newKeyValue);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => setNewKeyValue(null)}
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Existing keys */}
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{key.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteApiKey(key.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          {/* Create key form */}
          <form onSubmit={handleCreateApiKey} className="flex gap-2">
            <Input
              placeholder="Key name (e.g. production-daemon)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={creatingKey} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              {creatingKey ? "Creating..." : "Create"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Linear Integration */}
      <LinearConfig />
    </div>
  );
}
