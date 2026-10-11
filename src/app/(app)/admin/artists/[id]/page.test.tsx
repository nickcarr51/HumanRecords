import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLabelMember = vi.fn();
const getAdminArtist = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("@/lib/auth/role", () => ({ requireLabelMember: () => requireLabelMember() }));
vi.mock("@/lib/admin/artists", () => ({ getAdminArtist: (...a: unknown[]) => getAdminArtist(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/lib/admin/artists-actions", () => ({ createArtist: vi.fn(), updateArtist: vi.fn(), deleteArtist: vi.fn(), searchLinkableUsers: vi.fn() }));

import EditArtistPage from "./page";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireLabelMember.mockResolvedValue(undefined);
});

describe("EditArtistPage", () => {
  it("gates before loading", async () => {
    requireLabelMember.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(EditArtistPage(params("a1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getAdminArtist).not.toHaveBeenCalled();
  });

  it("404s for an unknown artist", async () => {
    getAdminArtist.mockResolvedValue(null);
    await expect(EditArtistPage(params("a1"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders for a known artist", async () => {
    getAdminArtist.mockResolvedValue({ id: "a1", name: "H", bio: null, createdAt: "2026-10-01T00:00:00Z", trackCount: 0, albumCount: 0, linkedUser: null });
    expect(await EditArtistPage(params("a1"))).toBeTruthy();
  });
});
