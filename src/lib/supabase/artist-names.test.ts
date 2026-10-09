import { describe, expect, it } from "vitest";
import { albumArtistLabel, byPosition, namesFrom } from "./artist-names";

describe("byPosition", () => {
  it("sorts ascending by position without mutating the input", () => {
    const rows = [{ position: 2, v: "b" }, { position: 1, v: "a" }];
    expect(byPosition(rows).map((r) => r.v)).toEqual(["a", "b"]);
    expect(rows[0].v).toBe("b");
  });
});

describe("namesFrom", () => {
  it("returns names in credit order, deduped, skipping null artists", () => {
    expect(
      namesFrom([
        { position: 2, artists: { name: "Ember" } },
        { position: 1, artists: { name: "Halcyon" } },
        { position: 3, artists: null },
        { position: 4, artists: { name: "Ember" } },
      ]),
    ).toEqual(["Halcyon", "Ember"]);
  });

  it("handles null", () => {
    expect(namesFrom(null)).toEqual([]);
  });
});

describe("albumArtistLabel", () => {
  it("joins names, or says Various Artists when empty", () => {
    expect(albumArtistLabel(["A", "B"])).toBe("A, B");
    expect(albumArtistLabel([])).toBe("Various Artists");
  });
});
