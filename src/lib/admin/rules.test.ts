import { describe, expect, it } from "vitest";
import { AUDIO_KEY_RE, MAX_AUDIO_BYTES, audioFileError } from "./rules";

describe("audioFileError", () => {
  it("accepts .mp3 by extension regardless of case or browser MIME", () => {
    expect(audioFileError({ name: "song.mp3", size: 10 })).toBeNull();
    expect(audioFileError({ name: "SONG.MP3", size: 10 })).toBeNull();
  });

  it("rejects non-mp3, empty, and oversize files", () => {
    expect(audioFileError({ name: "song.wav", size: 10 })).toBe("Only MP3 files are supported.");
    expect(audioFileError({ name: "song.mp3", size: 0 })).toBe("This file is empty.");
    expect(audioFileError({ name: "song.mp3", size: MAX_AUDIO_BYTES + 1 })).toBe("MP3s must be 50 MB or smaller.");
    expect(audioFileError({ name: "song.mp3", size: MAX_AUDIO_BYTES })).toBeNull();
  });
});

describe("AUDIO_KEY_RE", () => {
  it("matches only keys minted by createUploadUrls", () => {
    expect(AUDIO_KEY_RE.test("tracks/0b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f.mp3")).toBe(true);
    expect(AUDIO_KEY_RE.test("DAYE. - LET EM KNOW.mp3")).toBe(false);
    expect(AUDIO_KEY_RE.test("tracks/../secret.mp3")).toBe(false);
  });
});
