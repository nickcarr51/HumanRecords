import { describe, expect, it } from "vitest";
import { createAnonClient, createTestUser } from "./test-helpers";

describe("users", () => {
  it("auto-creates a user row with the invited role when an account is created", async () => {
    const user = await createTestUser({ role: "artist", firstName: "Ada", lastName: "Lovelace" });
    try {
      const client = await user.signIn();
      const { data, error } = await client
        .from("users")
        .select("id, first_name, last_name, role")
        .eq("id", user.id)
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        id: user.id,
        first_name: "Ada",
        last_name: "Lovelace",
        role: "artist",
      });
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
