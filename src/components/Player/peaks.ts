'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { PEAKS_PER_SECOND } from '@/lib/peaks/format';
import { getTrackPeaksUrl } from '@/lib/storage/actions';

/**
 * Visuals from the track's stored loudness (peaks/<id>.bin, written at upload)
 * plus the audio clock. No Web Audio: routing the <audio> element through an
 * AudioContext stops iOS background playback.
 *
 * Tuning (Erik): LEVEL_GAIN matches the old live meter (rms × 4). WAVE_GAIN and
 * WAVE_MIX shape the dot shimmer; the mix weights sum to 1.
 */
export const LEVEL_GAIN = 4;
export const WAVE_GAIN = 3;
export const WAVE_SAMPLES = 256;
const WAVE_MIX = [
  { cycles: 3, weight: 0.45 },
  { cycles: 9, weight: 0.35 },
  { cycles: 23, weight: 0.2 },
];

/** Raw RMS 0–1 at `time`: the loudest of that slice and its neighbours. */
export function levelAt(peaks: Uint8Array, time: number): number {
  const i = Math.floor(time * PEAKS_PER_SECOND);
  if (!Number.isFinite(i) || i < 0 || i >= peaks.length) return 0;
  return Math.max(peaks[i - 1] ?? 0, peaks[i] ?? 0, peaks[i + 1] ?? 0) / 255;
}

/** 256 fake time-domain bytes centred on 128, swinging by `level`; new phases each call. */
export function shimmer(level: number, random: () => number = Math.random): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(WAVE_SAMPLES);
  const phases = WAVE_MIX.map(() => random() * Math.PI * 2);
  const amplitude = Math.min(1, level) * 127;
  for (let i = 0; i < WAVE_SAMPLES; i++) {
    let s = 0;
    for (let k = 0; k < WAVE_MIX.length; k++) {
      s += WAVE_MIX[k].weight * Math.sin(phases[k] + (i / WAVE_SAMPLES) * WAVE_MIX[k].cycles * Math.PI * 2);
    }
    out[i] = Math.round(128 + amplitude * s);
  }
  return out;
}

export async function loadPeaks(trackId: string, signal: AbortSignal): Promise<Uint8Array | null> {
  try {
    const { url } = await getTrackPeaksUrl(trackId);
    if (!url || signal.aborted) return null;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** The current track's loudness, or null (not loaded / never analyzed / failed). */
export function usePeaks(trackId: string | undefined, load = loadPeaks): Uint8Array | null {
  // Keyed by track so a new track never shows the previous one's peaks.
  const [loaded, setLoaded] = useState<{ trackId: string; peaks: Uint8Array } | null>(null);
  useEffect(() => {
    if (!trackId) return;
    const controller = new AbortController();
    let started = false;
    // A locked phone may advance tracks; fetch on return, not in the background.
    const start = () => {
      if (started || document.hidden) return;
      started = true;
      void load(trackId, controller.signal).then((peaks) => {
        if (!controller.signal.aborted && peaks) setLoaded({ trackId, peaks });
      });
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', start);
    };
  }, [trackId, load]);
  return loaded && loaded.trackId === trackId ? loaded.peaks : null;
}

/** Same shapes as the old Web Audio readers; null without peaks so effects stay idle. */
export function usePeakReaders(audioRef: RefObject<HTMLAudioElement | null>, peaks: Uint8Array | null) {
  return useMemo(() => {
    if (!peaks) return { readLevel: null, readWaveform: null };
    // currentTime is read per frame: continuous, unlike the ~4 Hz timeupdate.
    const rmsNow = () => {
      const audio = audioRef.current;
      return !audio || audio.paused ? null : levelAt(peaks, audio.currentTime);
    };
    const readLevel = () => Math.min(1, (rmsNow() ?? 0) * LEVEL_GAIN);
    const readWaveform = () => {
      const rms = rmsNow();
      return rms === null ? null : shimmer(rms * WAVE_GAIN);
    };
    return { readLevel, readWaveform };
  }, [audioRef, peaks]);
}
