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

describe("connectionOptions", () => {
  const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const HOSTED = "postgresql://postgres.abc:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";

  it("turns TLS off for the local database", async () => {
    const { connectionOptions } = await import("./client");
    expect(connectionOptions(LOCAL).ssl).toBe(false);
  });

  it("requires TLS for a hosted pooler URL", async () => {
    const { connectionOptions } = await import("./client");
    expect(connectionOptions(HOSTED).ssl).toBe("require");
  });

  it.each([LOCAL, HOSTED])("keeps the pooler and serverless options for %s", async (url) => {
    const { connectionOptions } = await import("./client");
    expect(connectionOptions(url)).toMatchObject({ prepare: false, idle_timeout: 20, connect_timeout: 10 });
  });
});
