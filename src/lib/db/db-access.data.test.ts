// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { DatabaseError, DomainError } from "@/lib/services/errors";
import { authorize, type Action } from "@/lib/services/policy";
import { getClaims, getViewer, type JwtClaims } from "@/lib/services/viewer";
import { createDb, type Db } from "./client";
import { asSystem } from "./system";
import { asUser } from "./user";

const admin = createAdminClient();
let listener: Awaited<ReturnType<typeof createTestUser>>;
let label: Awaited<ReturnType<typeof createTestUser>>;
let listenerClaims: JwtClaims;
let labelClaims: JwtClaims;
let trackId: string | undefined;
let releaseId: string | undefined;

beforeAll(async () => {
  listener = await createTestUser({ role: "listener" });
  label = await createTestUser({ role: "label_member" });
  listenerClaims = await getClaims(await listener.signIn());
  labelClaims = await getClaims(await label.signIn());
  const t = await admin.from("tracks").insert({ title: `TXSETUP${Date.now()}`, audio_url: "tracks/x.mp3" }).select("id").single();
  if (t.error) throw t.error;
  trackId = t.data.id;
  const r = await admin
    .from("releases")
    .insert({ kind: "single", track_id: trackId, archived_at: new Date().toISOString() })
    .select("id")
    .single();
  if (r.error) throw r.error;
  releaseId = r.data.id;
});

// Guarded: when setup failed part-way, clean up only what was created.
afterAll(async () => {
  try {
    if (releaseId) {
      const { error } = await admin.from("releases").delete().eq("id", releaseId);
      if (error) throw error;
    }
    if (trackId) {
      const { error } = await admin.from("tracks").delete().eq("id", trackId);
      if (error) throw error;
    }
  } finally {
    if (listener) await listener.cleanup();
    if (label) await label.cleanup();
  }
});

// The bare-connection state asUser and asSystem must leave behind, even after
// a failure. The 10s timeouts are transaction-local too, so statement_timeout
// and lock_timeout are back to their defaults (0, no limit).
async function expectCleanConnection(client: postgres.Sql) {
  const [row] = await client`select current_user as who, current_setting('request.jwt.claims', true) as claims, current_setting('statement_timeout') as st, current_setting('lock_timeout') as lt`;
  expect(row.who).toBe("postgres");
  expect(row.claims ?? "").toBe("");
  expect(row.st).toBe("0");
  expect(row.lt).toBe("0");
}

// True when `text` appears anywhere inside `value`: in any own property,
// hidden or not, at any depth (cause included). Case-insensitive.
function containsText(value: unknown, text: string, seen = new Set<unknown>()): boolean {
  if (typeof value === "string") return value.toLowerCase().includes(text.toLowerCase());
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.getOwnPropertyNames(value).some((key) => containsText(Reflect.get(value, key), text, seen));
}

// A stand-in database that fails the test if anything touches it.
function untouchableDb(): Db {
  return new Proxy({} as Db, {
    get() {
      throw new Error("the database was used");
    },
  });
}

