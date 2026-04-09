import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualDispatchSheet } from "../manual-dispatch-sheet";

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockCreateDispatch = vi.fn();
const mockFetchAgents = vi.fn();
vi.mock("@/lib/api", () => ({
  createDispatch: (...args: unknown[]) => mockCreateDispatch(...args),
  fetchAgents: (...args: unknown[]) => mockFetchAgents(...args),
}));

const agentFixture = {
  name: "worker-1",
  machine: "mac-mini-01",
  tags: ["frontend"],
  capacity: 2,
  running: 0,
  lastHeartbeat: "2026-04-09T09:00:00Z",
};

beforeEach(() => {
  mockCreateDispatch.mockReset();
  mockFetchAgents.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
});

describe("ManualDispatchSheet", () => {
  it("fetches agents when opened", async () => {
    mockFetchAgents.mockResolvedValue({ agents: [agentFixture], machinesOnline: 1 });

    render(<ManualDispatchSheet open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(mockFetchAgents).toHaveBeenCalledTimes(1);
    });
  });

  it("does not fetch agents when closed", () => {
    render(<ManualDispatchSheet open={false} onOpenChange={() => {}} />);
    expect(mockFetchAgents).not.toHaveBeenCalled();
  });

  it("shows an empty state when no agents are online", async () => {
    mockFetchAgents.mockResolvedValue({ agents: [], machinesOnline: 0 });

    render(<ManualDispatchSheet open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/no agents online/i)).toBeInTheDocument();
    });
  });

  it("submits the selected agent with the description", async () => {
    mockFetchAgents.mockResolvedValue({ agents: [agentFixture], machinesOnline: 1 });
    mockCreateDispatch.mockResolvedValue({
      id: "d-adhoc",
      agentName: "worker-1",
      machineName: "mac-mini-01",
      status: "dispatched",
    });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<ManualDispatchSheet open onOpenChange={onOpenChange} />);

    // Wait for agents to load and then type + submit. The default-selected
    // agent should be the first fetched agent.
    await waitFor(() => {
      expect(mockFetchAgents).toHaveBeenCalled();
    });

    const description = await screen.findByLabelText(/description/i);
    await user.type(description, "one-off task");

    const submit = screen.getByRole("button", { name: /dispatch/i });
    await user.click(submit);

    await waitFor(() => {
      expect(mockCreateDispatch).toHaveBeenCalledWith({
        agentName: "worker-1",
        machineName: "mac-mini-01",
        description: "one-off task",
      });
    });
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submits with undefined description when empty", async () => {
    mockFetchAgents.mockResolvedValue({ agents: [agentFixture], machinesOnline: 1 });
    mockCreateDispatch.mockResolvedValue({
      id: "d-adhoc",
      agentName: "worker-1",
      machineName: "mac-mini-01",
      status: "dispatched",
    });
    const user = userEvent.setup();

    render(<ManualDispatchSheet open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(mockFetchAgents).toHaveBeenCalled();
    });

    const submit = await screen.findByRole("button", { name: /dispatch/i });
    await user.click(submit);

    await waitFor(() => {
      expect(mockCreateDispatch).toHaveBeenCalledWith({
        agentName: "worker-1",
        machineName: "mac-mini-01",
        description: undefined,
      });
    });
  });

  it("shows an error toast when dispatch fails", async () => {
    mockFetchAgents.mockResolvedValue({ agents: [agentFixture], machinesOnline: 1 });
    mockCreateDispatch.mockRejectedValue(new Error("Agent busy"));
    const user = userEvent.setup();

    render(<ManualDispatchSheet open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(mockFetchAgents).toHaveBeenCalled();
    });

    const submit = await screen.findByRole("button", { name: /dispatch/i });
    await user.click(submit);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Agent busy");
    });
  });
});
