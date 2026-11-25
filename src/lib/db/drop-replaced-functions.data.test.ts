// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";

// Migration 20261119120000: the 11 SQL functions slices 1-3 replaced are gone,
// and signed-in / signed-out users (authenticated, anon) lose the table rights
// they never need.
const db = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
afterAll(async () => {
  await db.end();
});

const DROPPED = [
  "search_feed",
  "admin_list_users",
  "admin_delete_artist",
  "admin_set_user_role",
  "archive_release",
  "restore_release",
  "archive_track",
  "restore_track",
  "replace_track_audio",
  "move_release",
  "release_for_track",
];
// Still called by the code live when the migration runs (until the final
// cleanup), or kept for good.
const KEPT = [
  "publish_release",
  "update_release",
  "add_album_track",
  "resolve_artist_refs",
  "increment_play_count",
  "current_user_role",
];

class Rollback extends Error {}

describe("drop replaced functions migration", () => {
  it("drops the 11 replaced functions and keeps the others", async () => {
    const rows = await db`select proname from pg_proc where pronamespace = 'public'::regnamespace`;
    const names = rows.map((r) => r.proname as string);
    for (const name of DROPPED) expect(names).not.toContain(name);
    for (const name of KEPT) expect(names).toContain(name);
  });

  it("leaves anon and authenticated no truncate, trigger, references or maintain on any public table, and no update on users", async () => {
    const rows = await db`
      select c.relname, a.grantee::regrole::text as role, a.privilege_type
      from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
        and (a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN')
             or (c.relname = 'users' and a.privilege_type = 'UPDATE'))`;
    expect(rows).toEqual([]);
  });

  it("gives a table created later only select, insert, update and delete for anon and authenticated", async () => {
    let grants: string[] = [];
    await db
      .begin(async (tx) => {
        await tx`create table public.slice4_probe (id int)`;
        const rows = await tx`
          select a.grantee::regrole::text as role, a.privilege_type
          from pg_class c cross join lateral aclexplode(c.relacl) a
          where c.oid = 'public.slice4_probe'::regclass
            and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
          order by 1, 2`;
        grants = rows.map((r) => `${r.role} ${r.privilege_type}`);
        throw new Rollback();
      })
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });
    expect(grants).toEqual([
      "anon DELETE",
      "anon INSERT",
      "anon SELECT",
      "anon UPDATE",
      "authenticated DELETE",
      "authenticated INSERT",
      "authenticated SELECT",
      "authenticated UPDATE",
    ]);
  });

  it("refuses a signed-in user's update on users; the service role still updates it", async () => {
    const user = await createTestUser({ role: "listener", name: "Probe Person" });
    try {
      const client = await user.signIn();
      const { error } = await client.from("users").update({ name: "Changed" }).eq("id", user.id);
      expect(error?.code).toBe("42501");
      const admin = createAdminClient();
      const { error: adminError } = await admin.from("users").update({ name: "Changed" }).eq("id", user.id);
      expect(adminError).toBeNull();
      const { data } = await admin.from("users").select("name").eq("id", user.id).single();
      expect(data?.name).toBe("Changed");
    } finally {
      await user.cleanup();
    }
  });
});
