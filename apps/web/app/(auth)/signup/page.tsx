"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp, organization } from "@/lib/auth-client";
import { Play } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signUp.email({ name, email, password });
      if (result.error) {
        setError(result.error.message ?? "Signup failed");
        setLoading(false);
        return;
      }

      const slug = teamName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const orgResult = await organization.create({
        name: teamName,
        slug,
      });

      if (orgResult.error) {
        setError(orgResult.error.message ?? "Failed to create team");
        setLoading(false);
        return;
      }

      await organization.setActive({
        organizationId: orgResult.data!.id,
      });

      router.push("/dashboard");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--af-surface)",
        border: "1px solid var(--af-border-subtle)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "32px 32px 24px", textAlign: "center" }}>
        <div
          className="flex items-center justify-center mx-auto"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--af-accent-subtle)",
            marginBottom: 12,
          }}
        >
          <Play className="h-5 w-5" style={{ color: "var(--af-accent)" }} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>
          Create your account
        </h1>
        <p style={{ fontSize: 13, color: "var(--af-text-secondary)" }}>
          Set up your AgentFleet account and team
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col" style={{ padding: "0 32px 24px", gap: 16 }}>
          {error && (
            <div
              style={{
                borderRadius: 8,
                background: "var(--af-danger-subtle)",
                padding: 12,
                fontSize: 13,
                color: "var(--af-danger)",
              }}
            >
              {error}
            </div>
          )}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
              Full name
            </label>
            <input
              type="text"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
              Password
            </label>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
              Team name
            </label>
            <input
              type="text"
              placeholder="My Team"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex flex-col items-center" style={{ padding: "0 32px 32px", gap: 16 }}>
          <button
            type="submit"
            disabled={loading}
            className="af-btn-primary w-full"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
          <p style={{ fontSize: 13, color: "var(--af-text-secondary)" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--af-accent)", textDecoration: "none" }}>
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
