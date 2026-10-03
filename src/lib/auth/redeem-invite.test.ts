import { beforeEach, describe, expect, it, vi } from "vitest";

const claimInvite = vi.fn();
const restoreInvite = vi.fn();
const getUserById = vi.fn();
const generateLink = vi.fn();
const verifyOtp = vi.fn();
const redirect = vi.fn((..._a: unknown[]) => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/lib/invites/store", () => ({
  claimInvite: (...a: unknown[]) => claimInvite(...a),
  restoreInvite: (...a: unknown[]) => restoreInvite(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ auth: { admin: { getUserById, generateLink } } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { verifyOtp } }) }));
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a) }));

import { redeemInvite } from "./actions";

const TOKEN = "a".repeat(43);
const CLAIM = { userId: "u1", usedAt: "2026-10-02T12:00:00.000Z" };

beforeEach(() => {
  vi.clearAllMocks();
  claimInvite.mockResolvedValue(CLAIM);
  restoreInvite.mockResolvedValue(undefined);
  getUserById.mockResolvedValue({ data: { user: { email: "jane@example.com" } }, error: null });
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: "HASH" } }, error: null });
  verifyOtp.mockResolvedValue({ error: null });
});

describe("redeemInvite", () => {
  it("claims, mints a session on the cookie client, and redirects to /feed", async () => {
    await expect(redeemInvite(TOKEN)).rejects.toThrow("NEXT_REDIRECT");
    expect(claimInvite).toHaveBeenCalledWith(expect.anything(), TOKEN);
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "jane@example.com" });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "HASH", type: "email" });
    expect(redirect).toHaveBeenCalledWith("/feed");
    expect(restoreInvite).not.toHaveBeenCalled();
  });

  it("returns USED and never generates a link when the claim misses", async () => {
    claimInvite.mockResolvedValue(null);
    const res = await redeemInvite(TOKEN);
    expect(res.error).toBe("That link has already been used — sign in with your email below.");
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("rejects malformed tokens without touching the database", async () => {
    const res = await redeemInvite("short");
    expect(res.error).toMatch(/already been used/);
    expect(claimInvite).not.toHaveBeenCalled();
  });

  it("restores the token and returns FAILED when verifyOtp fails", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired" } });
    const res = await redeemInvite(TOKEN);
    expect(res.error).toBe("Couldn't sign you in — try again, or use your email below.");
    expect(restoreInvite).toHaveBeenCalledWith(expect.anything(), CLAIM, TOKEN);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("restores the token when generateLink fails", async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await redeemInvite(TOKEN);
    expect(res.error).toMatch(/couldn't sign you in/i);
    expect(restoreInvite).toHaveBeenCalledWith(expect.anything(), CLAIM, TOKEN);
  });

  it("still returns FAILED if the restore itself fails", async () => {
    getUserById.mockResolvedValue({ data: { user: null }, error: { message: "gone" } });
    restoreInvite.mockRejectedValue(new Error("db down"));
    const res = await redeemInvite(TOKEN);
    expect(res.error).toMatch(/couldn't sign you in/i);
  });

  it("returns FAILED when the claim query errors", async () => {
    claimInvite.mockRejectedValue(new Error("db down"));
    const res = await redeemInvite(TOKEN);
    expect(res.error).toMatch(/couldn't sign you in/i);
    expect(restoreInvite).not.toHaveBeenCalled();
  });
});
