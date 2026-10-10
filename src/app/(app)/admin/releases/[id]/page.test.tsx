import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLabelMember = vi.fn();
const getAdminRelease = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("@/lib/auth/role", () => ({ requireLabelMember: () => requireLabelMember() }));
vi.mock("@/lib/admin/releases", () => ({ getAdminRelease: (...a: unknown[]) => getAdminRelease(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/components/AdminReleases", () => ({ EditReleaseForm: () => null }));

import EditReleasePage from "./page";

const props = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("EditReleasePage", () => {
  it("rejects non-label-members before reading", async () => {
    requireLabelMember.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(EditReleasePage(props("r1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getAdminRelease).not.toHaveBeenCalled();
  });

  it("404s for an unknown release and renders a known one", async () => {
    requireLabelMember.mockResolvedValue(undefined);
    getAdminRelease.mockResolvedValueOnce(null);
    await expect(EditReleasePage(props("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
    getAdminRelease.mockResolvedValueOnce({ id: "r1", kind: "single", title: "Solo", pinned: false, archived: false, album: null, tracks: [] });
    expect(await EditReleasePage(props("r1"))).toBeTruthy();
  });
});
