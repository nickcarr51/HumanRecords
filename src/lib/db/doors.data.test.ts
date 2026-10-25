// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { authorize } from "@/lib/services/policy";
import { getClaims, getViewer, type JwtClaims } from "@/lib/services/viewer";
import type { Db } from "./client";
import { asSystem } from "./system";
import { asUser } from "./user";

const admin = createAdminClient();
let listener: Awaited<ReturnType<typeof createTestUser>>;
let label: Awaited<ReturnType<typeof createTestUser>>;
let listenerClaims: JwtClaims;
let labelClaims: JwtClaims;
let trackId: string;
let releaseId: string;

beforeAll(async () => {
  listener = await createTestUser({ role: "listener" });
  label = await createTestUser({ role: "label_member" });
  listenerClaims = await getClaims(await listener.signIn());
  labelClaims = await getClaims(await label.signIn());
  const t = await admin.from("tracks").insert({ title: `DOORS${Date.now()}`, audio_url: "tracks/x.mp3" }).select("id").single();
  trackId = t.data!.id;
  const r = await admin
    .from("releases")
    .insert({ kind: "single", track_id: trackId, archived_at: new Date().toISOString() })
    .select("id")
    .single();
  releaseId = r.data!.id;
});

afterAll(async () => {
  await admin.from("releases").delete().eq("id", releaseId);
  await admin.from("tracks").delete().eq("id", trackId);
  await listener.cleanup();
  await label.cleanup();
});

describe("asUser (Door 1)", () => {
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

  it("applies the 10s statement and lock timeouts", async () => {
    const [row] = await asUser(listenerClaims, (tx) =>
      tx.execute<{ st: string; lt: string }>(
        sql`select current_setting('statement_timeout') as st, current_setting('lock_timeout') as lt`,
      ),
    );
    expect(row).toMatchObject({ st: "10s", lt: "10s" });
  });

  it("leaves no identity on the pooled connection afterwards", async () => {
    const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
      await asUser(listenerClaims, (tx) => tx.execute(sql`select 1`), drizzle(client) as unknown as Db);
      const [row] = await client`select current_user as who, current_setting('request.jwt.claims', true) as claims, current_setting('statement_timeout') as st`;
      expect(row.who).toBe("postgres");
      expect(row.claims ?? "").toBe("");
      expect(row.st).toBe("0"); // the 10s timeout is transaction-local too
    } finally {
      await client.end();
    }
  });
});

describe("asSystem (Door 2)", () => {
  it("runs as postgres with the 10s timeouts", async () => {
    const grant = authorize(await getViewer(await label.signIn()), "users.list");
    const [row] = await asSystem(grant, (tx) =>
      tx.execute<{ who: string; st: string; lt: string }>(
        sql`select current_user as who, current_setting('statement_timeout') as st, current_setting('lock_timeout') as lt`,
      ),
    );
    expect(row).toMatchObject({ who: "postgres", st: "10s", lt: "10s" });
  });
});
