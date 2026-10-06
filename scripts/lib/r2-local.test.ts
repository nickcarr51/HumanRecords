import { describe, expect, it } from "vitest";
import { AUDIO_KEY_RE } from "../../src/lib/admin/rules";
import { assertLocalBucket, missingSeedFiles, SEED_MEDIA } from "./r2-local.mts";

describe("assertLocalBucket", () => {
  it("accepts the local bucket", () => {
    expect(assertLocalBucket("humanrecords-media-local")).toBe("humanrecords-media-local");
  });
  it.each(["humanrecords-media-dev", "humanrecords-media-prod", "", undefined])("refuses %s", (name) => {
    expect(() => assertLocalBucket(name)).toThrow(/local/);
  });
});

describe("SEED_MEDIA", () => {
  it("uses the same key shape as admin uploads (tracks/<uuid>.mp3)", () => {
    for (const { key } of SEED_MEDIA) expect(AUDIO_KEY_RE.test(key)).toBe(true);
  });
  it("has unique keys", () => {
    expect(new Set(SEED_MEDIA.map((m) => m.key)).size).toBe(SEED_MEDIA.length);
  });
});

describe("missingSeedFiles", () => {
  it("lists files that aren't present", () => {
    expect(missingSeedFiles([SEED_MEDIA[0].file])).toEqual(SEED_MEDIA.slice(1).map((m) => m.file));
  });
  it("is empty when all present", () => {
    expect(missingSeedFiles([...SEED_MEDIA.map((m) => m.file), "extra.mp3"])).toEqual([]);
  });
});
