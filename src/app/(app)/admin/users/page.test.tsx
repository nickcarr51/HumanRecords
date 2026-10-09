import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLabelMember = vi.fn();
const listAdminUsers = vi.fn();
const getSessionUser = vi.fn();
vi.mock("@/lib/auth/role", () => ({ requireLabelMember: () => requireLabelMember() }));
vi.mock("@/lib/admin/users", () => ({ listAdminUsers: (...a: unknown[]) => listAdminUsers(...a) }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/admin/users-actions", () => ({ createUser: vi.fn(), issueInvite: vi.fn(), setUserRole: vi.fn() }));

import AdminUsersPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ sub: "me" });
  listAdminUsers.mockResolvedValue([]);
});

describe("AdminUsersPage", () => {
  it("rejects before loading anything when the caller isn't a label member", async () => {
    requireLabelMember.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(AdminUsersPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it("renders for label members", async () => {
    requireLabelMember.mockResolvedValue(undefined);
    expect(await AdminUsersPage()).toBeTruthy();
    expect(listAdminUsers).toHaveBeenCalledTimes(1);
  });

  it("renders (with an error) instead of throwing when the list fails", async () => {
    requireLabelMember.mockResolvedValue(undefined);
    listAdminUsers.mockRejectedValue(new Error("SITE_URL is not set"));
    expect(await AdminUsersPage()).toBeTruthy();
  });
});
