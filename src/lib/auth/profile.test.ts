import { describe, expect, it, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

import { getOwnName } from "./profile";

beforeEach(() => maybeSingle.mockReset());

describe("getOwnName", () => {
  it("returns the trimmed name", async () => {
    maybeSingle.mockResolvedValue({ data: { name: "  Pat " }, error: null });
    expect(await getOwnName("u1")).toBe("Pat");
  });

  it("returns null for a blank name, a missing row, or an error", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { name: "  " }, error: null });
    expect(await getOwnName("u2")).toBeNull();
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await getOwnName("u3")).toBeNull();
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    expect(await getOwnName("u4")).toBeNull();
  });
});
