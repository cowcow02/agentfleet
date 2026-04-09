import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();

vi.mock("@agentfleet/db", () => {
  const apiKeys = {
    organizationId: "organization_id",
    userId: "user_id",
    keyHash: "key_hash",
  };
  return {
    db: {
      select: (cols?: any) => ({
        from: () => ({
          where: (w: any) => ({
            limit: () => mockDbSelect(w),
          }),
        }),
      }),
    },
    apiKeys,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
  };
});

import { resolveApiKey } from "../api-key-auth";

describe("resolveApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for non-afk_ tokens", async () => {
    const result = await resolveApiKey("not_an_afk_token");
    expect(result).toBeNull();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns organizationId and userId for valid API key", async () => {
    mockDbSelect.mockResolvedValue([{ organizationId: "org-1", userId: "user-1" }]);

    const result = await resolveApiKey("afk_valid_key_here");
    expect(result).toEqual({ organizationId: "org-1", userId: "user-1" });
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it("returns null when API key not found in database", async () => {
    mockDbSelect.mockResolvedValue([]);

    const result = await resolveApiKey("afk_unknown_key");
    expect(result).toBeNull();
  });
});
