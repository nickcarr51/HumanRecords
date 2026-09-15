import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { verifyOtp } })),
}));

import { GET } from "./route";

const req = (qs: string) =>
  new NextRequest(new Request(`http://127.0.0.1:3000/auth/confirm${qs}`));

beforeEach(() => verifyOtp.mockReset());

describe("GET /auth/confirm", () => {
  it("verifies token_hash and redirects to next on success", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req("?token_hash=abc&type=invite&next=/dashboard"));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "abc" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("redirects to /login?error=auth when params are missing", async () => {
    const res = await GET(req(""));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/login?error=auth");
  });

  it("redirects to /login?error=auth when verify fails", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const res = await GET(req("?token_hash=abc&type=email"));
    expect(res.headers.get("location")).toContain("/login?error=auth");
  });

  it("neutralizes malicious absolute URL in next param", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req("?token_hash=abc&type=invite&next=https://evil.example/phish"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(res.headers.get("location")).not.toContain("evil.example");
  });

  it("neutralizes malicious protocol-relative URL in next param", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req("?token_hash=abc&type=invite&next=//evil.example/phish"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(res.headers.get("location")).not.toContain("evil.example");
  });
});
