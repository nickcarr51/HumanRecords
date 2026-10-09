import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnusedInvite = vi.fn();
const maybeSingle = vi.fn();
vi.mock("@/lib/invites/store", () => ({ findUnusedInvite: (...a: unknown[]) => findUnusedInvite(...a) }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

import { getInviteGreeting } from "./invite";

const TOKEN = "a".repeat(43);

beforeEach(() => vi.clearAllMocks());

describe("getInviteGreeting", () => {
  it("returns the invited user's name for an unused token", async () => {
    findUnusedInvite.mockResolvedValue({ userId: "u1" });
    maybeSingle.mockResolvedValue({ data: { name: "Jane" }, error: null });
    expect(await getInviteGreeting(TOKEN)).toEqual({ name: "Jane" });
  });

  it("returns name null when the user has no name", async () => {
    findUnusedInvite.mockResolvedValue({ userId: "u1" });
    maybeSingle.mockResolvedValue({ data: { name: null }, error: null });
    expect(await getInviteGreeting(TOKEN)).toEqual({ name: null });
  });

  it("returns null for used/unknown tokens", async () => {
    findUnusedInvite.mockResolvedValue(null);
    expect(await getInviteGreeting(TOKEN)).toBeNull();
  });

  it("skips the database for missing or malformed tokens", async () => {
    expect(await getInviteGreeting(undefined)).toBeNull();
    expect(await getInviteGreeting("short")).toBeNull();
    expect(findUnusedInvite).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing on errors", async () => {
    findUnusedInvite.mockRejectedValue(new Error("db down"));
    expect(await getInviteGreeting(TOKEN)).toBeNull();
  });
});
