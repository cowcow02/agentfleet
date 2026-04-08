import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentTable } from "../agent-table";
import type { Agent } from "@agentfleet/types";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "code-agent",
    machine: "machine-1",
    tags: ["frontend", "react"],
    capacity: 3,
    running: 1,
    lastHeartbeat: "2025-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("AgentTable", () => {
  it("shows empty state when no agents", () => {
    render(<AgentTable agents={[]} />);
    expect(
      screen.getByText("No agents connected. Start a daemon to register agents."),
    ).toBeInTheDocument();
  });

  it("renders table headers", () => {
    render(<AgentTable agents={[makeAgent()]} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Last Seen")).toBeInTheDocument();
  });

  it("renders agent name", () => {
    render(<AgentTable agents={[makeAgent()]} />);
    expect(screen.getByText("code-agent")).toBeInTheDocument();
  });

  it("renders tags as badges", () => {
    render(<AgentTable agents={[makeAgent()]} />);
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
  });

  it("displays capacity as running/capacity", () => {
    render(<AgentTable agents={[makeAgent({ running: 1, capacity: 3 })]} />);
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("shows Available when running < capacity", () => {
    render(<AgentTable agents={[makeAgent({ running: 1, capacity: 3 })]} />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("shows Busy when running >= capacity", () => {
    render(<AgentTable agents={[makeAgent({ running: 3, capacity: 3 })]} />);
    expect(screen.getByText("Busy")).toBeInTheDocument();
  });

  it("renders multiple agents", () => {
    const agents = [
      makeAgent({ name: "agent-a", machine: "m1" }),
      makeAgent({ name: "agent-b", machine: "m2" }),
    ];
    render(<AgentTable agents={agents} />);
    expect(screen.getByText("agent-a")).toBeInTheDocument();
    expect(screen.getByText("agent-b")).toBeInTheDocument();
  });
});
