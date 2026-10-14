// Admin-browser only: decodes an MP3 with Web Audio and stores its loudness
// file. Never imported by the player (Web Audio there stops iOS background
// playback); decoding a file offline has no such effect.
import { PEAKS_CONTENT_TYPE, PEAKS_PER_SECOND } from "./format";

export function peaksFromChannels(channels: Float32Array[], sampleRate: number): Uint8Array<ArrayBuffer> {
  const length = channels[0]?.length ?? 0;
  const perSlice = Math.max(1, Math.round(sampleRate / PEAKS_PER_SECOND));
  const out = new Uint8Array(Math.ceil(length / perSlice));
  for (let slice = 0; slice < out.length; slice++) {
    const start = slice * perSlice;
    const end = Math.min(length, start + perSlice);
    let sumSquares = 0;
    for (let i = start; i < end; i++) {
      let mono = 0;
      for (const channel of channels) mono += channel[i] ?? 0;
      mono /= channels.length;
      sumSquares += mono * mono;
    }
    const rms = Math.sqrt(sumSquares / (end - start));
    out[slice] = Math.round(Math.min(1, rms) * 255);
  }
  return out;
}

// Low decode rate: a 50 MB MP3 is ~1.2 GB of float PCM at 44100 Hz. 8000 Hz
// divides evenly into 50 slices per second (160 samples) and is plenty for loudness.
const DECODE_RATE = 8000;
const FALLBACK_RATE = 44100;

function decodeContext(): OfflineAudioContext {
  // decodeAudioData resamples to the context rate; 1 frame is enough, the
  // context is only used for decoding.
  try {
    return new OfflineAudioContext(1, 1, DECODE_RATE);
  } catch {
    return new OfflineAudioContext(1, 1, FALLBACK_RATE);
  }
}

export async function computePeaks(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  const context = decodeContext();
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return peaksFromChannels(channels, buffer.sampleRate);
}

// One decode at a time across the page: two overlapping uploads must not hold
// two decoded tracks in memory. A failure never breaks the chain.
let decodeChain: Promise<unknown> = Promise.resolve();

// Never throws: a missing loudness file only leaves the track on idle dots,
// and the release edit page can analyze it again.
export async function storePeaks(blob: Blob, peaksUrl: string, compute = computePeaks): Promise<boolean> {
  try {
    const run = decodeChain.then(() => compute(blob));
    decodeChain = run.catch(() => undefined);
    const body = await run;
    const res = await fetch(peaksUrl, {
      method: "PUT",
      body,
      headers: { "Content-Type": PEAKS_CONTENT_TYPE }, // must match the signed header
    });
    return res.ok;
  } catch {
    return false;
  }
}
