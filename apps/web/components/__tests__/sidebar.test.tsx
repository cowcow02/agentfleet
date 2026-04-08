import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "../sidebar";

// Mock next/navigation
const mockPush = vi.fn();
const mockUsePathname = vi.fn(() => "/dashboard");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
}));

// Mock next-themes
const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: mockSetTheme }),
}));

// Mock auth-client
const mockSignOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth-client", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
  useSession: () => ({
    data: {
      user: {
        name: "John Doe",
        email: "john@example.com",
      },
    },
  }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  mockPush.mockReset();
  mockSetTheme.mockReset();
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockUsePathname.mockReturnValue("/dashboard");
});

describe("Sidebar", () => {
  it("renders all nav links", () => {
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Dispatches")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders app branding", () => {
    render(<Sidebar />);
    expect(screen.getByText("AgentFleet")).toBeInTheDocument();
    expect(screen.getByText("AF")).toBeInTheDocument();
  });

  it("highlights active link with active class", () => {
    mockUsePathname.mockReturnValue("/agents");
    render(<Sidebar />);

    const agentsLink = screen.getByText("Agents").closest("a");
    expect(agentsLink?.className).toContain("bg-sidebar-accent");
    expect(agentsLink?.className).toContain("text-sidebar-primary");

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink?.className).not.toContain("text-sidebar-primary");
  });

  it("displays user name and email", () => {
    render(<Sidebar />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("displays user initials in avatar", () => {
    render(<Sidebar />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("calls signOut and redirects on sign out button click", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const signOutBtn = screen.getByTitle("Sign out");
    await user.click(signOutBtn);

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("toggles theme on theme button click", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const themeBtn = screen.getByTitle("Toggle theme");
    await user.click(themeBtn);

    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("nav links point to correct hrefs", () => {
    render(<Sidebar />);
    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByText("Agents").closest("a")).toHaveAttribute(
      "href",
      "/agents",
    );
    expect(screen.getByText("Dispatches").closest("a")).toHaveAttribute(
      "href",
      "/dispatches",
    );
    expect(screen.getByText("Settings").closest("a")).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});
