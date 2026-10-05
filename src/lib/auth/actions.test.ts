import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const redirect = vi.fn((_url: string): never => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signInWithOtp, verifyOtp } })),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

import { requestOtp, submitOtp } from "./actions";

beforeEach(() => {
  signInWithOtp.mockReset();
  verifyOtp.mockReset();
  redirect.mockClear();
});

describe("requestOtp", () => {
  it("rejects an empty email without calling Supabase", async () => {
    const res = await requestOtp("   ");
    expect(res.error).toMatch(/email/i);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("requests an OTP for an existing user only (shouldCreateUser: false)", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    const res = await requestOtp("Ada@Example.com ");
    expect(res.error).toBeNull();
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: { shouldCreateUser: false },
    });
  });

  it("maps rate-limit errors to friendly copy", async () => {
    signInWithOtp.mockResolvedValue({
      error: { message: "email rate limit exceeded" },
    });
    const res = await requestOtp("ada@example.com");
    expect(res.error).toMatch(/too many|wait/i);
  });

  it("hides raw wording behind a generic message for unknown errors", async () => {
    signInWithOtp.mockResolvedValue({
      error: { message: "internal boom xyz" },
    });
    const res = await requestOtp("ada@example.com");
    expect(res.error).toMatch(/something went wrong/i);
    expect(res.error).not.toMatch(/boom/i);
  });

  it("maps the invite-only guard error to invite-aware copy", async () => {
    signInWithOtp.mockResolvedValue({
      error: { message: "Signups not allowed for otp" },
    });
    const res = await requestOtp("stranger@example.com");
    expect(res.error).toMatch(/invitation/i);
    expect(res.error).not.toMatch(/signup/i);
  });
});

describe("submitOtp", () => {
  it("verifies the code with type 'email' and redirects on success", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    await expect(submitOtp("ada@example.com", "123456")).rejects.toThrow("NEXT_REDIRECT");
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      token: "123456",
      type: "email",
    });
    expect(redirect).toHaveBeenCalledWith("/feed");
  });

  it("returns a friendly message and does not redirect on failure", async () => {
    verifyOtp.mockResolvedValue({
      error: { message: "Token has expired or is invalid" },
    });
    const res = await submitOtp("ada@example.com", "000000");
    expect(res.error).toMatch(/invalid or expired/i);
    expect(res.error).not.toMatch(/token/i); // raw wording not leaked
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to a safe next path when provided", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    await expect(
      submitOtp("ada@example.com", "123456", "/dashboard/settings"),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard/settings");
  });

  it("ignores an unsafe next path and redirects to /feed", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    await expect(
      submitOtp("ada@example.com", "123456", "https://evil.example"),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/feed");
  });
});

describe("signOut", () => {
  it("signs out and redirects to /login", async () => {
    const signOutFn = vi.fn().mockResolvedValue({ error: null });
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      auth: { signOut: signOutFn },
    });
    const { signOut } = await import("./actions");
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");
    expect(signOutFn).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
