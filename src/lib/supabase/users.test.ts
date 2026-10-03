import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, createTestUser } from "./test-helpers";

describe("users", () => {
  it("auto-creates a user row with the invited role; name is public, role is not", async () => {
    const user = await createTestUser({ role: "artist", name: "Ada Lovelace" });
    try {
      const client = await user.signIn();

      const { data: row, error: nameError } = await client
        .from("users")
        .select("id, name")
        .eq("id", user.id)
        .single();
      expect(nameError).toBeNull();
      expect(row).toMatchObject({ id: user.id, name: "Ada Lovelace" });

      // Role is hidden from authenticated members (column-level grant).
      const { error: roleReadError } = await client.from("users").select("role").eq("id", user.id);
      expect(roleReadError).not.toBeNull();

      const admin = createAdminClient();
      const { data: adminRow, error: adminError } = await admin
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();
      expect(adminError).toBeNull();
      expect(adminRow).toMatchObject({ role: "artist" });
    } finally {
      await user.cleanup();
    }
  });

  // Role-trigger landmine regression: user_metadata is user-writable, so a
  // role placed there must be ignored. Only admin-only app_metadata counts.
  it("ignores role in user_metadata and defaults to listener", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: `test-${randomUUID()}@example.com`,
      email_confirm: true,
      user_metadata: { role: "label_member", name: "Sneaky" },
    });
    expect(error).toBeNull();
    try {
      const { data: row } = await admin.from("users").select("role, name").eq("id", data.user!.id).single();
      expect(row).toMatchObject({ role: "listener", name: "Sneaky" });
    } finally {
      await admin.auth.admin.deleteUser(data.user!.id);
    }
  });

  it("stores an empty name as null", async () => {
    const user = await createTestUser({ name: "   " });
    try {
      const { data: row } = await createAdminClient().from("users").select("name").eq("id", user.id).single();
      expect(row!.name).toBeNull();
    } finally {
      await user.cleanup();
    }
  });

  describe("role sync on app_metadata update", () => {
    it("copies a changed app_metadata role to public.users", async () => {
      const user = await createTestUser({ role: "listener" });
      try {
        const admin = createAdminClient();
        const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { role: "artist" } });
        expect(error).toBeNull();
        const { data: row, error: readError } = await admin.from("users").select("role").eq("id", user.id).single();
        expect(readError).toBeNull();
        expect(row).toMatchObject({ role: "artist" });
      } finally {
        await user.cleanup();
      }
    });

    it("leaves public.users.role alone when app_metadata has no role change", async () => {
      const user = await createTestUser({ role: "listener" });
      try {
        const admin = createAdminClient();
        const { error: setError } = await admin.from("users").update({ role: "label_member" }).eq("id", user.id);
        expect(setError).toBeNull();
        const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { some_flag: true } });
        expect(error).toBeNull();
        const { data: row, error: readError } = await admin.from("users").select("role").eq("id", user.id).single();
        expect(readError).toBeNull();
        expect(row).toMatchObject({ role: "label_member" });
      } finally {
        await user.cleanup();
      }
    });
  });

  it("blocks anonymous reads via RLS", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from("users").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
