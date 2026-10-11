import { describe, expect, it } from "vitest";
import { downloadFilename, extFromKey } from "./filename";

const cp = (s: string) => Array.from(s).length;
const base = (f: string) => f.slice(0, f.lastIndexOf("."));

describe("downloadFilename", () => {
  it("one artist", () => {
    expect(downloadFilename(["Nova"], "Night Drive", "mp3")).toBe("Nova - Night Drive.mp3");
  });

  it("three artists in the given (credited) order", () => {
    expect(downloadFilename(["A", "B", "C"], "Song", "mp3")).toBe("A x B x C - Song.mp3");
  });

  it("no artists → title only", () => {
    expect(downloadFilename([], "Song", "mp3")).toBe("Song.mp3");
  });

  it("drops artists that sanitize to empty", () => {
    expect(downloadFilename(["???", "Nova"], "Song", "mp3")).toBe("Nova - Song.mp3");
  });

  it("replaces / \\ : with - and removes ? * \" < > | and control chars", () => {
    expect(downloadFilename(["AC/DC", "Back\\Slash"], 'Who? *Me* "Live" <1>|2: Part\u0007', "mp3")).toBe(
      "AC-DC x Back-Slash - Who Me Live 12- Part.mp3",
    );
  });

  it("collapses whitespace and trims trailing dots/spaces", () => {
    expect(downloadFilename(["  Nova   Band "], "Song...  ", "mp3")).toBe("Nova Band - Song.mp3");
  });

  it("empty title after sanitizing → 'track'", () => {
    expect(downloadFilename(["Nova"], "???", "mp3")).toBe("Nova - track.mp3");
  });

  it("keeps unicode", () => {
    expect(downloadFilename(["Björk", "Sigur Rós"], "Café ☕", "mp3")).toBe("Björk x Sigur Rós - Café ☕.mp3");
  });

  it("trims a long artist list to 'x N more', keeping as many artists as fit", () => {
    const artists = Array.from({ length: 12 }, (_, i) => `Artist Number ${i + 1}`);
    const f = downloadFilename(artists, "Song", "mp3");
    expect(cp(base(f))).toBeLessThanOrEqual(150);
    expect(f).toMatch(/^Artist Number 1 x Artist Number 2 x .* x \d+ more - Song\.mp3$/);
    const kept = base(f).split(" - ")[0].split(" x ");
    const more = Number(kept.pop()!.replace(" more", ""));
    expect(kept.length + more).toBe(12);
    // one more artist would not have fit
    const withOneMore = `${artists.slice(0, kept.length + 1).join(" x ")} x ${more - 1} more - Song`;
    expect(cp(withOneMore)).toBeGreaterThan(150);
  });

  it("truncates an overlong title, keeping the first artist", () => {
    const f = downloadFilename(["A", "B"], "T".repeat(400), "mp3");
    expect(f.startsWith("A x 1 more - TTT")).toBe(true);
    expect(cp(base(f))).toBe(150);
  });

  it("single huge artist stays within the cap", () => {
    const f = downloadFilename(["N".repeat(300)], "Song", "mp3");
    expect(cp(base(f))).toBeLessThanOrEqual(150);
    expect(f.endsWith(".mp3")).toBe(true);
  });

  it("unicode is never split (cap counts code points)", () => {
    const f = downloadFilename(["🎧".repeat(10)], "😀".repeat(300), "mp3");
    expect(cp(base(f))).toBeLessThanOrEqual(150);
    expect(base(f)).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no lone high surrogate
  });
});

describe("extFromKey", () => {
  it("returns the lower-case extension", () => {
    expect(extFromKey("tracks/abc.MP3")).toBe("mp3");
  });
  it("falls back to bin when there is no extension", () => {
    expect(extFromKey("tracks/abc")).toBe("bin");
  });
  it("ignores dots in folder names", () => {
    expect(extFromKey("tracks.v2/abc")).toBe("bin");
  });
});
