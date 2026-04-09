import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsCards } from "../stats-cards";
import type { DashboardStatsResponse } from "@agentfleet/types";

const fullStats: DashboardStatsResponse = {
  machinesOnline: 3,
  agentsRegistered: 7,
  runningJobs: 2,
  totalDispatches: 42,
  completed: 38,
  failed: 2,
  avgDurationSeconds: 120,
  totalAgentSeconds: 5040,
};

describe("StatsCards", () => {
  it("renders all 7 stat cards with correct labels", () => {
    render(<StatsCards stats={fullStats} />);
    expect(screen.getByText("Machines Online")).toBeInTheDocument();
    expect(screen.getByText("Agents Registered")).toBeInTheDocument();
    expect(screen.getByText("Running Jobs")).toBeInTheDocument();
    expect(screen.getByText("Total Dispatches")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Avg Duration")).toBeInTheDocument();
  });

  it("displays numbers from props", () => {
    render(<StatsCards stats={fullStats} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
  });

  it("formats avgDurationSeconds as human-readable duration", () => {
    render(<StatsCards stats={fullStats} />);
    // 120 seconds = 2m 0s
    expect(screen.getByText("2m 0s")).toBeInTheDocument();
  });

  it("formats short durations as seconds", () => {
    render(<StatsCards stats={{ ...fullStats, avgDurationSeconds: 45 }} />);
    expect(screen.getByText("45s")).toBeInTheDocument();
  });

  it("formats hour-level durations", () => {
    render(<StatsCards stats={{ ...fullStats, avgDurationSeconds: 3661 }} />);
    expect(screen.getByText("1h 1m")).toBeInTheDocument();
  });

  it("handles zero values", () => {
    const zeroStats: DashboardStatsResponse = {
      machinesOnline: 0,
      agentsRegistered: 0,
      runningJobs: 0,
      totalDispatches: 0,
      completed: 0,
      failed: 0,
      avgDurationSeconds: 0,
      totalAgentSeconds: 0,
    };
    render(<StatsCards stats={zeroStats} />);
    // 7 cards, most show "0", avgDuration shows "0s"
    const zeroes = screen.getAllByText("0");
    expect(zeroes.length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("0s")).toBeInTheDocument();
  });

  it("shows em-dash when stats is null (loading state)", () => {
    render(<StatsCards stats={null} />);
    const dashes = screen.getAllByText("\u2014");
    expect(dashes).toHaveLength(7);
  });
});
