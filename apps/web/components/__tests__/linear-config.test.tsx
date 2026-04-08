import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinearConfig } from "../linear-config";

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
const mockFetchLinearConfig = vi.fn();
const mockUpdateLinearConfig = vi.fn();
const mockDeleteLinearConfig = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchLinearConfig: (...args: unknown[]) => mockFetchLinearConfig(...args),
  updateLinearConfig: (...args: unknown[]) => mockUpdateLinearConfig(...args),
  deleteLinearConfig: (...args: unknown[]) => mockDeleteLinearConfig(...args),
}));

beforeEach(() => {
  mockFetchLinearConfig.mockReset();
  mockUpdateLinearConfig.mockReset();
  mockDeleteLinearConfig.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
});

describe("LinearConfig", () => {
  it("shows loading state initially", () => {
    mockFetchLinearConfig.mockReturnValue(new Promise(() => {})); // never resolves
    render(<LinearConfig />);
    expect(screen.getByText("Loading Linear config...")).toBeInTheDocument();
  });

  it("shows unconfigured state", async () => {
    mockFetchLinearConfig.mockResolvedValue({ configured: false });
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByText("Linear Integration")).toBeInTheDocument();
    });

    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Configuration" })).toBeInTheDocument();
    // Should not show Remove button
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows configured state with Connected indicator", async () => {
    mockFetchLinearConfig.mockResolvedValue({
      configured: true,
      triggerStatus: "In Progress",
      triggerLabels: ["agent", "auto"],
      webhookUrl: "https://example.com/webhook",
    });
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Save Configuration" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("populates form with existing config values", async () => {
    mockFetchLinearConfig.mockResolvedValue({
      configured: true,
      triggerStatus: "In Progress",
      triggerLabels: ["agent", "auto"],
    });
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    // Trigger labels input should have the joined value
    expect(screen.getByPlaceholderText("agent-task, ready-to-build")).toHaveValue("agent, auto");
  });

  it("displays webhook URL when configured", async () => {
    mockFetchLinearConfig.mockResolvedValue({
      configured: true,
      triggerStatus: "In Progress",
      triggerLabels: [],
      webhookUrl: "https://fleet.example.com/api/webhooks/linear",
    });
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByText("https://fleet.example.com/api/webhooks/linear")).toBeInTheDocument();
    });
  });

  it("renders form fields", async () => {
    mockFetchLinearConfig.mockResolvedValue({ configured: false });
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByText(/API Key/)).toBeInTheDocument();
    });

    expect(screen.getByText("Trigger when status changes to")).toBeInTheDocument();
    expect(screen.getByText("Only for labels (comma-separated)")).toBeInTheDocument();
  });

  it("calls updateLinearConfig on save", async () => {
    mockFetchLinearConfig.mockResolvedValue({ configured: false });
    mockUpdateLinearConfig.mockResolvedValue({
      configured: true,
      triggerStatus: "In Progress",
      triggerLabels: ["agent"],
    });

    const user = userEvent.setup();
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByText(/API Key/)).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("lin_api_xxxxxxxx"), "lin_api_test123");
    // Trigger status is a select - change it
    await user.selectOptions(screen.getByRole("combobox"), "in_progress");
    await user.type(screen.getByPlaceholderText("agent-task, ready-to-build"), "agent, auto");

    await user.click(screen.getByRole("button", { name: "Save Configuration" }));

    await waitFor(() => {
      expect(mockUpdateLinearConfig).toHaveBeenCalledWith({
        apiKey: "lin_api_test123",
        triggerStatus: "in_progress",
        triggerLabels: ["agent", "auto"],
      });
    });

    // Component uses inline saveMsg, not toast.success
    await waitFor(() => {
      expect(screen.getByText("Configuration saved.")).toBeInTheDocument();
    });
  });

  it("shows error message on save failure", async () => {
    mockFetchLinearConfig.mockResolvedValue({ configured: false });
    mockUpdateLinearConfig.mockRejectedValue(new Error("Bad API key"));

    const user = userEvent.setup();
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByText(/API Key/)).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("lin_api_xxxxxxxx"), "bad-key");

    await user.click(screen.getByRole("button", { name: "Save Configuration" }));

    await waitFor(() => {
      expect(screen.getByText("Bad API key")).toBeInTheDocument();
    });
  });

  it("calls deleteLinearConfig on remove", async () => {
    mockFetchLinearConfig.mockResolvedValue({
      configured: true,
      triggerStatus: "In Progress",
      triggerLabels: [],
    });
    mockDeleteLinearConfig.mockResolvedValue(undefined);

    // Mock window.confirm
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mockDeleteLinearConfig).toHaveBeenCalled();
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("Linear integration removed");

    vi.restoreAllMocks();
  });

  it("does not delete when confirm is cancelled", async () => {
    mockFetchLinearConfig.mockResolvedValue({
      configured: true,
      triggerStatus: "In Progress",
      triggerLabels: [],
    });

    vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(mockDeleteLinearConfig).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
