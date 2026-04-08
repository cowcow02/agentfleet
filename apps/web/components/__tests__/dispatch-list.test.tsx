import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DispatchList } from "../dispatch-list";
import type { Dispatch } from "@agentfleet/types";

function makeDispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id: "d-1",
    organizationId: "org-1",
    ticketRef: "KIP-101",
    title: "Fix login bug",
    description: null,
    labels: ["frontend"],
    priority: "medium",
    agentName: "agent-1",
    machineName: "machine-1",
    createdBy: null,
    source: "manual",
    status: "completed",
    exitCode: 0,
    durationMs: 65000,
    messages: [],
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-01-15T10:01:05Z",
    ...overrides,
  };
}

describe("DispatchList", () => {
  it("renders empty state when no dispatches", () => {
    render(<DispatchList dispatches={[]} />);
    expect(
      screen.getByText("No dispatches found. Create one from the dashboard."),
    ).toBeInTheDocument();
  });

  it("renders table headers", () => {
    render(<DispatchList dispatches={[makeDispatch()]} />);
    expect(screen.getByText("Ticket")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
  });

  it("renders dispatch data in rows", () => {
    render(<DispatchList dispatches={[makeDispatch()]} />);
    expect(screen.getByText("KIP-101")).toBeInTheDocument();
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    expect(screen.getByText("agent-1")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("renders multiple dispatches", () => {
    const dispatches = [
      makeDispatch({ id: "d-1", ticketRef: "KIP-101" }),
      makeDispatch({ id: "d-2", ticketRef: "KIP-102", title: "Add auth" }),
    ];
    render(<DispatchList dispatches={dispatches} />);
    expect(screen.getByText("KIP-101")).toBeInTheDocument();
    expect(screen.getByText("KIP-102")).toBeInTheDocument();
  });

  it("shows status badges with correct classes", () => {
    const dispatches = [
      makeDispatch({ id: "d-1", status: "running" }),
      makeDispatch({ id: "d-2", status: "failed", ticketRef: "KIP-102" }),
    ];
    render(<DispatchList dispatches={dispatches} />);
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("formats duration correctly", () => {
    const dispatches = [
      makeDispatch({ id: "d-1", durationMs: 30000 }), // 30s
      makeDispatch({
        id: "d-2",
        durationMs: 125000,
        ticketRef: "KIP-102",
      }), // 2m 5s
    ];
    render(<DispatchList dispatches={dispatches} />);
    expect(screen.getByText("30s")).toBeInTheDocument();
    expect(screen.getByText("2m 5s")).toBeInTheDocument();
  });

  it("shows -- for null duration", () => {
    render(<DispatchList dispatches={[makeDispatch({ durationMs: null })]} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("renders priority badges", () => {
    const dispatches = [
      makeDispatch({ id: "d-1", priority: "critical" }),
      makeDispatch({ id: "d-2", priority: "low", ticketRef: "KIP-102" }),
    ];
    render(<DispatchList dispatches={dispatches} />);
    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();
  });
});
