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

  it("renders dispatch card with key data", () => {
    render(<DispatchList dispatches={[makeDispatch()]} />);
    expect(screen.getByText("KIP-101")).toBeInTheDocument();
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    // Agent is shown as "Agent: agent-1"
    expect(screen.getByText("agent-1")).toBeInTheDocument();
    // Source is capitalized: "Manual"
    expect(screen.getByText("Manual")).toBeInTheDocument();
    // Status shown as badge
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("renders dispatch data in rows", () => {
    render(<DispatchList dispatches={[makeDispatch()]} />);
    expect(screen.getByText("KIP-101")).toBeInTheDocument();
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    expect(screen.getByText("agent-1")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
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

  it("shows status badges", () => {
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

  it("renders source badges", () => {
    const dispatches = [
      makeDispatch({ id: "d-1", source: "manual" }),
      makeDispatch({ id: "d-2", source: "linear", ticketRef: "KIP-102" }),
    ];
    render(<DispatchList dispatches={dispatches} />);
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("Linear")).toBeInTheDocument();
  });
});
