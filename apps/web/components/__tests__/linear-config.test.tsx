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

    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    // Should not show Remove button
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows configured state with Connected badge", async () => {
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

    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
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
      expect(screen.getByLabelText("Trigger Status")).toHaveValue("In Progress");
    });

    expect(
      screen.getByLabelText("Trigger Labels (comma-separated)"),
    ).toHaveValue("agent, auto");
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
      expect(
        screen.getByText("https://fleet.example.com/api/webhooks/linear"),
      ).toBeInTheDocument();
    });
  });

  it("renders form fields", async () => {
    mockFetchLinearConfig.mockResolvedValue({ configured: false });
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Key/)).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Trigger Status")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Trigger Labels (comma-separated)"),
    ).toBeInTheDocument();
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
      expect(screen.getByLabelText(/API Key/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/API Key/), "lin_api_test123");
    await user.type(screen.getByLabelText("Trigger Status"), "In Progress");
    await user.type(
      screen.getByLabelText("Trigger Labels (comma-separated)"),
      "agent, auto",
    );

    await user.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(mockUpdateLinearConfig).toHaveBeenCalledWith({
        apiKey: "lin_api_test123",
        triggerStatus: "In Progress",
        triggerLabels: ["agent", "auto"],
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("Linear integration updated");
  });

  it("shows error toast on save failure", async () => {
    mockFetchLinearConfig.mockResolvedValue({ configured: false });
    mockUpdateLinearConfig.mockRejectedValue(new Error("Bad API key"));

    const user = userEvent.setup();
    render(<LinearConfig />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Key/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/API Key/), "bad-key");
    await user.type(screen.getByLabelText("Trigger Status"), "Done");

    await user.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Bad API key");
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

    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Linear integration removed",
    );

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
