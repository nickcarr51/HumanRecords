import { describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";

async function makeTrackArtistAlbum(admin: ReturnType<typeof createAdminClient>) {
  const { data: artist } = await admin.from("artists").insert({ name: "Relation Test Artist" }).select("id").single();
  const { data: album } = await admin.from("albums").insert({ title: "Relation Test Album" }).select("id").single();
  const { data: track } = await admin
    .from("tracks")
    .insert({ title: "Relation Test Track", audio_url: "https://example.com/r.mp3" })
    .select("id")
    .single();
  return { artistId: artist!.id as string, albumId: album!.id as string, trackId: track!.id as string };
}

describe("catalog relations", () => {
  it("credits a track to multiple artists and puts it on multiple albums", async () => {
    const admin = createAdminClient();
    const { artistId, albumId, trackId } = await makeTrackArtistAlbum(admin);
    try {
      const { error: taError } = await admin.from("track_artists").insert({ track_id: trackId, artist_id: artistId });
      expect(taError).toBeNull();

      const { error: aaError } = await admin.from("album_artists").insert({ album_id: albumId, artist_id: artistId });
      expect(aaError).toBeNull();

      const { error: talError } = await admin.from("track_albums").insert({ track_id: trackId, album_id: albumId });
      expect(talError).toBeNull();

      const user = await createTestUser();
      try {
        const client = await user.signIn();
        const { data, error } = await client
          .from("track_artists")
          .select("track_id, artist_id")
          .eq("track_id", trackId);
        expect(error).toBeNull();
        expect(data).toEqual([{ track_id: trackId, artist_id: artistId }]);
      } finally {
        await user.cleanup();
      }
    } finally {
      await admin.from("track_artists").delete().eq("track_id", trackId);
      await admin.from("album_artists").delete().eq("album_id", albumId);
      await admin.from("track_albums").delete().eq("track_id", trackId);
      await admin.from("tracks").delete().eq("id", trackId);
      await admin.from("albums").delete().eq("id", albumId);
      await admin.from("artists").delete().eq("id", artistId);
    }
  });

  it("records one download per user+track and rejects a duplicate", async () => {
    const admin = createAdminClient();
    const { data: track } = await admin
      .from("tracks")
      .insert({ title: "Download Test Track", audio_url: "https://example.com/d.mp3" })
      .select("id")
      .single();
    const user = await createTestUser();
    try {
      // No insert policy exists yet (Global Constraints) — recording a
      // download is a service-role action until dashboard UI defines who
      // can write it, so this uses the admin client, not the user's.
      const first = await admin.from("downloads").insert({ user_id: user.id, track_id: track!.id });
      expect(first.error).toBeNull();

      const duplicate = await admin.from("downloads").insert({ user_id: user.id, track_id: track!.id });
      expect(duplicate.error).not.toBeNull();

      const { data: rows } = await admin.from("downloads").select("user_id, track_id").eq("track_id", track!.id);
      expect(rows).toHaveLength(1);

      const client = await user.signIn();
      const { data: readBack, error: readError } = await client
        .from("downloads")
        .select("user_id, track_id")
        .eq("track_id", track!.id);
      expect(readError).toBeNull();
      expect(readBack).toEqual([{ user_id: user.id, track_id: track!.id }]);
    } finally {
      await admin.from("downloads").delete().eq("track_id", track!.id);
      await admin.from("tracks").delete().eq("id", track!.id);
      await user.cleanup();
    }
  });

  it("does not expose one user's downloads to another user", async () => {
    const admin = createAdminClient();
    const { data: track } = await admin
      .from("tracks")
      .insert({ title: "Isolation Test Track", audio_url: "https://example.com/iso.mp3" })
      .select("id")
      .single();
    const owner = await createTestUser();
    const other = await createTestUser();
    try {
      await admin.from("downloads").insert({ user_id: owner.id, track_id: track!.id });

      // The owner reads their own download.
      const ownerClient = await owner.signIn();
      const { data: ownRows } = await ownerClient
        .from("downloads")
        .select("user_id, track_id")
        .eq("track_id", track!.id);
      expect(ownRows).toEqual([{ user_id: owner.id, track_id: track!.id }]);

      // A different member sees nothing — RLS scopes reads to the owner.
      const otherClient = await other.signIn();
      const { data: otherRows, error: otherError } = await otherClient
        .from("downloads")
        .select("user_id, track_id")
        .eq("track_id", track!.id);
      expect(otherError).toBeNull();
      expect(otherRows).toEqual([]);
    } finally {
      await admin.from("downloads").delete().eq("track_id", track!.id);
      await admin.from("tracks").delete().eq("id", track!.id);
      await owner.cleanup();
      await other.cleanup();
    }
  });
});
