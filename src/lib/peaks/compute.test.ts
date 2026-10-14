import { afterEach, describe, expect, it, vi } from "vitest";
import { peaksFromChannels, storePeaks } from "./compute";

afterEach(() => vi.unstubAllGlobals());

describe("peaksFromChannels", () => {
  // sampleRate 100 → 2 samples per 20 ms slice.
  it("stores one RMS byte per 20 ms slice", () => {
    const bytes = peaksFromChannels([Float32Array.from([1, -1, 0.5, 0.5, 0])], 100);
    expect(Array.from(bytes)).toEqual([255, 128, 0]);
  });

  it("mixes channels to mono before measuring", () => {
    // L+R cancel in the first sample: mono = [0, 1] → rms √0.5 ≈ 0.707.
    const bytes = peaksFromChannels([Float32Array.from([1, 1]), Float32Array.from([-1, 1])], 100);
    expect(Array.from(bytes)).toEqual([180]);
  });

  it("handles silence and empty audio", () => {
    expect(Array.from(peaksFromChannels([new Float32Array(6)], 100))).toEqual([0, 0, 0]);
    expect(peaksFromChannels([new Float32Array(0)], 100)).toHaveLength(0);
    expect(peaksFromChannels([], 100)).toHaveLength(0);
  });
});

describe("storePeaks", () => {
  const blob = new Blob([new Uint8Array(4)]);
  const bytes = Uint8Array.from([1, 2]);

  it("PUTs the computed bytes with the signed content type", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await storePeaks(blob, "https://put/peaks", async () => bytes)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://put/peaks", {
      method: "PUT",
      body: bytes,
      headers: { "Content-Type": "application/octet-stream" },
    });
  });

  it("returns false (never throws) on a rejected PUT, a network error, or a decode error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    expect(await storePeaks(blob, "u", async () => bytes)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    expect(await storePeaks(blob, "u", async () => bytes)).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await storePeaks(blob, "u", async () => { throw new Error("decode"); })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
