import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseError, DomainError } from "@/lib/services/errors";

const getCurrentRole = vi.fn();
const VIEWER = { userId: "u1", role: "label_member" };
const getViewer = vi.fn();
const service = { publishRelease: vi.fn() };
const limit = vi.fn();
const order = vi.fn((_c?: string, _o?: unknown) => ({ limit }));
const ilike = vi.fn((_c?: string, _p?: string) => ({ order }));
const select = vi.fn(() => ({ ilike }));
const from = vi.fn(() => ({ select }));
const signUploadUrl = vi.fn(async (key: string, _contentType?: string) => `https://signed.example/${key}`);
const headObject = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((_path?: string) => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/lib/auth/role", () => ({ getCurrentRole: () => getCurrentRole() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from })) }));
vi.mock("@/lib/services/viewer", () => ({ getViewer: (...a: unknown[]) => getViewer(...a) }));
vi.mock("@/lib/services/releases", () => ({
  publishRelease: (...a: unknown[]) => service.publishRelease(...a),
}));
vi.mock("@/lib/storage/sign", () => ({
  signUploadUrl: (...a: [string, string]) => signUploadUrl(...a),
  headObject: (...a: [string]) => headObject(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));

import { createUploadUrls, publishRelease, searchArtists } from "./actions";
import type { ReleasePayload } from "./types";

const KEY = "tracks/0b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f.mp3";
const single: ReleasePayload = {
  kind: "single",
  tracks: [{ title: "Song", audioKey: KEY, artists: [{ newName: "Nova" }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRole.mockResolvedValue("label_member");
  getViewer.mockResolvedValue(VIEWER);
});

describe("role gate", () => {
  it.each(["listener", "artist", null])("refuses role %s on every action with no side effects", async (role) => {
    getCurrentRole.mockResolvedValue(role);
    expect(await searchArtists("da")).toEqual({ artists: [], error: "Only label members can do this." });
    expect(await createUploadUrls([{ clientId: "c1", name: "a.mp3", size: 10 }])).toEqual({
      targets: null,
      error: "Only label members can do this.",
    });
    expect(await publishRelease(single)).toEqual({ error: "Only label members can do this." });
    expect(from).not.toHaveBeenCalled();
    expect(signUploadUrl).not.toHaveBeenCalled();
    expect(service.publishRelease).not.toHaveBeenCalled();
  });
});

describe("searchArtists", () => {
  it("searches by escaped substring, ordered, capped at 8", async () => {
    limit.mockResolvedValue({ data: [{ id: "a1", name: "Nova" }], error: null });
    const res = await searchArtists("  da_  ");
    expect(from).toHaveBeenCalledWith("artists");
    expect(ilike).toHaveBeenCalledWith("name", "%da\\_%");
    expect(order).toHaveBeenCalledWith("name", { ascending: true });
    expect(limit).toHaveBeenCalledWith(8);
    expect(res).toEqual({ artists: [{ id: "a1", name: "Nova" }], error: null });
  });

  it("logs and reports a failed search; ignores non-string queries", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    limit.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await searchArtists("da")).toEqual({ artists: [], error: "Search failed." });
    expect(spy).toHaveBeenCalledWith("Artist search failed", { message: "boom" });
    spy.mockRestore();
    from.mockClear();
    expect(await searchArtists(5 as unknown as string)).toEqual({ artists: [], error: null });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns nothing for a blank query without hitting the DB", async () => {
    expect(await searchArtists("   ")).toEqual({ artists: [], error: null });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("createUploadUrls", () => {
  it("mints one tracks/<uuid>.mp3 key + signed PUT per file", async () => {
    const res = await createUploadUrls([
      { clientId: "c1", name: "One.mp3", size: 100 },
      { clientId: "c2", name: "two.MP3", size: 200 },
    ]);
    expect(res.error).toBeNull();
    expect(res.targets).toHaveLength(2);
    for (const t of res.targets!) {
      expect(t.key).toMatch(/^tracks\/[0-9a-f-]{36}\.mp3$/);
      expect(t.url).toBe(`https://signed.example/${t.key}`);
    }
    expect(res.targets!.map((t) => t.clientId)).toEqual(["c1", "c2"]);
    expect(signUploadUrl).toHaveBeenCalledWith(expect.any(String), "audio/mpeg");
  });

  it("mints a peaks PUT next to each audio PUT", async () => {
    const res = await createUploadUrls([{ clientId: "c1", name: "a.mp3", size: 10 }]);
    const t = res.targets![0];
    const id = t.key.slice("tracks/".length, -".mp3".length);
    expect(signUploadUrl).toHaveBeenCalledWith(`peaks/${id}.bin`, "application/octet-stream");
    expect(t.peaksUrl).toBe(`https://signed.example/peaks/${id}.bin`);
  });

  it("rejects invalid files without signing anything", async () => {
    const res = await createUploadUrls([
      { clientId: "c1", name: "ok.mp3", size: 10 },
      { clientId: "c2", name: "bad.wav", size: 10 },
    ]);
    expect(res).toEqual({ targets: null, error: "bad.wav: Only MP3 files are supported." });
    expect(signUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized request", async () => {
    expect((await createUploadUrls([])).error).toBe("No files to upload.");
    const many = Array.from({ length: 51 }, (_, i) => ({ clientId: `c${i}`, name: "a.mp3", size: 1 }));
    expect((await createUploadUrls(many)).error).toBe("Too many files.");
  });
});

describe("publishRelease", () => {
  it("verifies uploads, calls publishRelease, revalidates and redirects to /feed", async () => {
    headObject.mockResolvedValue({ size: 123 });
    service.publishRelease.mockResolvedValue("release-1");
    await expect(publishRelease(single)).rejects.toThrow("NEXT_REDIRECT");
    expect(headObject).toHaveBeenCalledWith(KEY);
    expect(service.publishRelease).toHaveBeenCalledWith(VIEWER, single);
    expect(revalidatePath).toHaveBeenCalledWith("/feed");
    expect(redirect).toHaveBeenCalledWith("/feed");
  });

  it("refuses keys it didn't mint", async () => {
    const res = await publishRelease({
      ...single,
      tracks: [{ ...single.tracks[0], audioKey: "NOVA. - SLOW BLOOM.mp3" }],
    });
    expect(res).toEqual({ error: "Invalid audio file reference." });
    expect(service.publishRelease).not.toHaveBeenCalled();
  });

  it("refuses when an upload is missing or too large", async () => {
    headObject.mockResolvedValueOnce(null);
    expect(await publishRelease(single)).toEqual({
      error: "A file didn't finish uploading. Publish again to retry.",
    });
    headObject.mockResolvedValueOnce({ size: 50 * 1024 * 1024 + 1 });
    expect(await publishRelease(single)).toEqual({ error: "MP3s must be 50 MB or smaller." });
    expect(service.publishRelease).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads without touching storage or the DB", async () => {
    const tracks = Array.from({ length: 51 }, () => single.tracks[0]);
    expect(await publishRelease({ ...single, tracks })).toEqual({ error: "Too many tracks." });
    const bad = { ...single, tracks: [{ ...single.tracks[0], audioKey: [KEY] }] } as unknown as ReleasePayload;
    expect(await publishRelease(bad)).toEqual({ error: "Invalid audio file reference." });
    const notArray = { kind: "single", tracks: "nope" } as unknown as ReleasePayload;
    expect(await publishRelease(notArray)).toEqual({ error: "Invalid release." });
    expect(await publishRelease(null as unknown as ReleasePayload)).toEqual({ error: "Invalid release." });
    const dup = { ...single, tracks: [single.tracks[0], single.tracks[0]] };
    expect(await publishRelease(dup)).toEqual({ error: "Invalid audio file reference." });
    expect(headObject).not.toHaveBeenCalled();
    expect(service.publishRelease).not.toHaveBeenCalled();
  });

  it("refuses a release shape the upload form never sends, without touching storage or the DB", async () => {
    const track = single.tracks[0];
    const bad = [
      { ...single, kind: "ep" },
      { ...single, kind: undefined },
      { ...single, album: null },
      { ...single, album: { title: 7, artists: [] } },
      { ...single, album: { title: "A", artists: [{ id: "nope" }] } },
      { ...single, tracks: [{ ...track, title: 7 }] },
      { ...single, tracks: [{ ...track, artists: [{}] }] },
      { ...single, tracks: [{ ...track, artists: null }] },
    ];
    for (const payload of bad) {
      expect(await publishRelease(payload as unknown as ReleasePayload)).toEqual({ error: "Invalid release." });
    }
    expect(headObject).not.toHaveBeenCalled();
    expect(service.publishRelease).not.toHaveBeenCalled();
  });

  it("treats a zero-byte upload as unfinished", async () => {
    headObject.mockResolvedValueOnce({ size: 0 });
    expect(await publishRelease(single)).toEqual({
      error: "A file didn't finish uploading. Publish again to retry.",
    });
    expect(service.publishRelease).not.toHaveBeenCalled();
  });

  it("maps database errors to messages and does not redirect", async () => {
    headObject.mockResolvedValue({ size: 1 });
    service.publishRelease.mockRejectedValueOnce(new DomainError("INVALID", "Track 2 needs a title."));
    expect(await publishRelease(single)).toEqual({ error: "Track 2 needs a title." });
    service.publishRelease.mockRejectedValueOnce(new DomainError("FORBIDDEN", "x"));
    expect(await publishRelease(single)).toEqual({ error: "Only label members can do this." });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    service.publishRelease.mockRejectedValueOnce(new DatabaseError("XX000", undefined));
    expect(await publishRelease(single)).toEqual({ error: "Couldn't publish. Nothing was saved — try again." });
    errorSpy.mockRestore();
    expect(redirect).not.toHaveBeenCalled();
  });
});
