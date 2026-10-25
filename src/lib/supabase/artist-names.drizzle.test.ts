import { describe, expect, it } from "vitest";
import { artistNamesOf } from "./artist-names";

describe("artistNamesOf (Drizzle relation rows)", () => {
  it("orders by position, drops missing artists, dedupes", () => {
    expect(
      artistNamesOf([
        { position: 2, artist: { name: "B" } },
        { position: 1, artist: { name: "A" } },
        { position: 3, artist: null },
        { position: 4, artist: { name: "A" } },
      ]),
    ).toEqual(["A", "B"]);
  });

  it("returns [] for no links", () => {
    expect(artistNamesOf([])).toEqual([]);
  });
});
