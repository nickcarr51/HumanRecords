// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { listUsers } from "./users";
import { getViewer } from "./viewer";

const admin = createAdminClient();
const users: Array<Awaited<ReturnType<typeof createTestUser>>> = [];

beforeAll(async () => {
  const [unused, used, banned] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  users.push(unused, used, banned);
  const { error: inviteError } = await admin.from("invites").insert([
    { user_id: unused.id, token: `tok-${unused.id}` },
    { user_id: used.id, token: null, used_at: new Date().toISOString() },
  ]);
  if (inviteError) throw inviteError;
  const { error: banError } = await admin.auth.admin.updateUserById(banned.id, { ban_duration: "24h" });
  if (banError) throw banError;
});

// Rows tied on created_at may come back in either order, so compare by id.
const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

afterAll(async () => {
  for (const u of users) await u.cleanup();
});

describe("listUsers vs admin_list_users", () => {
  it("returns the same rows, byte for byte, newest first", async () => {
    const label = await createTestUser({ role: "label_member" });
    try {
      const client = await label.signIn();
      const { data, error } = await client.rpc("admin_list_users");
      if (error) throw error;
      const rows = await listUsers(await getViewer(client));
      expect(byId(rows)).toEqual(byId(data));
      const times = rows.map((r) => Date.parse(r.created_at));
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
    } finally {
      await label.cleanup();
    }
  });

  it("forbids a listener, just like the RPC", async () => {
    const listener = await createTestUser({ role: "listener" });
    try {
      const client = await listener.signIn();
      const { error } = await client.rpc("admin_list_users");
      expect(error?.code).toBe("42501");
      await expect(listUsers(await getViewer(client))).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await listener.cleanup();
    }
  });
});
