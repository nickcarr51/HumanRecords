// Client-safe upload rules, enforced in the form AND re-checked on the server.

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const AUDIO_CONTENT_TYPE = "audio/mpeg";
export const MIN_ALBUM_TRACKS = 2;
export const MAX_TRACKS = 50;
export const ARTIST_SEARCH_LIMIT = 8;

// Keys minted by createUploadUrls: tracks/<uuid>.mp3. publishRelease refuses
// anything else so a crafted payload can't point a track at arbitrary objects.
export const AUDIO_KEY_RE = /^tracks\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/;

// Validated by extension, not File.type: browsers report MP3s as audio/mpeg,
// audio/mp3, or "" depending on OS. Uploads always send AUDIO_CONTENT_TYPE.
export function audioFileError(file: { name: string; size: number }): string | null {
  if (!/\.mp3$/i.test(file.name)) return "Only MP3 files are supported.";
  if (file.size <= 0) return "This file is empty.";
  if (file.size > MAX_AUDIO_BYTES) return "MP3s must be 50 MB or smaller.";
  return null;
}
