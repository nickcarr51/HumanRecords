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
  await admin.from("invites").insert([
    { user_id: unused.id, token: `tok-${unused.id}` },
    { user_id: used.id, token: null, used_at: new Date().toISOString() },
  ]);
  await admin.auth.admin.updateUserById(banned.id, { ban_duration: "24h" });
});

afterAll(async () => {
  for (const u of users) await u.cleanup();
});

describe("listUsers (Door 2) vs admin_list_users", () => {
  it("returns the same rows, byte for byte, in the same order", async () => {
    const label = await createTestUser({ role: "label_member" });
    try {
      const client = await label.signIn();
      const { data, error } = await client.rpc("admin_list_users");
      if (error) throw error;
      expect(await listUsers(await getViewer(client))).toEqual(data);
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
