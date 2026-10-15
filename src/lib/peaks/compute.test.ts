import { afterEach, describe, expect, it, vi } from "vitest";
import { computePeaks, peaksFromChannels, storePeaks } from "./compute";

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

describe("storePeaks decode queue", () => {
  const blob = new Blob([new Uint8Array(4)]);
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("never decodes two files at once; the second starts after the first settles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    let finishFirst: (v: Uint8Array<ArrayBuffer>) => void = () => {};
    const first = vi.fn(() => new Promise<Uint8Array<ArrayBuffer>>((r) => { finishFirst = r; }));
    const second = vi.fn(async () => new Uint8Array(1));
    const a = storePeaks(blob, "u1", first);
    const b = storePeaks(blob, "u2", second);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    finishFirst(new Uint8Array(1));
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("still runs the next decode after one fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    const a = storePeaks(blob, "u1", async () => { throw new Error("decode"); });
    const second = vi.fn(async () => new Uint8Array(1));
    const b = storePeaks(blob, "u2", second);
    expect(await a).toBe(false);
    expect(await b).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("computePeaks", () => {
  // jsdom's Blob has no arrayBuffer().
  const fakeBlob = { arrayBuffer: async () => new ArrayBuffer(4) } as unknown as Blob;

  it("decodes at 8000 Hz to keep memory small", async () => {
    const rates: number[] = [];
    class FakeContext {
      constructor(_channels: number, _length: number, rate: number) {
        rates.push(rate);
      }
      async decodeAudioData() {
        return { numberOfChannels: 1, sampleRate: 8000, getChannelData: () => new Float32Array(160) };
      }
    }
    vi.stubGlobal("OfflineAudioContext", FakeContext);
    const bytes = await computePeaks(fakeBlob);
    expect(rates).toEqual([8000]);
    expect(bytes).toHaveLength(1);
  });

  it("falls back to 44100 Hz if an 8000 Hz context is refused", async () => {
    const rates: number[] = [];
    class FakeContext {
      constructor(_channels: number, _length: number, rate: number) {
        rates.push(rate);
        if (rate === 8000) throw new RangeError("unsupported");
      }
      async decodeAudioData() {
        return { numberOfChannels: 1, sampleRate: 44100, getChannelData: () => new Float32Array(882) };
      }
    }
    vi.stubGlobal("OfflineAudioContext", FakeContext);
    await computePeaks(fakeBlob);
    expect(rates).toEqual([8000, 44100]);
  });
});
