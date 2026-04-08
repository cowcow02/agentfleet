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
  it("renders all 5 stat cards with correct labels", () => {
    render(<StatsCards stats={fullStats} />);
    expect(screen.getByText("Machines Online")).toBeInTheDocument();
    expect(screen.getByText("Agents Registered")).toBeInTheDocument();
    expect(screen.getByText("Running Jobs")).toBeInTheDocument();
    expect(screen.getByText("Total Dispatches")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("displays numbers from props", () => {
    render(<StatsCards stats={fullStats} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
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
    const zeroes = screen.getAllByText("0");
    expect(zeroes).toHaveLength(5);
  });

  it("shows dashes when stats is null (loading state)", () => {
    render(<StatsCards stats={null} />);
    const dashes = screen.getAllByText("--");
    expect(dashes).toHaveLength(5);
  });
});
