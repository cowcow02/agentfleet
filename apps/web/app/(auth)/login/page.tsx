"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, organization } from "@/lib/auth-client";
import { Play } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Login failed");
      } else {
        const orgs = await organization.list();
        if (orgs.data && orgs.data.length > 0) {
          await organization.setActive({ organizationId: orgs.data[0].id });
        }
        router.push("/dashboard");
      }
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
          Welcome back
        </h1>
        <p style={{ fontSize: 13, color: "var(--af-text-secondary)" }}>
          Sign in to your AgentFleet account
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
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <p style={{ fontSize: 13, color: "var(--af-text-secondary)" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={{ color: "var(--af-accent)", textDecoration: "none" }}>
              Sign up
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
