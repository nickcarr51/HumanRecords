import { describe, expect, it, vi } from "vitest";
import { uploadOne } from "./upload-one";

const file = (name = "a.mp3", size = 10) => new File([new Uint8Array(size)], name, { type: "audio/mpeg" });
const KEY = "tracks/0b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f.mp3";

describe("uploadOne", () => {
  it("signs one URL, PUTs the file, returns the key", async () => {
    const createUploadUrls = vi.fn(async () => ({ targets: [{ clientId: "one", key: KEY, url: "https://put" }], error: null as null }));
    const putFile = vi.fn(async (_u: string, _f: File, onProgress: (n: number) => void) => onProgress(1));
    const onProgress = vi.fn();
    expect(await uploadOne(file(), { createUploadUrls, putFile }, onProgress)).toEqual({ key: KEY, error: null });
    expect(createUploadUrls).toHaveBeenCalledWith([{ clientId: "one", name: "a.mp3", size: 10 }]);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it("rejects a non-MP3 locally, and reports server and upload failures", async () => {
    const putFile = vi.fn();
    expect(await uploadOne(file("a.wav"), { createUploadUrls: vi.fn(), putFile }, () => {})).toEqual({ key: null, error: "Only MP3 files are supported." });
    const refused = vi.fn(async () => ({ targets: null, error: "Only label members can do this." }));
    expect(await uploadOne(file(), { createUploadUrls: refused, putFile }, () => {})).toEqual({ key: null, error: "Only label members can do this." });
    const throws = vi.fn(async () => { throw new Error("offline"); });
    expect(await uploadOne(file(), { createUploadUrls: throws, putFile }, () => {})).toEqual({ key: null, error: "Couldn't reach the server. Try again." });
    const ok = vi.fn(async () => ({ targets: [{ clientId: "one", key: KEY, url: "u" }], error: null as null }));
    const failingPut = vi.fn(async () => { throw new Error("Upload failed (403)"); });
    expect(await uploadOne(file(), { createUploadUrls: ok, putFile: failingPut }, () => {})).toEqual({ key: null, error: "Upload failed (403)" });
  });

  it("reports a missing upload target instead of throwing", async () => {
    const empty = vi.fn(async () => ({ targets: [], error: null as null }));
    expect(await uploadOne(file(), { createUploadUrls: empty, putFile: vi.fn() }, () => {})).toEqual({ key: null, error: "Couldn't prepare the upload." });
  });
});
