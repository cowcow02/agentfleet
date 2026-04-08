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
    expect(screen.getByRole("tab", { name: "Manual" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "From Linear" })).toBeInTheDocument();
  });

  it("renders manual form fields", () => {
    render(<DispatchForm />);
    expect(screen.getByLabelText("Ticket Reference")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Labels (comma-separated)")).toBeInTheDocument();
    expect(screen.getByLabelText("Description (optional)")).toBeInTheDocument();
  });

  it("has a submit button", () => {
    render(<DispatchForm />);
    expect(screen.getByRole("button", { name: "Dispatch" })).toBeInTheDocument();
  });

  it("shows error toast when labels are empty", async () => {
    const user = userEvent.setup();
    render(<DispatchForm />);

    await user.type(screen.getByLabelText("Ticket Reference"), "KIP-1");
    await user.type(screen.getByLabelText("Title"), "Test task");
    // Leave labels as empty string but the field is required, so we need to type and clear
    // Actually the HTML required will prevent submit; we need to type something that results in empty labels
    await user.type(screen.getByLabelText("Labels (comma-separated)"), "  , , ");

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

    await user.type(screen.getByLabelText("Ticket Reference"), "KIP-301");
    await user.type(screen.getByLabelText("Title"), "Implement auth");
    await user.type(
      screen.getByLabelText("Labels (comma-separated)"),
      "frontend, react",
    );
    await user.type(
      screen.getByLabelText("Description (optional)"),
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

    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Dispatched to agent-1 on machine-1",
    );
  });

  it("shows error toast on API failure", async () => {
    mockCreateDispatch.mockRejectedValue(new Error("Server error"));

    const user = userEvent.setup();
    render(<DispatchForm />);

    await user.type(screen.getByLabelText("Ticket Reference"), "KIP-1");
    await user.type(screen.getByLabelText("Title"), "Test");
    await user.type(
      screen.getByLabelText("Labels (comma-separated)"),
      "backend",
    );

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

    const ticketInput = screen.getByLabelText("Ticket Reference");
    const titleInput = screen.getByLabelText("Title");

    await user.type(ticketInput, "KIP-1");
    await user.type(titleInput, "Test");
    await user.type(
      screen.getByLabelText("Labels (comma-separated)"),
      "tag",
    );

    await user.click(screen.getByRole("button", { name: "Dispatch" }));

    await waitFor(() => {
      expect(ticketInput).toHaveValue("");
      expect(titleInput).toHaveValue("");
    });
  });

  describe("Linear tab", () => {
    it("shows Load Linear Issues button", async () => {
      const user = userEvent.setup();
      render(<DispatchForm />);

      await user.click(screen.getByRole("tab", { name: "From Linear" }));

      expect(
        screen.getByRole("button", { name: "Load Linear Issues" }),
      ).toBeInTheDocument();
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

      await user.click(screen.getByRole("tab", { name: "From Linear" }));
      await user.click(
        screen.getByRole("button", { name: "Load Linear Issues" }),
      );

      await waitFor(() => {
        expect(screen.getByText("LIN-1")).toBeInTheDocument();
        expect(screen.getByText("Linear issue 1")).toBeInTheDocument();
        expect(screen.getByText("In Progress")).toBeInTheDocument();
        expect(screen.getByText("bug")).toBeInTheDocument();
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

      await user.click(screen.getByRole("tab", { name: "From Linear" }));
      await user.click(
        screen.getByRole("button", { name: "Load Linear Issues" }),
      );

      await waitFor(() => {
        expect(screen.getByText("LIN-1")).toBeInTheDocument();
      });

      // Select the issue
      await user.click(screen.getByText("Linear issue 1"));

      // Dispatch button should appear
      const dispatchBtn = await screen.findByRole("button", {
        name: "Dispatch LIN-1",
      });
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

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Dispatched to agent-2 on machine-2",
      );
    });

    it("shows error toast on fetch issues failure", async () => {
      mockFetchLinearIssues.mockRejectedValue(new Error("No config"));

      const user = userEvent.setup();
      render(<DispatchForm />);

      await user.click(screen.getByRole("tab", { name: "From Linear" }));
      await user.click(
        screen.getByRole("button", { name: "Load Linear Issues" }),
      );

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("No config");
      });
    });
  });
});
