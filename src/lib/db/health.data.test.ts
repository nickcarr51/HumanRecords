// @vitest-environment node
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import "@/lib/supabase/test-helpers"; // refuses to run unless DATABASE_URL is local
import { createDb } from "./client";
import { checkDatabase } from "./health";

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
      expect(await checkDatabase(createDb(client))).toEqual({ ok: false, failed: "query" });
    } finally {
      await client.end();
    }
  });

  it("reports the role check when the login role doesn't skip RLS", async () => {
    // `authenticator` is the local login role that does not skip RLS; reached
    // here by switching to it on a postgres connection for the whole session.
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, connection: { role: "authenticator" } });
    try {
      expect(await checkDatabase(createDb(client))).toEqual({ ok: false, failed: "bypassesRls" });
    } finally {
      await client.end();
    }
  });
});
