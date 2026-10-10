import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const getFeed = vi.fn();
const getFeedAfterAlbum = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/feed", () => ({
  getFeed: (...a: unknown[]) => getFeed(...a),
  getFeedAfterAlbum: (...a: unknown[]) => getFeedAfterAlbum(...a),
}));

import { continueAfterAlbum, loadFeedPage } from "./actions";

const single = (id: string) => ({ kind: "track", id, title: id, trackArtUrl: null, artistNames: ["Nova"], createdAt: "" });

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ sub: "u1" });
});

describe("loadFeedPage", () => {
  it("refuses when signed out", async () => {
    getSessionUser.mockResolvedValue(null);
    expect(await loadFeedPage({ q: "", page: 2 })).toEqual({ tracks: [], page: 2, hasMore: false, error: "Not authenticated." });
    expect(getFeed).not.toHaveBeenCalled();
  });

  it("returns the page's tracks tagged with the page", async () => {
    getFeed.mockResolvedValue({ items: [single("s1")], page: 2, hasMore: true });
    const res = await loadFeedPage({ q: "wav", page: 2 });
    expect(getFeed).toHaveBeenCalledWith({}, { q: "wav", page: 2 });
    expect(res).toEqual({
      tracks: [{ id: "s1", title: "s1", artistName: "Nova", page: 2 }],
      page: 2,
      hasMore: true,
      error: null,
    });
  });

  it("returns an error instead of throwing", async () => {
    getFeed.mockRejectedValue(new Error("db down"));
    const res = await loadFeedPage({ q: "", page: 3 });
    expect(res).toEqual({ tracks: [], page: 3, hasMore: false, error: "Could not load more tracks." });
  });
});

describe("continueAfterAlbum", () => {
  it("returns what follows the album", async () => {
    getFeedAfterAlbum.mockResolvedValue({ items: [single("s9")], page: 4, hasMore: false });
    const res = await continueAfterAlbum("al1");
    expect(getFeedAfterAlbum).toHaveBeenCalledWith({}, "al1");
    expect(res).toEqual({
      tracks: [{ id: "s9", title: "s9", artistName: "Nova", page: 4 }],
      page: 4,
      hasMore: false,
      error: null,
    });
  });

  it("returns an empty, error-free result when the album is not in the feed", async () => {
    getFeedAfterAlbum.mockResolvedValue(null);
    expect(await continueAfterAlbum("gone")).toEqual({ tracks: [], page: 0, hasMore: false, error: null });
  });

  it("refuses when signed out", async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await continueAfterAlbum("al1")).error).toBe("Not authenticated.");
  });
});
