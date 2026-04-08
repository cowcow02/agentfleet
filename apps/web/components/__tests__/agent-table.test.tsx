import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentTable } from "../agent-table";
import type { Agent } from "@agentfleet/types";

// Make heartbeat recent so agents show as "online" by default
function recentHeartbeat() {
  return new Date().toISOString();
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "code-agent",
    machine: "machine-1",
    tags: ["frontend", "react"],
    capacity: 3,
    running: 0,
    lastHeartbeat: recentHeartbeat(),
    ...overrides,
  };
}

describe("AgentTable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows empty state when no agents", () => {
    render(<AgentTable agents={[]} />);
    expect(
      screen.getByText("No agents connected. Start a daemon to register agents."),
    ).toBeInTheDocument();
  });

  it("renders table headers", () => {
    render(<AgentTable agents={[makeAgent()]} />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders agent name", () => {
    render(<AgentTable agents={[makeAgent()]} />);
    expect(screen.getByText("code-agent")).toBeInTheDocument();
  });

  it("renders tags", () => {
    render(<AgentTable agents={[makeAgent()]} />);
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
  });

  it("displays capacity as running / capacity", () => {
    render(<AgentTable agents={[makeAgent({ running: 1, capacity: 3 })]} />);
    // Component renders: <span>1</span>{" / "}{agent.capacity} — text is split across elements
    // Find the container that has the full text
    expect(
      screen.getByText((_content, element) => {
        return element?.textContent === "1 / 3" && element?.tagName === "DIV";
      }),
    ).toBeInTheDocument();
  });

  it("shows Online when agent has recent heartbeat and running is 0", () => {
    render(<AgentTable agents={[makeAgent({ running: 0, capacity: 3 })]} />);
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("shows Busy when agent has recent heartbeat and running > 0", () => {
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

  it("shows Offline when heartbeat is stale", () => {
    const staleHeartbeat = new Date(Date.now() - 60000).toISOString();
    render(<AgentTable agents={[makeAgent({ lastHeartbeat: staleHeartbeat, running: 0 })]} />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("hover on agent row changes background via mouseEnter/mouseLeave", () => {
    render(<AgentTable agents={[makeAgent()]} />);

    // Find the row element containing the agent name
    const agentNameEl = screen.getByText("code-agent");
    // The row is the grid div parent - walk up from the name div
    const row = agentNameEl.parentElement!.parentElement! as HTMLElement;

    fireEvent.mouseEnter(row);
    expect(row.style.background).toBe("var(--af-surface-hover)");

    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe("transparent");
  });

  it("assigns correct tag classes for known tags", () => {
    const agents = [
      makeAgent({
        tags: [
          "backend",
          "be",
          "api",
          "frontend",
          "fe",
          "bug",
          "feature",
          "question",
          "explore",
          "simple",
          "refactor",
          "unknown-tag",
        ],
      }),
    ];
    render(<AgentTable agents={agents} />);
    expect(screen.getByText("backend")).toHaveClass("af-tag-backend");
    expect(screen.getByText("be")).toHaveClass("af-tag-backend");
    expect(screen.getByText("api")).toHaveClass("af-tag-backend");
    expect(screen.getByText("frontend")).toHaveClass("af-tag-frontend");
    expect(screen.getByText("fe")).toHaveClass("af-tag-frontend");
    expect(screen.getByText("bug")).toHaveClass("af-tag-bug");
    expect(screen.getByText("feature")).toHaveClass("af-tag-feature");
    expect(screen.getByText("question")).toHaveClass("af-tag-question");
    expect(screen.getByText("explore")).toHaveClass("af-tag-question");
    expect(screen.getByText("simple")).toHaveClass("af-tag-simple");
    expect(screen.getByText("refactor")).toHaveClass("af-tag-question");
    expect(screen.getByText("unknown-tag")).toHaveClass("af-tag-default");
  });
});
