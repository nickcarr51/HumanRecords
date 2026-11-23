// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { listUsers } from "./users";
import { getViewer } from "./viewer";

// listUsers, checked the way it was checked next to the admin_list_users SQL
// function it replaced (dropped in slice 4): each kind of user gets exactly
// the row the SQL function returned, timestamps written the way Supabase's
// API writes them.
const admin = createAdminClient();
const users: Array<Awaited<ReturnType<typeof createTestUser>>> = [];
let unused: Awaited<ReturnType<typeof createTestUser>>;
let used: Awaited<ReturnType<typeof createTestUser>>;
let banned: Awaited<ReturnType<typeof createTestUser>>;
let guest: Awaited<ReturnType<typeof createTestUser>>;

beforeAll(async () => {
  [unused, used, banned, guest] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser({ role: "artist", name: "Guest Person" }),
  ]);
  users.push(unused, used, banned, guest);
  const { error: inviteError } = await admin.from("invites").insert([
    { user_id: unused.id, token: `tok-${unused.id}` },
    { user_id: used.id, token: null, used_at: new Date().toISOString() },
  ]);
  if (inviteError) throw inviteError;
  const { error: banError } = await admin.auth.admin.updateUserById(banned.id, { ban_duration: "24h" });
  if (banError) throw banError;
});

afterAll(async () => {
  for (const u of users) await u.cleanup();
});

async function createdAt(id: string): Promise<string> {
  const { data, error } = await admin.from("users").select("created_at").eq("id", id).single();
  if (error) throw error;
  return data.created_at as string;
}

const COLUMNS = ["banned_until", "created_at", "email", "id", "invite_token", "invite_used_at", "name", "role"];

describe("listUsers (was admin_list_users)", () => {
  it("returns each kind of user's exact row, newest first", async () => {
    const label = await createTestUser({ role: "label_member" });
    try {
      const rows = await listUsers(await getViewer(await label.signIn()));
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(COLUMNS);
      const row = (id: string) => rows.find((r) => r.id === id);

      const { data: invite, error } = await admin.from("invites").select("used_at").eq("user_id", used.id).single();
      if (error) throw error;
      const base = { name: "Test User", role: "listener", invite_token: null, invite_used_at: null, banned_until: null };
      expect(row(unused.id)).toEqual({ ...base, id: unused.id, email: unused.email, created_at: await createdAt(unused.id), invite_token: `tok-${unused.id}` });
      expect(row(used.id)).toEqual({ ...base, id: used.id, email: used.email, created_at: await createdAt(used.id), invite_used_at: invite.used_at });
      expect(row(guest.id)).toEqual({ ...base, id: guest.id, email: guest.email, created_at: await createdAt(guest.id), name: "Guest Person", role: "artist" });
      expect(row(label.id)).toEqual({ ...base, id: label.id, email: label.email, created_at: await createdAt(label.id), role: "label_member" });

      // The ban: the moment Supabase Auth reports, written like the other timestamps.
      const { data: auth, error: authError } = await admin.auth.admin.getUserById(banned.id);
      if (authError) throw authError;
      const bannedRow = row(banned.id);
      expect(bannedRow).toEqual({ ...base, id: banned.id, email: banned.email, created_at: await createdAt(banned.id), banned_until: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?\+00:00$/) });
      expect(Date.parse(bannedRow!.banned_until!)).toBe(Date.parse(auth.user.banned_until!));

      const times = rows.map((r) => Date.parse(r.created_at));
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
    } finally {
      await label.cleanup();
    }
  });

  it("forbids a listener", async () => {
    const listener = await createTestUser({ role: "listener" });
    try {
      const client = await listener.signIn();
      await expect(listUsers(await getViewer(client))).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await listener.cleanup();
    }
  });
});
