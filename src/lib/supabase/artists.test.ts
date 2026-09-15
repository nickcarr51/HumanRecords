import { describe, expect, it } from "vitest";
import { createAnonClient, createAdminClient, createTestUser } from "./test-helpers";

describe("artists", () => {
  it("lets an authenticated user read an artist row, independent of any profile", async () => {
    const admin = createAdminClient();
    const { data: artist, error: insertError } = await admin
      .from("artists")
      .insert({ name: "Unsigned Artist" })
      .select("id, name, user_id")
      .single();
    expect(insertError).toBeNull();
    expect(artist!.user_id).toBeNull();

    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const { data, error } = await client.from("artists").select("id, name").eq("id", artist!.id).single();

      expect(error).toBeNull();
      expect(data).toMatchObject({ id: artist!.id, name: "Unsigned Artist" });
    } finally {
      await user.cleanup();
      await admin.from("artists").delete().eq("id", artist!.id);
    }
  });

  it("links an artist to a profile via artists.user_id, and rejects a second artist claiming the same user", async () => {
    const admin = createAdminClient();
    const user = await createTestUser({ role: "artist" });
    let firstArtistId: string | undefined;
    try {
      const { data: artist, error } = await admin
        .from("artists")
        .insert({ name: "Self-performing Artist", user_id: user.id })
        .select("id, user_id")
        .single();

      expect(error).toBeNull();
      expect(artist!.user_id).toBe(user.id);
      firstArtistId = artist!.id;

      const duplicate = await admin.from("artists").insert({ name: "Impostor Artist", user_id: user.id });
      expect(duplicate.error).not.toBeNull();
    } finally {
      if (firstArtistId) await admin.from("artists").delete().eq("id", firstArtistId);
      await user.cleanup();
    }
  });

  it("blocks anonymous reads via RLS", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from("artists").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
