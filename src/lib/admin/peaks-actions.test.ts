import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentRole = vi.fn();
const single = vi.fn();
const eq = vi.fn((_c: string, _v: unknown) => ({ single }));
const inFn = vi.fn();
const select = vi.fn((_cols: string) => ({ eq, in: inFn }));
const from = vi.fn((_t: string) => ({ select }));
const headObject = vi.fn();
const signStreamUrl = vi.fn(async (key: string) => `https://get/${key}`);
const signUploadUrl = vi.fn(async (key: string, _ct: string) => `https://put/${key}`);

vi.mock("@/lib/auth/role", () => ({ getCurrentRole: () => getCurrentRole() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from })) }));
vi.mock("@/lib/storage/sign", () => ({
  headObject: (...a: [string]) => headObject(...a),
  signStreamUrl: (...a: [string]) => signStreamUrl(...a),
  signUploadUrl: (...a: [string, string]) => signUploadUrl(...a),
}));

import { getPeaksJob, getPeaksStatus } from "./peaks-actions";

const A = "0b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f";
const B = "1c9d2e4f-9a3b-4e6c-8d2f-3b4c5d6e7f80";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRole.mockResolvedValue("label_member");
});

describe("role gate", () => {
  it.each(["listener", "artist", null])("refuses role %s without reading or signing", async (role) => {
    getCurrentRole.mockResolvedValue(role);
    expect(await getPeaksStatus([A])).toEqual({ status: null, error: "Only label members can do this." });
    expect(await getPeaksJob(A)).toEqual({ audioUrl: null, peaksUrl: null, error: "Only label members can do this." });
    expect(from).not.toHaveBeenCalled();
    expect(signUploadUrl).not.toHaveBeenCalled();
  });
});

describe("getPeaksStatus", () => {
  it("reports which tracks have a peaks file in R2", async () => {
    inFn.mockResolvedValue({ data: [{ id: A, audio_url: `tracks/${A}.mp3` }, { id: B, audio_url: `tracks/${B}.mp3` }], error: null });
    headObject.mockImplementation(async (key: string) => (key === `peaks/${A}.bin` ? { size: 10 } : null));
    expect(await getPeaksStatus([A, B])).toEqual({ status: { [A]: true, [B]: false }, error: null });
    expect(inFn).toHaveBeenCalledWith("id", [A, B]);
  });

  it("rejects bad ids and too many ids without reading", async () => {
    expect((await getPeaksStatus(["nope"])).error).toBe("Invalid request.");
    expect((await getPeaksStatus(Array(51).fill(A))).error).toBe("Invalid request.");
    expect(from).not.toHaveBeenCalled();
  });

  it("reports an R2 failure instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    inFn.mockResolvedValue({ data: [{ id: A, audio_url: `tracks/${A}.mp3` }], error: null });
    headObject.mockRejectedValue(new Error("R2 HEAD failed with 500"));
    expect(await getPeaksStatus([A])).toEqual({ status: null, error: "Couldn't check waveforms." });
  });
});

describe("getPeaksJob", () => {
  it("signs a GET for the audio and a PUT for its peaks key", async () => {
    single.mockResolvedValue({ data: { audio_url: `tracks/${A}.mp3` }, error: null });
    expect(await getPeaksJob(A)).toEqual({
      audioUrl: `https://get/tracks/${A}.mp3`,
      peaksUrl: `https://put/peaks/${A}.bin`,
      error: null,
    });
    expect(signUploadUrl).toHaveBeenCalledWith(`peaks/${A}.bin`, "application/octet-stream");
  });

  it("refuses an unknown track, a bad id, and a key with no peaks form", async () => {
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    expect((await getPeaksJob(A)).error).toBe("Track not found.");
    expect((await getPeaksJob("nope")).error).toBe("Invalid request.");
    single.mockResolvedValue({ data: { audio_url: "tracks/legacy/audio.mp3" }, error: null });
    expect((await getPeaksJob(A)).error).toBe("This track's audio can't be analyzed.");
    expect(signUploadUrl).not.toHaveBeenCalled();
  });
});
