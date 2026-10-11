import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentRole = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/auth/role", () => ({ getCurrentRole: () => getCurrentRole() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));

import { activeLabelMemberId } from "./caller";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRole.mockResolvedValue("label_member");
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("activeLabelMemberId", () => {
  it("returns null without asking the auth server when the role isn't label_member", async () => {
    getCurrentRole.mockResolvedValue("artist");
    expect(await activeLabelMemberId()).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns null when the auth server refuses the token (banned user)", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { code: "user_banned" } });
    expect(await activeLabelMemberId()).toBeNull();
  });

  it("returns the user id for an active label member", async () => {
    expect(await activeLabelMemberId()).toBe("u1");
  });
});
