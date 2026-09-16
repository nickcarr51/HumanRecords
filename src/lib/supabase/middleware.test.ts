import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims } })),
}));

import { updateSession } from "./middleware";

beforeEach(() => getClaims.mockReset());

describe("updateSession route protection", () => {
  it("sends a signed-out user off a protected route to /login, remembering the path", async () => {
    getClaims.mockResolvedValue({ data: null });

    const res = await updateSession(
      new NextRequest("http://127.0.0.1:3000/dashboard/settings"),
    );

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/dashboard/settings");
  });

  it("bounces a signed-in user off /login to /dashboard", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });

    const res = await updateSession(new NextRequest("http://127.0.0.1:3000/login"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });

  it("lets a signed-in user through to a protected route", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });

    const res = await updateSession(new NextRequest("http://127.0.0.1:3000/dashboard"));

    expect(res.status).toBe(200);
  });

  it("lets a signed-out user reach a public route", async () => {
    getClaims.mockResolvedValue({ data: null });

    const res = await updateSession(new NextRequest("http://127.0.0.1:3000/"));

    expect(res.status).toBe(200);
  });
});
