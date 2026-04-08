"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Bot,
  Send,
  Settings,
  LogOut,
  Sun,
  Moon,
  Play,
} from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/dispatches", label: "Dispatches", icon: Send },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();

  const user = session?.user;
  const initials = user?.name
    ? user.name.charAt(0).toUpperCase()
    : "?";

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <aside
      className="flex flex-col border-r h-full"
      style={{
        width: 220,
        background: "var(--af-surface)",
        borderColor: "var(--af-border-subtle)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5" style={{ padding: "24px 20px 20px" }}>
        <Play className="h-5 w-5 shrink-0" style={{ color: "var(--af-accent)" }} />
        <span
          className="font-bold"
          style={{ fontSize: 15, letterSpacing: "-0.01em", color: "var(--af-text)" }}
        >
          AgentFleet
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-0.5" style={{ padding: "4px 10px" }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 no-underline transition-all",
                "rounded-lg",
              )}
              style={{
                padding: "9px 12px",
                fontSize: 13,
                fontWeight: 500,
                color: isActive ? "var(--af-accent)" : "var(--af-text-secondary)",
                background: isActive ? "var(--af-accent-subtle)" : "transparent",
                borderRadius: 8,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--af-surface-hover)";
                  e.currentTarget.style.color = "var(--af-text)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--af-text-secondary)";
                }
              }}
            >
              <item.icon
                className="h-4 w-4 shrink-0"
                style={{ opacity: isActive ? 1 : 0.7 }}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: 16,
          borderTop: "1px solid var(--af-border-subtle)",
        }}
      >
        {/* User info */}
        <div className="flex items-center gap-2.5" style={{ marginBottom: 12 }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "var(--af-accent-subtle)",
              color: "var(--af-accent)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 overflow-hidden">
            <p
              className="truncate"
              style={{ fontSize: 13, fontWeight: 500, color: "var(--af-text)" }}
            >
              {user?.name ?? "Loading..."}
            </p>
            <p
              className="truncate"
              style={{ fontSize: 11, color: "var(--af-text-tertiary)" }}
            >
              {user?.email ?? ""}
            </p>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
          className="w-full flex items-center justify-center cursor-pointer"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--af-text-secondary)",
            padding: "7px 0",
            borderRadius: 6,
            transition: "all 0.15s",
            marginBottom: 8,
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--af-text)";
            e.currentTarget.style.borderColor = "var(--af-text-tertiary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--af-text-secondary)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full cursor-pointer"
          style={{
            display: "block",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--af-text-secondary)",
            padding: "7px 0",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 6,
            transition: "all 0.15s",
            textAlign: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--af-danger)";
            e.currentTarget.style.borderColor = "var(--af-danger-subtle)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--af-text-secondary)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
