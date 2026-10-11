import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const getFeed = vi.fn();
const getFeedAfterRelease = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/feed", () => ({
  getFeed: (...a: unknown[]) => getFeed(...a),
  getFeedAfterRelease: (...a: unknown[]) => getFeedAfterRelease(...a),
}));

import { continueAfterRelease, loadFeedPage } from "./actions";

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
      tracks: [{ id: "s1", title: "s1", artistName: "Nova", page: 2, from: { kind: "single", trackId: "s1" } }],
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

describe("continueAfterRelease", () => {
  it("returns what follows an album, passing the ref through", async () => {
    getFeedAfterRelease.mockResolvedValue({ items: [single("s9")], page: 4, hasMore: false });
    const res = await continueAfterRelease({ kind: "album", albumId: "al1" });
    expect(getFeedAfterRelease).toHaveBeenCalledWith({}, { kind: "album", albumId: "al1" });
    expect(res).toEqual({
      tracks: [{ id: "s9", title: "s9", artistName: "Nova", page: 4, from: { kind: "single", trackId: "s9" } }],
      page: 4,
      hasMore: false,
      error: null,
    });
  });

  it("returns what follows a single, passing the ref through", async () => {
    getFeedAfterRelease.mockResolvedValue({ items: [single("s10")], page: 2, hasMore: true });
    const res = await continueAfterRelease({ kind: "single", trackId: "s1" });
    expect(getFeedAfterRelease).toHaveBeenCalledWith({}, { kind: "single", trackId: "s1" });
    expect(res.tracks.map((t) => t.id)).toEqual(["s10"]);
    expect(res).toMatchObject({ page: 2, hasMore: true, error: null });
  });

  it("returns an empty, error-free result when the release is not in the feed", async () => {
    getFeedAfterRelease.mockResolvedValue(null);
    expect(await continueAfterRelease({ kind: "single", trackId: "gone" })).toEqual({ tracks: [], page: 0, hasMore: false, error: null });
  });

  it("returns an error instead of throwing", async () => {
    getFeedAfterRelease.mockRejectedValue(new Error("db down"));
    expect((await continueAfterRelease({ kind: "album", albumId: "al1" })).error).toBe("Could not load more tracks.");
  });

  it("refuses when signed out, without a data call", async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await continueAfterRelease({ kind: "album", albumId: "al1" })).error).toBe("Not authenticated.");
    expect(getFeedAfterRelease).not.toHaveBeenCalled();
  });
});
