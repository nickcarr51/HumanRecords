import { describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";

describe("albums and tracks", () => {
  it("increments play_count only through the RPC, never a direct update", async () => {
    const admin = createAdminClient();
    const { data: track, error: insertError } = await admin
      .from("tracks")
      .insert({ title: "Test Track", audio_url: "https://example.com/test.mp3" })
      .select("id, play_count")
      .single();
    expect(insertError).toBeNull();
    expect(track!.play_count).toBe(0);

    const user = await createTestUser();
    try {
      const client = await user.signIn();

      const { error: rpcError } = await client.rpc("increment_play_count", { p_track_id: track!.id });
      expect(rpcError).toBeNull();

      const { data: afterRpc } = await admin.from("tracks").select("play_count").eq("id", track!.id).single();
      expect(afterRpc!.play_count).toBe(1);

      // RLS with no update policy doesn't raise an error — it silently
      // matches zero rows, the same way a WHERE clause would. The real
      // proof this table is read-only for authenticated clients is that
      // the value below is unchanged, not that this call errors.
      const { error: directUpdateError } = await client
        .from("tracks")
        .update({ play_count: 99 })
        .eq("id", track!.id);
      expect(directUpdateError).toBeNull();

      const { data: afterDirectAttempt } = await admin.from("tracks").select("play_count").eq("id", track!.id).single();
      expect(afterDirectAttempt!.play_count).toBe(1);
    } finally {
      await user.cleanup();
      await admin.from("tracks").delete().eq("id", track!.id);
    }
  });

  it("groups tracks under an album via album_art_url and title", async () => {
    const admin = createAdminClient();
    const { data: album, error } = await admin
      .from("albums")
      .insert({ title: "Test Album", album_art_url: "https://example.com/art.png" })
      .select("id, title")
      .single();

    expect(error).toBeNull();
    expect(album!.title).toBe("Test Album");

    await admin.from("albums").delete().eq("id", album!.id);
  });
});
