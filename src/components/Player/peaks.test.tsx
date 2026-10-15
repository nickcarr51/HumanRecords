import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const getTrackPeaksUrl = vi.fn();
vi.mock("@/lib/storage/actions", () => ({ getTrackPeaksUrl: (...a: unknown[]) => getTrackPeaksUrl(...a) }));

import { levelAt, loadPeaks, shimmer, usePeakReaders, usePeaks, WAVE_SAMPLES } from "./peaks";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

// 50 slices/s → slice i covers [i*0.02, (i+1)*0.02).
const PEAKS = Uint8Array.from([0, 255, 0, 0, 0, 0, 51]);

describe("levelAt", () => {
  it("takes the loudest of the slice and its neighbours", () => {
    expect(levelAt(PEAKS, 0)).toBe(1);
    expect(levelAt(PEAKS, 0.06)).toBe(0);
    expect(levelAt(PEAKS, 0.12)).toBeCloseTo(0.2);
  });

  it.each([NaN, -1, 1, Infinity])("is 0 outside the file (time %s)", (t) => {
    expect(levelAt(PEAKS, t)).toBe(0);
  });

  it("is 0 for an empty file", () => {
    expect(levelAt(new Uint8Array(0), 0)).toBe(0);
  });
});

describe("shimmer", () => {
  it("is flat at 128 when silent", () => {
    const w = shimmer(0);
    expect(w).toHaveLength(WAVE_SAMPLES);
    expect(new Set(w)).toEqual(new Set([128]));
  });

  it("swings further from 128 as the level rises and stays in byte range", () => {
    const swing = (w: Uint8Array) => Math.max(...Array.from(w, (s) => Math.abs(s - 128)));
    const random = () => 0.37;
    expect(swing(shimmer(1, random))).toBeGreaterThan(swing(shimmer(0.3, random)));
    expect(swing(shimmer(1, random))).toBeLessThanOrEqual(128);
  });
});

describe("usePeakReaders", () => {
  const audio = (paused: boolean, currentTime: number) => ({ current: { paused, currentTime } as HTMLAudioElement });

  it("gives no readers without peaks, so effects stay idle", () => {
    const { result } = renderHook(() => usePeakReaders(audio(false, 0), null));
    expect(result.current).toEqual({ readLevel: null, readWaveform: null });
  });

  it("reads the level at the playhead and goes quiet when paused", () => {
    const { result: playing } = renderHook(() => usePeakReaders(audio(false, 0), PEAKS));
    expect(playing.current.readLevel!()).toBe(1);
    expect(playing.current.readWaveform!()).toHaveLength(WAVE_SAMPLES);
    const { result: paused } = renderHook(() => usePeakReaders(audio(true, 0), PEAKS));
    expect(paused.current.readLevel!()).toBe(0);
    expect(paused.current.readWaveform!()).toBeNull();
  });
});

describe("loadPeaks", () => {
  const signal = new AbortController().signal;

  it("fetches the signed file as bytes", async () => {
    getTrackPeaksUrl.mockResolvedValue({ url: "https://r2/peaks", error: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => Uint8Array.from([7, 8]).buffer })));
    expect(Array.from((await loadPeaks("t1", signal))!)).toEqual([7, 8]);
  });

  it("returns null for a 404, no URL, or a failure", async () => {
    getTrackPeaksUrl.mockResolvedValue({ url: "https://r2/peaks", error: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    expect(await loadPeaks("t1", signal)).toBeNull();
    getTrackPeaksUrl.mockResolvedValue({ url: null, error: null });
    expect(await loadPeaks("t1", signal)).toBeNull();
    getTrackPeaksUrl.mockRejectedValue(new Error("offline"));
    expect(await loadPeaks("t1", signal)).toBeNull();
  });
});

describe("usePeaks", () => {
  it("never returns the previous track's peaks for a new track", async () => {
    let resolveSecond: (v: Uint8Array) => void = () => {};
    const load = vi.fn((id: string) =>
      id === "a" ? Promise.resolve(Uint8Array.from([1])) : new Promise<Uint8Array>((r) => { resolveSecond = r; }),
    );
    const { result, rerender } = renderHook(({ id }) => usePeaks(id, load), { initialProps: { id: "a" } });
    await waitFor(() => expect(result.current).toEqual(Uint8Array.from([1])));
    rerender({ id: "b" });
    expect(result.current).toBeNull();
    await act(async () => resolveSecond(Uint8Array.from([2])));
    expect(result.current).toEqual(Uint8Array.from([2]));
  });

  it("waits until the page is visible before fetching", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    const load = vi.fn(async () => Uint8Array.from([3]));
    const { result } = renderHook(() => usePeaks("a", load));
    expect(load).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(result.current).toEqual(Uint8Array.from([3])));
    expect(load).toHaveBeenCalledOnce();
  });

  it("is null with no track", () => {
    const load = vi.fn();
    const { result } = renderHook(() => usePeaks(undefined, load));
    expect(result.current).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
