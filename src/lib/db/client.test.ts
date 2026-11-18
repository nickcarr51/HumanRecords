// @vitest-environment node
import { X509Certificate } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// True when `text` appears anywhere inside `value`: in any own property,
// hidden or not, at any depth (cause included).
function containsText(value: unknown, text: string, seen = new Set<unknown>()): boolean {
  if (typeof value === "string") return value.includes(text);
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.getOwnPropertyNames(value).some((key) => containsText(Reflect.get(value, key), text, seen));
}

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

  it("throws a clean error for a malformed DATABASE_URL, without the password", async () => {
    const password = "fake-pw-8c1f2e";
    vi.stubEnv("DATABASE_URL", `postgresql://postgres:${password}@127.0.0.1:not-a-port/postgres`);
    const { getDb } = await import("./client");
    let caught: unknown;
    try {
      getDb();
    } catch (e) {
      caught = e;
    }
    if (!(caught instanceof Error)) throw new Error("getDb did not throw an Error");
    expect(caught.message).toBe("DATABASE_URL is not a valid URL");
    expect(caught.cause).toBeUndefined();
    expect(containsText(caught, password)).toBe(false);
  });
});

describe("connectionOptions", () => {
  const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const HOSTED = "postgresql://postgres.abc:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";

  it("turns TLS off for the local database", async () => {
    const { connectionOptions } = await import("./client");
    expect(connectionOptions(LOCAL).ssl).toBe(false);
  });

  it("turns TLS off for the local database reached as localhost", async () => {
    const { connectionOptions } = await import("./client");
    expect(connectionOptions("postgresql://postgres:postgres@localhost:54322/postgres").ssl).toBe(false);
  });

  it("verifies TLS against the Supabase root CA for a hosted pooler URL", async () => {
    const { connectionOptions } = await import("./client");
    const { SUPABASE_ROOT_CA_2021 } = await import("./supabase-ca");
    expect(connectionOptions(HOSTED).ssl).toEqual({ ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true });
  });

  it.each([LOCAL, HOSTED])("keeps the connection settings (no saved queries, at most 5 connections, timeouts) for %s", async (url) => {
    const { connectionOptions } = await import("./client");
    expect(connectionOptions(url)).toMatchObject({ prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 });
  });

  it("keeps the certificate check when the URL asks for ?sslmode=require", async () => {
    // sslmode=require on its own would skip the certificate check; our ssl
    // option must win. getDb builds the client but doesn't connect until the
    // first query, so this never reaches the network.
    vi.stubEnv("DATABASE_URL", `${HOSTED}?sslmode=require`);
    const { getDb } = await import("./client");
    const { SUPABASE_ROOT_CA_2021 } = await import("./supabase-ca");
    // Drizzle keeps the postgres.js client as `$client`; our Db type leaves it out.
    const client = Reflect.get(getDb(), "$client") as { options: { ssl: unknown } };
    expect(client.options.ssl).toEqual({ ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true });
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
