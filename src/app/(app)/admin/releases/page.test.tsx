import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLabelMember = vi.fn();
const getAdminReleases = vi.fn();
vi.mock("@/lib/auth/role", () => ({ requireLabelMember: () => requireLabelMember() }));
vi.mock("@/lib/admin/releases", () => ({ getAdminReleases: (...a: unknown[]) => getAdminReleases(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/admin/release-actions", () => ({}));

import AdminReleasesPage from "./page";

const props = (archived?: string) => ({ searchParams: Promise.resolve(archived ? { archived } : {}) });

beforeEach(() => {
  vi.clearAllMocks();
  getAdminReleases.mockResolvedValue([]);
});

describe("AdminReleasesPage", () => {
  it("rejects before loading anything when the caller isn't a label member", async () => {
    requireLabelMember.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(AdminReleasesPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getAdminReleases).not.toHaveBeenCalled();
  });

  it("renders for label members, and renders an error instead of throwing when the read fails", async () => {
    requireLabelMember.mockResolvedValue(undefined);
    expect(await AdminReleasesPage(props("1"))).toBeTruthy();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    getAdminReleases.mockRejectedValue(new Error("boom"));
    expect(await AdminReleasesPage(props())).toBeTruthy();
    spy.mockRestore();
  });
});
