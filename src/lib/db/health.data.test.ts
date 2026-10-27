// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import "@/lib/supabase/test-helpers"; // refuses to run unless DATABASE_URL is local
import { createDb, type Db } from "./client";
import { checkDatabase } from "./health";

// DATABASE_URL with another local login. The Supabase CLI gives the local
// stack's built-in logins the same password as `postgres`.
function urlAs(user: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.username = user;
  return url.toString();
}

// The Postgres error code a write gets inside the transaction checkDatabase
// opens: the write runs first, in a savepoint, so the checks still run after it.
function recordingWrites(db: Db, seen: { code?: unknown }): Db {
  return new Proxy(db, {
    get(target, key, receiver) {
      if (key !== "transaction") return Reflect.get(target, key, receiver);
      const transaction: Db["transaction"] = (fn, config) =>
        target.transaction(async (tx) => {
          await tx
            .transaction((sp) => sp.execute(sql`create temp table health_write_probe (x int)`))
            .catch((e: unknown) => {
              seen.code = e instanceof Error ? Reflect.get(e.cause ?? {}, "code") : undefined;
            });
          return fn(tx);
        }, config);
      return transaction;
    },
  });
}

describe("checkDatabase", () => {
  it("passes every check against the local database", async () => {
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
      expect(await checkDatabase(createDb(client))).toEqual({ ok: true });
    } finally {
      await client.end();
    }
  });

  it("passes through getDb, the way the route calls it", async () => {
    expect(await checkDatabase()).toEqual({ ok: true });
  });

  it("reports the first check when the database can't be reached", async () => {
    // Port 1 on this machine: nothing listens there, so the connection is refused.
    const client = postgres("postgresql://postgres:postgres@127.0.0.1:1/postgres", { max: 1, connect_timeout: 2 });
    try {
      expect(await checkDatabase(createDb(client))).toEqual({ ok: false, failed: "query", error: "Error ECONNREFUSED" });
    } finally {
      await client.end();
    }
  });

  it("reports the role check when the login role doesn't skip RLS", async () => {
    // `authenticator` is the local login role that does not skip RLS; reached
    // here by switching to it on a postgres connection for the whole session.
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, connection: { role: "authenticator" } });
    try {
      expect(await checkDatabase(createDb(client))).toEqual({ ok: false, failed: "bypassesRls", error: "CheckFailed" });
    } finally {
      await client.end();
    }
  });

  it("reports the auth.users check when the login role can't read auth.users", async () => {
    // `service_role` skips RLS but has no permission to read auth.users.
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, connection: { role: "service_role" } });
    try {
      expect(await checkDatabase(createDb(client))).toEqual({
        ok: false,
        failed: "readsAuthUsers",
        error: "PostgresError 42501",
      });
    } finally {
      await client.end();
    }
  });

  it("reports the role-switch check when the login role can't switch to authenticated", async () => {
    // `supabase_read_only_user` logs in, skips RLS and reads auth.users, but
    // isn't allowed to switch to `authenticated` (Postgres checks the login
    // role for that, so a connection-level role can't stand in for it).
    const client = postgres(urlAs("supabase_read_only_user"), { max: 1, prepare: false });
    try {
      expect(await checkDatabase(createDb(client))).toEqual({
        ok: false,
        failed: "switchesToAuthenticated",
        error: "PostgresError 42501",
      });
    } finally {
      await client.end();
    }
  });

  it.each([
    ["the name and code only, never the message", { name: "Error", code: "ECONNRESET" }, "Error ECONNRESET"],
    ["a name that isn't a plain name as unknown", { name: "Error: secret text", code: "ECONNRESET" }, "unknown ECONNRESET"],
    ["a code that isn't a plain code is left out", { name: "Error", code: "secret text" }, "Error"],
    ["the database's own error as PostgresError, whatever the build named it", { name: "o", severity_local: "ERROR", code: "28P01" }, "PostgresError 28P01"],
  ])("describes a failure by %s", async (_label, fields, expected) => {
    const failing = new Proxy(createDb(postgres(process.env.DATABASE_URL!, { max: 1 })), {
      get() {
        throw Object.assign(new Error("secret text: the query and the password"), fields);
      },
    });
    expect(await checkDatabase(failing)).toEqual({ ok: false, failed: "query", error: expected });
  });

  it.each([
    ["a thrown string as unknown", "secret text: the query and the password", "unknown"],
    ["an error whose cause is a string by the error itself", Object.assign(new Error("x"), { cause: "secret text" }), "Error"],
  ])("describes %s, never the text", async (_label, thrown, expected) => {
    const failing = new Proxy(createDb(postgres(process.env.DATABASE_URL!, { max: 1 })), {
      get() {
        throw thrown;
      },
    });
    expect(await checkDatabase(failing)).toEqual({ ok: false, failed: "query", error: expected });
  });

  it("runs in a transaction the database refuses to write in", async () => {
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    const seen: { code?: unknown } = {};
    try {
      expect(await checkDatabase(recordingWrites(createDb(client), seen))).toEqual({ ok: true });
      // 25006: "cannot execute ... in a read-only transaction".
      expect(seen.code).toBe("25006");
    } finally {
      await client.end();
    }
  });
});
