// Stored loudness ("peaks") format, shared by the admin upload (writes) and
// the player (reads). One byte per 20 ms slice: the RMS level of the mono mix,
// 0–255. RMS rather than peak amplitude: mastered music peaks near full scale
// in almost every slice, which would pin the visuals at maximum.
export const PEAKS_PER_SECOND = 50;
export const PEAKS_CONTENT_TYPE = "application/octet-stream";

// peaks/<id>.bin sits next to tracks/<id>.mp3. Derived, never stored: replacing
// a track's audio mints a new id, so old peaks can't apply to new audio.
const AUDIO_KEY = /^tracks\/([^/]+)\.mp3$/;

export function peaksKeyFor(audioKey: string): string | null {
  const match = AUDIO_KEY.exec(audioKey);
  return match ? `peaks/${match[1]}.bin` : null;
}
