import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signInWithOtp, verifyOtp } })),
}));
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a) }));

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

  it("surfaces the Supabase error message", async () => {
    signInWithOtp.mockResolvedValue({ error: { message: "rate limited" } });
    const res = await requestOtp("ada@example.com");
    expect(res.error).toBe("rate limited");
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
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns the error and does not redirect on failure", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "invalid code" } });
    const res = await submitOtp("ada@example.com", "000000");
    expect(res.error).toBe("invalid code");
    expect(redirect).not.toHaveBeenCalled();
  });
});