describe("asUser", () => {
  it("runs as the caller", async () => {
    const [row] = await asUser(listenerClaims, (tx) =>
      tx.execute<{ uid: string; who: string }>(sql`select auth.uid()::text as uid, current_user as who`),
    );
    expect(row.uid).toBe(listenerClaims.sub);
    expect(row.who).toBe("authenticated");
  });

  it("applies RLS: an archived release is hidden from a listener, visible to a label member", async () => {
    const visible = (claims: JwtClaims) =>
      asUser(claims, (tx) => tx.execute(sql`select id from public.releases where id = ${releaseId}`));
    expect(await visible(listenerClaims)).toHaveLength(0);
    expect(await visible(labelClaims)).toHaveLength(1);
  });

  it("sends the database only the user id and role", async () => {
    const [row] = await asUser(listenerClaims, (tx) =>
      tx.execute<{ keys: string[]; sub: string }>(
        sql`select array(select jsonb_object_keys(current_setting('request.jwt.claims')::jsonb) order by 1) as keys, current_setting('request.jwt.claims')::jsonb ->> 'sub' as sub`,
      ),
    );
    expect(row.keys).toEqual(["role", "sub"]);
    expect(row.sub).toBe(listener.id);
  });

  it("applies the 10s statement and lock timeouts", async () => {
    const [row] = await asUser(listenerClaims, (tx) =>
      tx.execute<{ st: string; lt: string }>(
        sql`select current_setting('statement_timeout') as st, current_setting('lock_timeout') as lt`,
      ),
    );
    expect(row).toMatchObject({ st: "10s", lt: "10s" });
  });

  it("leaves no identity on its one dedicated connection afterwards", async () => {
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
      await asUser(listenerClaims, (tx) => tx.execute(sql`select 1`), createDb(client));
      await expectCleanConnection(client);
    } finally {
      await client.end();
    }
  });

  it("leaves no identity on the connection after the callback throws", async () => {
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
      await expect(
        asUser(
          listenerClaims,
          () => {
            throw new Error("boom");
          },
          createDb(client),
        ),
      ).rejects.toThrow("boom");
      await expectCleanConnection(client);
    } finally {
      await client.end();
    }
  });

  it("a failed query's error has a fixed message and no SQL text anywhere", async () => {
    const caught = await asUser(listenerClaims, (tx) =>
      tx.execute(sql`select id from public.no_such_table_wave4 where id = ${"needle-value"}`),
    ).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(DatabaseError);
    expect(caught).toMatchObject({ name: "DatabaseError", message: "Database query failed", code: "42P01" });
    expect((caught as Error).cause).toBeUndefined();
    for (const text of ["select id", "from public", "no_such_table_wave4", "where id"]) {
      expect(containsText(caught, text)).toBe(false);
    }
    // The values sent with the query are kept; the query text isn't.
    expect((caught as DatabaseError).params).toEqual(["needle-value"]);
  });

  it("a refused query gives the fixed permission message, not the database's text", async () => {
    const caught = await asUser(listenerClaims, (tx) => tx.execute(sql`select 1 from auth.users`)).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(DomainError);
    expect(caught).toMatchObject({ code: "FORBIDDEN", message: "You don't have permission to do that." });
    expect(containsText(caught, "auth.users")).toBe(false);
  });
});

describe("asSystem", () => {
  it("runs as postgres with the 10s timeouts", async () => {
    const grant = authorize(await getViewer(await label.signIn()), "users.list");
    const [row] = await asSystem(grant, "users.list", (tx) =>
      tx.execute<{ who: string; st: string; lt: string }>(
        sql`select current_user as who, current_setting('statement_timeout') as st, current_setting('lock_timeout') as lt`,
      ),
    );
    expect(row).toMatchObject({ who: "postgres", st: "10s", lt: "10s" });
  });

  it("leaves no settings on its one dedicated connection afterwards", async () => {
    const grant = authorize(await getViewer(await label.signIn()), "users.list");
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
      await asSystem(grant, "users.list", (tx) => tx.execute(sql`select 1`), createDb(client));
      await expectCleanConnection(client);
    } finally {
      await client.end();
    }
  });

  it("refuses a real grant used for a different job, before any database access", async () => {
    const grant = authorize(await getViewer(await label.signIn()), "users.list");
    const fn = vi.fn(async () => 1);
    await expect(asSystem(grant, "users.delete" as unknown as Action, fn, untouchableDb())).rejects.toMatchObject({
      name: "DomainError",
      code: "FORBIDDEN",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("leaves no settings on the connection after the callback throws", async () => {
    const grant = authorize(await getViewer(await label.signIn()), "users.list");
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
      await expect(
        asSystem(
          grant,
          "users.list",
          () => {
            throw new Error("boom");
          },
          createDb(client),
        ),
      ).rejects.toThrow("boom");
      await expectCleanConnection(client);
    } finally {
      await client.end();
    }
  });
});
