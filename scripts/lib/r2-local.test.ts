import { describe, expect, it } from "vitest";
import { assertLocalBucket, missingSeedFiles, SEED_MEDIA_KEYS } from "./r2-local.mts";

describe("assertLocalBucket", () => {
  it("accepts the local bucket", () => {
    expect(assertLocalBucket("humanrecords-media-local")).toBe("humanrecords-media-local");
  });
  it.each(["humanrecords-media-dev", "humanrecords-media-prod", "", undefined])("refuses %s", (name) => {
    expect(() => assertLocalBucket(name)).toThrow(/local/);
  });
});

describe("missingSeedFiles", () => {
  it("lists keys with no file", () => {
    expect(missingSeedFiles([SEED_MEDIA_KEYS[0]])).toEqual(SEED_MEDIA_KEYS.slice(1));
  });
  it("is empty when all present", () => {
    expect(missingSeedFiles([...SEED_MEDIA_KEYS, "extra.mp3"])).toEqual([]);
  });
});
