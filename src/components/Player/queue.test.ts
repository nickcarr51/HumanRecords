import { describe, expect, it } from "vitest";
import type { FeedItem } from "@/lib/supabase/feed";
import {
  advance,
  appendPage,
  back,
  canExtend,
  feedQueue,
  startQueue,
  toPlayerTrack,
  type PlayerTrack,
  type QueueSource,
} from "./queue";

const t = (id: string, page?: number): PlayerTrack => ({ id, title: id, artistName: "A", ...(page ? { page } : {}) });
const feed = (hasMore: boolean, lastPage = 1, q = ""): QueueSource => ({ kind: "feed", q, lastPage, hasMore });

describe("toPlayerTrack", () => {
  it("joins artists, falls back to Unknown Artist, and carries the page", () => {
    expect(toPlayerTrack({ id: "a", title: "x", artistNames: ["A", "B"] }, 2)).toEqual({
      id: "a", title: "x", artistName: "A, B", page: 2,
    });
    expect(toPlayerTrack({ id: "a", title: "x", artistNames: [] })).toEqual({
      id: "a", title: "x", artistName: "Unknown Artist",
    });
  });
});

describe("feedQueue", () => {
  it("flattens singles and album tracks in order, with each item's offset", () => {
    const items: FeedItem[] = [
      { kind: "track", id: "s1", title: "S1", trackArtUrl: null, artistNames: [], createdAt: "" },
      {
        kind: "album", id: "al", title: "AL", albumArtUrl: null, artistNames: [], createdAt: "",
        tracks: [{ id: "a1", title: "A1", artistNames: [] }, { id: "a2", title: "A2", artistNames: [] }],
      },
      { kind: "track", id: "s2", title: "S2", trackArtUrl: null, artistNames: [], createdAt: "" },
    ];
    const { tracks, offsets } = feedQueue(items, 3);
    expect(tracks.map((x) => x.id)).toEqual(["s1", "a1", "a2", "s2"]);
    expect(tracks.every((x) => x.page === 3)).toBe(true);
    expect(offsets).toEqual([0, 1, 3]);
  });

  it("tags each track with the release it came from", () => {
    const items: FeedItem[] = [
      { kind: "track", id: "s1", title: "S1", trackArtUrl: null, artistNames: [], createdAt: "" },
      {
        kind: "album", id: "al", title: "AL", albumArtUrl: null, artistNames: [], createdAt: "",
        tracks: [{ id: "a1", title: "A1", artistNames: [] }, { id: "a2", title: "A2", artistNames: [] }],
      },
    ];
    const { tracks } = feedQueue(items, 1);
    expect(tracks.map((x) => x.from)).toEqual([
      { kind: "single", trackId: "s1" },
      { kind: "album", albumId: "al" },
      { kind: "album", albumId: "al" },
    ]);
  });
});

describe("queue", () => {
  it("startQueue clamps the start index", () => {
    expect(startQueue([t("a"), t("b")], 9, feed(false)).index).toBe(1);
    expect(startQueue([t("a")], -2, feed(false)).index).toBe(0);
  });

  it("advance moves within the loaded tracks", () => {
    const r = advance(startQueue([t("a"), t("b")], 0, feed(true)));
    expect(r.kind).toBe("moved");
    if (r.kind === "moved") expect(r.state.index).toBe(1);
  });

  it("advance at the end asks for more when the source can extend, else ends", () => {
    expect(advance(startQueue([t("a")], 0, feed(true))).kind).toBe("needsMore");
    expect(advance(startQueue([t("a")], 0, { kind: "album", albumId: "al" })).kind).toBe("needsMore");
    expect(advance(startQueue([t("a")], 0, feed(false))).kind).toBe("end");
    expect(advance(startQueue([t("a")], 0, { kind: "none" })).kind).toBe("end");
  });

  it("advance at the end of a finished search asks for more (it continues into the feed)", () => {
    expect(advance(startQueue([t("a")], 0, feed(false, 1, "wav"))).kind).toBe("needsMore");
  });

  it("appendPage with a plain-feed continuation switches a search source to q ''", () => {
    const s = appendPage(startQueue([t("a", 1)], 0, feed(false, 1, "wav")), [t("b", 4)], 4, true, "");
    expect(s.tracks.map((x) => x.id)).toEqual(["a", "b"]);
    expect(s.source).toEqual({ kind: "feed", q: "", lastPage: 4, hasMore: true });
  });

  it("appendPage adds tracks, records the page and keeps q", () => {
    const s = appendPage(startQueue([t("a", 1)], 0, feed(true, 1, "wav")), [t("b", 2)], 2, false);
    expect(s.tracks.map((x) => x.id)).toEqual(["a", "b"]);
    expect(s.index).toBe(0);
    expect(s.source).toEqual({ kind: "feed", q: "wav", lastPage: 2, hasMore: false });
  });

  it("appendPage turns an album source into a plain-feed source", () => {
    const s = appendPage(startQueue([t("a")], 0, { kind: "album", albumId: "al" }), [t("b", 3)], 3, true);
    expect(s.source).toEqual({ kind: "feed", q: "", lastPage: 3, hasMore: true });
  });

  it("appendPage skips tracks already in the queue (feed shifted mid-session)", () => {
    const s = appendPage(startQueue([t("a"), t("b")], 1, feed(true)), [t("b"), t("c")], 2, false);
    expect(s.tracks.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("appendPage keeps the existing track objects (no reload of the current track)", () => {
    const a = t("a");
    const s = appendPage(startQueue([a], 0, feed(true)), [t("b")], 2, false);
    expect(s.tracks[0]).toBe(a);
  });

  it("back moves to the previous track, across a page edge, and is a no-op at 0", () => {
    const start = startQueue([t("a", 1), t("b", 2)], 1, feed(false, 2));
    expect(back(start).index).toBe(0);
    const first = startQueue([t("a")], 0, feed(false));
    expect(back(first)).toBe(first);
  });

  it("canExtend", () => {
    expect(canExtend(feed(true))).toBe(true);
    expect(canExtend(feed(false))).toBe(false);
    expect(canExtend(feed(false, 1, "wav"))).toBe(true);
    expect(canExtend(feed(false, 1, "   "))).toBe(false);
    expect(canExtend({ kind: "album", albumId: "x" })).toBe(true);
    expect(canExtend({ kind: "none" })).toBe(false);
  });
});
