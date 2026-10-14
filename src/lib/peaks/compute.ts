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

export async function computePeaks(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  // decodeAudioData resamples to the context rate; 1 frame is enough, the
  // context is only used for decoding.
  const context = new OfflineAudioContext(1, 1, 44100);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return peaksFromChannels(channels, buffer.sampleRate);
}

// Never throws: a missing loudness file only leaves the track on idle dots,
// and the release edit page can analyze it again.
export async function storePeaks(blob: Blob, peaksUrl: string, compute = computePeaks): Promise<boolean> {
  try {
    const body = await compute(blob);
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
