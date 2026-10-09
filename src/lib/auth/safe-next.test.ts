import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("returns a valid same-origin relative path unchanged", () => {
    expect(safeNextPath("/dashboard/settings")).toBe("/dashboard/settings");
    expect(safeNextPath("/artists/123")).toBe("/artists/123");
  });

  it("defaults to /feed for empty or missing values", () => {
    expect(safeNextPath(undefined)).toBe("/feed");
    expect(safeNextPath(null)).toBe("/feed");
    expect(safeNextPath("")).toBe("/feed");
  });

  it("rejects absolute URLs", () => {
    expect(safeNextPath("https://evil.example/phish")).toBe("/feed");
  });

  it("rejects protocol-relative and backslash-prefixed paths", () => {
    expect(safeNextPath("//evil.example")).toBe("/feed");
    expect(safeNextPath("/\\evil.example")).toBe("/feed");
  });

  it("rejects values that don't start with a slash", () => {
    expect(safeNextPath("dashboard")).toBe("/feed");
  });
});
