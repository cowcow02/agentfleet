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
vi.mock("@/lib/api", () => ({
  createDispatch: (...args: unknown[]) => mockCreateDispatch(...args),
  fetchLinearIssues: (...args: unknown[]) => mockFetchLinearIssues(...args),
}));

beforeEach(() => {
  mockCreateDispatch.mockReset();
  mockFetchLinearIssues.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
});

describe("DispatchForm", () => {
  it("renders Manual and Linear tabs", () => {
    render(<DispatchForm />);
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("From Linear")).toBeInTheDocument();
  });

  it("renders manual form fields", () => {
    render(<DispatchForm />);
    expect(screen.getByText("Ticket ID")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Labels (comma-sep)")).toBeInTheDocument();
    expect(screen.getByText("Description (optional)")).toBeInTheDocument();
  });

  it("has a submit button", () => {
    render(<DispatchForm />);
    expect(screen.getByRole("button", { name: "Dispatch" })).toBeInTheDocument();
  });

  it("shows error toast when labels are empty", async () => {
    const user = userEvent.setup();
    render(<DispatchForm />);

    await user.type(screen.getByPlaceholderText("KIP-301"), "KIP-1");
    await user.type(screen.getByPlaceholderText("Describe the ticket"), "Test task");
    await user.type(screen.getByPlaceholderText("backend, feature"), "  , , ");

    await user.click(screen.getByRole("button", { name: "Dispatch" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "At least one label is required for agent matching",
      );
    });
    expect(mockCreateDispatch).not.toHaveBeenCalled();
  });

  it("calls createDispatch on valid submit", async () => {
    mockCreateDispatch.mockResolvedValue({
      id: "uuid-1",
      agentName: "agent-1",
      machineName: "machine-1",
      status: "dispatched",
    });

    const user = userEvent.setup();
    render(<DispatchForm />);

    await user.type(screen.getByPlaceholderText("KIP-301"), "KIP-301");
    await user.type(screen.getByPlaceholderText("Describe the ticket"), "Implement auth");
    await user.type(screen.getByPlaceholderText("backend, feature"), "frontend, react");
    await user.type(
      screen.getByPlaceholderText("Additional context for the agent..."),
      "Some details",
    );

    await user.click(screen.getByRole("button", { name: "Dispatch" }));

    await waitFor(() => {
      expect(mockCreateDispatch).toHaveBeenCalledWith({
        ticketRef: "KIP-301",
        title: "Implement auth",
        description: "Some details",
        labels: ["frontend", "react"],
        priority: "medium",
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("Dispatched to agent-1 on machine-1");
  });

  it("shows error toast on API failure", async () => {
    mockCreateDispatch.mockRejectedValue(new Error("Server error"));

    const user = userEvent.setup();
    render(<DispatchForm />);

    await user.type(screen.getByPlaceholderText("KIP-301"), "KIP-1");
    await user.type(screen.getByPlaceholderText("Describe the ticket"), "Test");
    await user.type(screen.getByPlaceholderText("backend, feature"), "backend");

    await user.click(screen.getByRole("button", { name: "Dispatch" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Server error");
    });
  });

  it("resets form after successful submit", async () => {
    mockCreateDispatch.mockResolvedValue({
      id: "uuid-1",
      agentName: "agent-1",
      machineName: "machine-1",
      status: "dispatched",
    });

    const user = userEvent.setup();
    render(<DispatchForm />);

    const ticketInput = screen.getByPlaceholderText("KIP-301");
    const titleInput = screen.getByPlaceholderText("Describe the ticket");

    await user.type(ticketInput, "KIP-1");
    await user.type(titleInput, "Test");
    await user.type(screen.getByPlaceholderText("backend, feature"), "tag");

    await user.click(screen.getByRole("button", { name: "Dispatch" }));

    await waitFor(() => {
      expect(ticketInput).toHaveValue("");
      expect(titleInput).toHaveValue("");
    });
  });

  describe("Linear tab", () => {
    it("auto-loads issues when switching to Linear tab", async () => {
      mockFetchLinearIssues.mockResolvedValue({ issues: [] });

      const user = userEvent.setup();
      render(<DispatchForm />);

      await user.click(screen.getByText("From Linear"));

      await waitFor(() => {
        expect(mockFetchLinearIssues).toHaveBeenCalled();
      });
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

      const user = userEvent.setup();
      render(<DispatchForm />);

      await user.click(screen.getByText("From Linear"));

      await waitFor(() => {
        expect(screen.getByText("LIN-1")).toBeInTheDocument();
        expect(screen.getByText("Linear issue 1")).toBeInTheDocument();
        expect(screen.getByText(/In Progress/)).toBeInTheDocument();
        expect(screen.getByText(/bug/)).toBeInTheDocument();
      });
    });

    it("dispatches selected Linear issue", async () => {
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

      await user.click(screen.getByText("From Linear"));

      await waitFor(() => {
        expect(screen.getByText("LIN-1")).toBeInTheDocument();
      });

      // Click the Dispatch button next to the issue
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

      const user = userEvent.setup();
      render(<DispatchForm />);

      await user.click(screen.getByText("From Linear"));

      await waitFor(() => {
        expect(screen.getByText(/No config/)).toBeInTheDocument();
      });
    });
  });
});
