import { describe, expect, it } from "vitest";
import { buildOptions } from "./artist-options";
import { existingChip, newChip } from "./upload-reducer";

describe("buildOptions", () => {
  it("returns nothing for a blank query", () => {
    expect(buildOptions("  ", [{ id: "a1", name: "Nova" }], [], [])).toEqual([]);
  });

  it("lists DB matches, then a Create row when there's no exact match", () => {
    const opts = buildOptions("nov", [{ id: "a1", name: "Nova" }], [], []);
    expect(opts).toEqual([
      { kind: "existing", chip: existingChip({ id: "a1", name: "Nova" }) },
      { kind: "create", name: "nov" },
    ]);
  });

  it("hides Create when a DB match is exact ignoring case/spaces", () => {
    const opts = buildOptions(" NOVA ", [{ id: "a1", name: "Nova" }], [], []);
    expect(opts.some((o) => o.kind === "create")).toBe(false);
  });

  it("offers pending new artists from elsewhere in the form instead of a second Create", () => {
    const opts = buildOptions("emb", [], [newChip("Ember")], []);
    expect(opts).toEqual([
      { kind: "existing", chip: newChip("Ember") },
      { kind: "create", name: "emb" },
    ]);
    expect(buildOptions("ember", [], [newChip("Ember")], []).some((o) => o.kind === "create")).toBe(false);
  });

  it("excludes artists already chipped on this field, and hides Create for them", () => {
    const opts = buildOptions("nova", [{ id: "a1", name: "Nova" }], [], [existingChip({ id: "a1", name: "Nova" })]);
    expect(opts).toEqual([]);
  });
});
