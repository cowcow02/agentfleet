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
const mockUseSession = vi.fn(() => ({
  data: {
    user: {
      name: "John Doe",
      email: "john@example.com",
    },
  },
}));
vi.mock("@/lib/auth-client", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
  useSession: () => mockUseSession(),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    style,
    onMouseEnter,
    onMouseLeave,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    onMouseEnter?: React.MouseEventHandler;
    onMouseLeave?: React.MouseEventHandler;
  }) => (
    <a
      href={href}
      className={className}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </a>
  ),
}));

beforeEach(() => {
  mockPush.mockReset();
  mockSetTheme.mockReset();
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockUsePathname.mockReturnValue("/dashboard");
  mockUseSession.mockReturnValue({
    data: {
      user: {
        name: "John Doe",
        email: "john@example.com",
      },
    },
  });
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
  });

  it("highlights active link with accent color style", () => {
    mockUsePathname.mockReturnValue("/agents");
    render(<Sidebar />);

    const agentsLink = screen.getByText("Agents").closest("a");
    expect(agentsLink?.style.color).toBe("var(--af-accent)");
    expect(agentsLink?.style.background).toBe("var(--af-accent-subtle)");

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink?.style.color).toBe("var(--af-text-secondary)");
  });

  it("displays user name and email", () => {
    render(<Sidebar />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("displays user initial in avatar", () => {
    render(<Sidebar />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("calls signOut and redirects on sign out button click", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const signOutBtn = screen.getByText("Sign out");
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
    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("Agents").closest("a")).toHaveAttribute("href", "/agents");
    expect(screen.getByText("Dispatches").closest("a")).toHaveAttribute("href", "/dispatches");
    expect(screen.getByText("Settings").closest("a")).toHaveAttribute("href", "/settings");
  });

  it("hover on inactive nav link changes style", async () => {
    const user = userEvent.setup();
    mockUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);

    const agentsLink = screen.getByText("Agents").closest("a")!;
    await user.hover(agentsLink);
    expect(agentsLink.style.background).toBe("var(--af-surface-hover)");
    expect(agentsLink.style.color).toBe("var(--af-text)");

    await user.unhover(agentsLink);
    expect(agentsLink.style.background).toBe("transparent");
    expect(agentsLink.style.color).toBe("var(--af-text-secondary)");
  });

  it("hover on active nav link does not change style", async () => {
    const user = userEvent.setup();
    mockUsePathname.mockReturnValue("/agents");
    render(<Sidebar />);

    const agentsLink = screen.getByText("Agents").closest("a")!;
    const originalBg = agentsLink.style.background;
    const originalColor = agentsLink.style.color;
    await user.hover(agentsLink);
    // Active link should keep its styles
    expect(agentsLink.style.background).toBe(originalBg);
    expect(agentsLink.style.color).toBe(originalColor);
  });

  it("hover on theme toggle button changes style", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const themeBtn = screen.getByTitle("Toggle theme");
    await user.hover(themeBtn);
    expect(themeBtn.style.color).toBe("var(--af-text)");
    expect(themeBtn.style.borderColor).toBe("var(--af-text-tertiary)");

    await user.unhover(themeBtn);
    expect(themeBtn.style.color).toBe("var(--af-text-secondary)");
    expect(themeBtn.style.borderColor).toBe("var(--border)");
  });

  it("shows fallback when user has no name", () => {
    mockUseSession.mockReturnValue({ data: { user: { name: null, email: null } } });
    render(<Sidebar />);
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows fallback when session is null", () => {
    mockUseSession.mockReturnValue({ data: null });
    render(<Sidebar />);
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("hover on sign out button changes style", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const signOutBtn = screen.getByText("Sign out");
    await user.hover(signOutBtn);
    expect(signOutBtn.style.color).toBe("var(--af-danger)");
    expect(signOutBtn.style.borderColor).toBe("var(--af-danger-subtle)");

    await user.unhover(signOutBtn);
    expect(signOutBtn.style.color).toBe("var(--af-text-secondary)");
    expect(signOutBtn.style.borderColor).toBe("var(--border)");
  });
});
