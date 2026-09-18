import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const signStreamUrl = vi.fn();
const upsert = vi.fn(() => Promise.resolve({ error: null }));
const serviceFrom = vi.fn(() => ({ upsert }));
const signDownloadUrl = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));
vi.mock("./sign", () => ({
  signStreamUrl: (...a: unknown[]) => signStreamUrl(...a),
  signDownloadUrl: (...a: unknown[]) => signDownloadUrl(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: serviceFrom }),
}));

import { getTrackDownloadUrl, getTrackStreamUrl } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTrackStreamUrl", () => {
  it("returns an auth error and does not sign when unauthenticated", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await getTrackStreamUrl("track-1");
    expect(res).toEqual({ url: null, error: "Not authenticated." });
    expect(signStreamUrl).not.toHaveBeenCalled();
  });

  it("signs a stream URL for the track's stored key", async () => {
    getSessionUser.mockResolvedValue({ sub: "user-1" });
    single.mockResolvedValue({
      data: { audio_url: "tracks/track-1/audio.mp3" },
      error: null,
    });
    signStreamUrl.mockResolvedValue("https://signed.example/stream");
    const res = await getTrackStreamUrl("track-1");
    expect(signStreamUrl).toHaveBeenCalledWith("tracks/track-1/audio.mp3");
    expect(res).toEqual({ url: "https://signed.example/stream", error: null });
  });

  it("returns not-found when the track row is missing", async () => {
    getSessionUser.mockResolvedValue({ sub: "user-1" });
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    const res = await getTrackStreamUrl("missing");
    expect(res).toEqual({ url: null, error: "Track not found." });
    expect(signStreamUrl).not.toHaveBeenCalled();
  });

  it("returns a generic error (not a throw) when signing fails", async () => {
    getSessionUser.mockResolvedValue({ sub: "user-1" });
    single.mockResolvedValue({
      data: { audio_url: "tracks/track-1/audio.mp3" },
      error: null,
    });
    signStreamUrl.mockRejectedValue(
      new Error("Missing R2 env vars: R2_ENDPOINT"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getTrackStreamUrl("track-1");
    expect(res).toEqual({ url: null, error: "Could not generate link." });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("getTrackDownloadUrl", () => {
  it("signs a download URL and records the download once (ignoreDuplicates)", async () => {
    getSessionUser.mockResolvedValue({ sub: "user-1" });
    single.mockResolvedValue({
      data: { title: "My Song", audio_url: "tracks/track-1/audio.mp3" },
      error: null,
    });
    signDownloadUrl.mockResolvedValue("https://signed.example/download");
    const res = await getTrackDownloadUrl("track-1");
    expect(signDownloadUrl).toHaveBeenCalledWith(
      "tracks/track-1/audio.mp3",
      "My Song.mp3",
    );
    expect(serviceFrom).toHaveBeenCalledWith("downloads");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", track_id: "track-1" },
      { onConflict: "user_id,track_id", ignoreDuplicates: true },
    );
    expect(res).toEqual({
      url: "https://signed.example/download",
      error: null,
    });
  });

  it("does not sign or record when unauthenticated", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await getTrackDownloadUrl("track-1");
    expect(res).toEqual({ url: null, error: "Not authenticated." });
    expect(signDownloadUrl).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns a generic error and does NOT record when signing fails", async () => {
    getSessionUser.mockResolvedValue({ sub: "user-1" });
    single.mockResolvedValue({
      data: { title: "My Song", audio_url: "tracks/track-1/audio.mp3" },
      error: null,
    });
    signDownloadUrl.mockRejectedValue(
      new Error("Missing R2 env vars: R2_ENDPOINT"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getTrackDownloadUrl("track-1");
    expect(res).toEqual({ url: null, error: "Could not generate link." });
    expect(upsert).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
