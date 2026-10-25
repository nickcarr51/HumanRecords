// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getDb", () => {
  it("throws a clear error when DATABASE_URL is unset", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getDb } = await import("./client");
    expect(() => getDb()).toThrow("Missing DATABASE_URL");
  });
});
