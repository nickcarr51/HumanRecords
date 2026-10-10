import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLabelMember = vi.fn();
const listAdminArtists = vi.fn();
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
vi.mock("@/lib/auth/role", () => ({ requireLabelMember: () => requireLabelMember() }));
vi.mock("@/lib/admin/artists", () => ({ listAdminArtists: (...a: unknown[]) => listAdminArtists(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), useRouter: vi.fn(), usePathname: vi.fn(), useSearchParams: vi.fn() }));

import AdminArtistsPage from "./page";

const sp = (o: Record<string, string> = {}) => ({ searchParams: Promise.resolve(o) });

beforeEach(() => {
  vi.clearAllMocks();
  requireLabelMember.mockResolvedValue(undefined);
  listAdminArtists.mockResolvedValue({ artists: [], total: 0, page: 1, pageSize: 20 });
});

describe("AdminArtistsPage", () => {
  it("rejects before loading when the caller isn't a label member", async () => {
    requireLabelMember.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(AdminArtistsPage(sp())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listAdminArtists).not.toHaveBeenCalled();
  });

  it("passes query and page through", async () => {
    expect(await AdminArtistsPage(sp({ q: " hal ", page: "2" }))).toBeTruthy();
    expect(listAdminArtists).toHaveBeenCalledWith(expect.anything(), { query: "hal", page: 2 });
  });

  it("redirects a page past the end to the last real page", async () => {
    listAdminArtists.mockResolvedValue({ artists: [], total: 25, page: 9, pageSize: 20 });
    await expect(AdminArtistsPage(sp({ q: "x", page: "9" }))).rejects.toThrow("REDIRECT:/admin/artists?q=x&page=2");
  });

  it("renders an error instead of throwing when loading fails", async () => {
    listAdminArtists.mockRejectedValue(new Error("boom"));
    expect(await AdminArtistsPage(sp())).toBeTruthy();
  });
});
