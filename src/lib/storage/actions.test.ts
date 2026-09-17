import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const signStreamUrl = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));
vi.mock("./sign", () => ({
  signStreamUrl: (...a: unknown[]) => signStreamUrl(...a),
  signDownloadUrl: vi.fn(),
}));

import { getTrackStreamUrl } from "./actions";

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
});
