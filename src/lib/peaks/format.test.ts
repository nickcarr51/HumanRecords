import { describe, expect, it } from "vitest";
import { peaksKeyFor } from "./format";

describe("peaksKeyFor", () => {
  it("puts peaks next to the audio under the same id", () => {
    expect(peaksKeyFor("tracks/0b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f.mp3")).toBe("peaks/0b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f.bin");
  });

  it.each(["covers/a.jpg", "tracks/a/b.mp3", "../tracks/a.mp3", "tracks/a.mp3.bak", ""])("returns null for %j", (key) => {
    expect(peaksKeyFor(key)).toBeNull();
  });
});
