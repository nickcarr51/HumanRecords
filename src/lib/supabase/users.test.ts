import { describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, createTestUser } from "./test-helpers";

describe("users", () => {
  it("auto-creates a user row with the invited role; names are public, role is not", async () => {
    const user = await createTestUser({ role: "artist", firstName: "Ada", lastName: "Lovelace" });
    try {
      const client = await user.signIn();

      // Display names are readable by any authenticated member.
      const { data: names, error: namesError } = await client
        .from("users")
        .select("id, first_name, last_name")
        .eq("id", user.id)
        .single();
      expect(namesError).toBeNull();
      expect(names).toMatchObject({
        id: user.id,
        first_name: "Ada",
        last_name: "Lovelace",
      });

      // Role is hidden from authenticated members (column-level grant).
      const { error: roleReadError } = await client
        .from("users")
        .select("role")
        .eq("id", user.id);
      expect(roleReadError).not.toBeNull();

      // The trigger still set the role correctly — visible only to the
      // service role (which bypasses the column grant).
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

  it("blocks anonymous reads via RLS", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from("users").select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
