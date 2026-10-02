import { describe, expect, it } from "vitest";
import { buildOptions } from "./artist-options";
import { existingChip, newChip } from "./upload-reducer";

describe("buildOptions", () => {
  it("returns nothing for a blank query", () => {
    expect(buildOptions("  ", [{ id: "a1", name: "Daye" }], [], [])).toEqual([]);
  });

  it("lists DB matches, then a Create row when there's no exact match", () => {
    const opts = buildOptions("day", [{ id: "a1", name: "Daye" }], [], []);
    expect(opts).toEqual([
      { kind: "existing", chip: existingChip({ id: "a1", name: "Daye" }) },
      { kind: "create", name: "day" },
    ]);
  });

  it("hides Create when a DB match is exact ignoring case/spaces", () => {
    const opts = buildOptions(" DAYE ", [{ id: "a1", name: "Daye" }], [], []);
    expect(opts.some((o) => o.kind === "create")).toBe(false);
  });

  it("offers pending new artists from elsewhere in the form instead of a second Create", () => {
    const opts = buildOptions("saw", [], [newChip("Sawcy")], []);
    expect(opts).toEqual([
      { kind: "existing", chip: newChip("Sawcy") },
      { kind: "create", name: "saw" },
    ]);
    expect(buildOptions("sawcy", [], [newChip("Sawcy")], []).some((o) => o.kind === "create")).toBe(false);
  });

  it("excludes artists already chipped on this field, and hides Create for them", () => {
    const opts = buildOptions("daye", [{ id: "a1", name: "Daye" }], [], [existingChip({ id: "a1", name: "Daye" })]);
    expect(opts).toEqual([]);
  });
});
