import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { getCurrentRole } from "./role";

beforeEach(() => vi.clearAllMocks());

describe("getCurrentRole", () => {
  it("returns the role from current_user_role()", async () => {
    rpc.mockResolvedValue({ data: "label_member", error: null });
    expect(await getCurrentRole()).toBe("label_member");
    expect(rpc).toHaveBeenCalledWith("current_user_role");
  });

  it("returns null on error or no row", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getCurrentRole()).toBeNull();
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getCurrentRole()).toBeNull();
  });
});
