import { describe, expect, it, vi } from "vitest";
import type { FeedItem } from "./feed";
import { feedTrackIds, getMyDownloadedTrackIds } from "./downloads";

function mockClient(result: (ids: string[]) => { data: unknown; error: unknown }) {
  const inFn = vi.fn(async (_col: string, ids: string[]) => result(ids));
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, inFn };
}

describe("feedTrackIds", () => {
  it("returns single ids and album track ids in feed order", () => {
    const items: FeedItem[] = [
      { kind: "track", catalogNumber: 23, id: "s1", title: "S", trackArtUrl: null, artistNames: [], createdAt: "" },
      {
        kind: "album", catalogNumber: 24, id: "a1", title: "A", albumArtUrl: null, artistNames: [], createdAt: "",
        tracks: [{ catalogNumber: 21, id: "t1", title: "x", artistNames: [] }, { catalogNumber: 22, id: "t2", title: "y", artistNames: [] }],
      },
    ];
    expect(feedTrackIds(items)).toEqual(["s1", "t1", "t2"]);
  });
});

describe("getMyDownloadedTrackIds", () => {
  it("returns [] without querying for an empty list", async () => {
    const { client, from } = mockClient(() => ({ data: [], error: null }));
    expect(await getMyDownloadedTrackIds(client, [])).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("selects track_id from downloads filtered to the given ids", async () => {
    const { client, from, select, inFn } = mockClient(() => ({ data: [{ track_id: "t2" }], error: null }));
    expect(await getMyDownloadedTrackIds(client, ["t1", "t2"])).toEqual(["t2"]);
    expect(from).toHaveBeenCalledWith("downloads");
    expect(select).toHaveBeenCalledWith("track_id");
    expect(inFn).toHaveBeenCalledWith("track_id", ["t1", "t2"]);
  });

  it("queries in chunks of 100 so a big page can't overflow the URL", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const { client, inFn } = mockClient((chunk) => ({ data: chunk.slice(0, 1).map((track_id) => ({ track_id })), error: null }));
    expect(await getMyDownloadedTrackIds(client, ids)).toEqual(["t0", "t100", "t200"]);
    expect(inFn.mock.calls.map((c) => c[1].length)).toEqual([100, 100, 50]);
  });

  it("logs and returns [] on a query error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = mockClient(() => ({ data: null, error: { message: "boom" } }));
    expect(await getMyDownloadedTrackIds(client, ["t1"])).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
