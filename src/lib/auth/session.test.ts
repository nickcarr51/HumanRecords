import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims } })),
}));

import { getSessionUser } from "./session";

beforeEach(() => getClaims.mockReset());

describe("getSessionUser", () => {
  it("returns claims when signed in", async () => {
    getClaims.mockResolvedValue({ data: { claims: { email: "ada@example.com", sub: "u1" } } });
    expect(await getSessionUser()).toEqual({ email: "ada@example.com", sub: "u1" });
  });

  it("returns null when signed out", async () => {
    getClaims.mockResolvedValue({ data: null });
    expect(await getSessionUser()).toBeNull();
  });
});
