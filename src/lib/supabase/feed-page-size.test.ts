import { afterEach, describe, expect, it, vi } from "vitest";
import { feedPageSize } from "./feed";

afterEach(() => vi.unstubAllEnvs());

describe("feedPageSize", () => {
  it("defaults to 20", () => {
    vi.stubEnv("FEED_PAGE_SIZE", "");
    expect(feedPageSize()).toBe(20);
  });
  it("reads FEED_PAGE_SIZE", () => {
    vi.stubEnv("FEED_PAGE_SIZE", "3");
    expect(feedPageSize()).toBe(3);
  });
  it("ignores junk and non-positive values", () => {
    for (const v of ["abc", "0", "-2", "2.5"]) {
      vi.stubEnv("FEED_PAGE_SIZE", v);
      expect(feedPageSize()).toBe(20);
    }
  });
});
