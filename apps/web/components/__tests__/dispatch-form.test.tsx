import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DispatchForm } from "../dispatch-form";

// Mock sonner
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock API
const mockCreateDispatch = vi.fn();
const mockFetchLinearIssues = vi.fn();
const mockFetchAgents = vi.fn();
vi.mock("@/lib/api", () => ({
  createDispatch: (...args: unknown[]) => mockCreateDispatch(...args),
  fetchLinearIssues: (...args: unknown[]) => mockFetchLinearIssues(...args),
  fetchAgents: (...args: unknown[]) => mockFetchAgents(...args),
}));

beforeEach(() => {
  mockCreateDispatch.mockReset();
  mockFetchLinearIssues.mockReset();
  mockFetchAgents.mockReset();
  mockFetchAgents.mockResolvedValue({ agents: [], machinesOnline: 0 });
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
});

describe("DispatchForm", () => {
  it("renders Tickets heading", () => {
    mockFetchLinearIssues.mockResolvedValue({ issues: [] });
    render(<DispatchForm />);
    expect(screen.getByText("Tickets")).toBeInTheDocument();
  });

  it("does not render Manual or From Linear tab buttons", () => {
    mockFetchLinearIssues.mockResolvedValue({ issues: [] });
    render(<DispatchForm />);
    expect(screen.queryByText("Manual")).not.toBeInTheDocument();
    expect(screen.queryByText("From Linear")).not.toBeInTheDocument();
  });

  it("renders a Manual Dispatch CTA button", () => {
    mockFetchLinearIssues.mockResolvedValue({ issues: [] });
    render(<DispatchForm />);
    expect(screen.getByRole("button", { name: /manual dispatch/i })).toBeInTheDocument();
  });

  it("opens the Manual Dispatch sheet when the CTA is clicked", async () => {
    mockFetchLinearIssues.mockResolvedValue({ issues: [] });
    mockFetchAgents.mockResolvedValue({
      agents: [
        {
          name: "worker-1",
          machine: "mac-mini-01",
          tags: ["frontend"],
          capacity: 2,
          running: 0,
          lastHeartbeat: "2026-04-09T09:00:00Z",
        },
      ],
      machinesOnline: 1,
    });

    const user = userEvent.setup();
    render(<DispatchForm />);

    await user.click(screen.getByRole("button", { name: /manual dispatch/i }));

    await waitFor(() => {
      expect(mockFetchAgents).toHaveBeenCalled();
    });
    // Sheet title is rendered
    expect(screen.getAllByText(/manual dispatch/i).length).toBeGreaterThan(1);
  });

  it("auto-loads Linear issues on mount", async () => {
    mockFetchLinearIssues.mockResolvedValue({ issues: [] });
    render(<DispatchForm />);

    await waitFor(() => {
      expect(mockFetchLinearIssues).toHaveBeenCalledTimes(1);
    });
  });

  it("shows loading state while fetching", () => {
    mockFetchLinearIssues.mockReturnValue(new Promise(() => {})); // never resolves
    render(<DispatchForm />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("loads and displays issues", async () => {
    mockFetchLinearIssues.mockResolvedValue({
      issues: [
        {
          identifier: "LIN-1",
          title: "Linear issue 1",
          description: null,
          state: "In Progress",
          labels: ["bug"],
          priority: 1,
          assignee: null,
          url: "https://linear.app/issue/LIN-1",
        },
      ],
    });

    render(<DispatchForm />);

    await waitFor(() => {
      expect(screen.getByText("LIN-1")).toBeInTheDocument();
      expect(screen.getByText("Linear issue 1")).toBeInTheDocument();
      expect(screen.getByText(/In Progress/)).toBeInTheDocument();
      expect(screen.getByText(/bug/)).toBeInTheDocument();
    });
  });

  it("dispatches selected issue", async () => {
    mockFetchLinearIssues.mockResolvedValue({
      issues: [
        {
          identifier: "LIN-1",
          title: "Linear issue 1",
          description: "some desc",
          state: "In Progress",
          labels: ["bug", "frontend"],
          priority: 1,
          assignee: null,
          url: "https://linear.app/issue/LIN-1",
        },
      ],
    });
    mockCreateDispatch.mockResolvedValue({
      id: "uuid-2",
      agentName: "agent-2",
      machineName: "machine-2",
      status: "dispatched",
    });

    const user = userEvent.setup();
    render(<DispatchForm />);

    await waitFor(() => {
      expect(screen.getByText("LIN-1")).toBeInTheDocument();
    });

    const dispatchBtn = screen.getByRole("button", { name: "Dispatch" });
    await user.click(dispatchBtn);

    await waitFor(() => {
      expect(mockCreateDispatch).toHaveBeenCalledWith({
        ticketRef: "LIN-1",
        title: "Linear issue 1",
        description: "some desc",
        labels: ["bug", "frontend"],
        priority: "medium",
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("Dispatched to agent-2 on machine-2");
  });

  it("shows error message on fetch issues failure", async () => {
    mockFetchLinearIssues.mockRejectedValue(new Error("No config"));

    render(<DispatchForm />);

    await waitFor(() => {
      expect(screen.getByText(/No config/)).toBeInTheDocument();
    });
  });

  it("shows generic error message on non-Error fetch failure", async () => {
    mockFetchLinearIssues.mockRejectedValue("unknown");

    render(<DispatchForm />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load issues/)).toBeInTheDocument();
    });
  });

  it("shows no matching issues message when loaded and empty", async () => {
    mockFetchLinearIssues.mockResolvedValue({ issues: [] });

    render(<DispatchForm />);

    await waitFor(() => {
      expect(screen.getByText(/no matching issues/i)).toBeInTheDocument();
    });
  });

  it("shows error toast on dispatch failure", async () => {
    mockFetchLinearIssues.mockResolvedValue({
      issues: [
        {
          identifier: "LIN-5",
          title: "Fail issue",
          description: null,
          state: "Todo",
          labels: ["bug"],
          priority: 1,
          assignee: null,
          url: "https://linear.app/issue/LIN-5",
        },
      ],
    });
    mockCreateDispatch.mockRejectedValue(new Error("Agent busy"));

    const user = userEvent.setup();
    render(<DispatchForm />);

    await waitFor(() => {
      expect(screen.getByText("LIN-5")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Dispatch" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Agent busy");
    });
  });

  it("shows generic error toast on dispatch failure with non-Error", async () => {
    mockFetchLinearIssues.mockResolvedValue({
      issues: [
        {
          identifier: "LIN-6",
          title: "Fail issue 2",
          description: null,
          state: "Todo",
          labels: [],
          priority: 1,
          assignee: null,
          url: "https://linear.app/issue/LIN-6",
        },
      ],
    });
    mockCreateDispatch.mockRejectedValue("unknown");

    const user = userEvent.setup();
    render(<DispatchForm />);

    await waitFor(() => {
      expect(screen.getByText("LIN-6")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Dispatch" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Dispatch failed");
    });
  });

  it("dispatches issue with null description as undefined", async () => {
    mockFetchLinearIssues.mockResolvedValue({
      issues: [
        {
          identifier: "LIN-7",
          title: "No desc issue",
          description: null,
          state: "Todo",
          labels: ["frontend"],
          priority: 1,
          assignee: null,
          url: "https://linear.app/issue/LIN-7",
        },
      ],
    });
    mockCreateDispatch.mockResolvedValue({
      id: "uuid-3",
      agentName: "agent-3",
      machineName: "machine-3",
      status: "dispatched",
    });

    const user = userEvent.setup();
    render(<DispatchForm />);

    await waitFor(() => {
      expect(screen.getByText("LIN-7")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Dispatch" }));

    await waitFor(() => {
      expect(mockCreateDispatch).toHaveBeenCalledWith({
        ticketRef: "LIN-7",
        title: "No desc issue",
        description: undefined,
        labels: ["frontend"],
        priority: "medium",
      });
    });
  });
});
