// @vitest-environment node
import { X509Certificate } from "node:crypto";
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

  it("returns the same instance on a second call", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    const { getDb } = await import("./client");
    expect(getDb()).toBe(getDb());
  });
});

describe("connectionOptions", () => {
  const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const HOSTED = "postgresql://postgres.abc:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";

  it("turns TLS off for the local database", async () => {
    const { connectionOptions } = await import("./client");
    expect(connectionOptions(LOCAL).ssl).toBe(false);
  });

  it("verifies TLS against the Supabase root CA for a hosted pooler URL", async () => {
    const { connectionOptions } = await import("./client");
    const { SUPABASE_ROOT_CA_2021 } = await import("./supabase-ca");
    expect(connectionOptions(HOSTED).ssl).toEqual({ ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true });
  });

  it.each([LOCAL, HOSTED])("keeps the pooler and serverless options for %s", async (url) => {
    const { connectionOptions } = await import("./client");
    expect(connectionOptions(url)).toMatchObject({ prepare: false, idle_timeout: 20, connect_timeout: 10 });
  });
});

describe("SUPABASE_ROOT_CA_2021", () => {
  it("is the Supabase Root 2021 CA", async () => {
    const { SUPABASE_ROOT_CA_2021 } = await import("./supabase-ca");
    expect(new X509Certificate(SUPABASE_ROOT_CA_2021).fingerprint256).toBe(
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
    );
  });
});
