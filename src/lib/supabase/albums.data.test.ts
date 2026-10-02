import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";
import { getAlbum } from "./albums";

const admin = createAdminClient();
const trackIds: string[] = [];
const albumIds: string[] = [];
const artistIds: string[] = [];

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
  if (artistIds.length) await admin.from("artists").delete().in("id", artistIds.splice(0));
});

describe("getAlbum", () => {
  it("returns an album with its tracks and artist names, or null when missing", async () => {
    const tag = `ALB-${Date.now()}-`;
    const { data: artist } = await admin.from("artists").insert({ name: `${tag}Art` }).select("id").single();
    artistIds.push(artist!.id);
    const { data: album } = await admin.from("albums").insert({ title: `${tag}Album` }).select("id").single();
    albumIds.push(album!.id);
    const { data: track } = await admin
      .from("tracks")
      .insert({ title: `${tag}T1`, audio_url: "tracks/x/audio.mp3" })
      .select("id")
      .single();
    trackIds.push(track!.id);
    await admin.from("album_artists").insert({ album_id: album!.id, artist_id: artist!.id, position: 1 });
    await admin.from("track_albums").insert({ track_id: track!.id, album_id: album!.id, position: 1 });
    await admin.from("track_artists").insert({ track_id: track!.id, artist_id: artist!.id, position: 1 });

    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const detail = await getAlbum(client, album!.id);
      expect(detail).not.toBeNull();
      expect(detail!.title).toBe(`${tag}Album`);
      expect(detail!.artistNames).toContain(`${tag}Art`);
      expect(detail!.tracks.map((t) => t.title)).toContain(`${tag}T1`);

      expect(await getAlbum(client, "00000000-0000-0000-0000-000000000000")).toBeNull();
      expect(await getAlbum(client, "not-a-uuid")).toBeNull();
    } finally {
      await user.cleanup();
    }
  });

  it("orders tracks by position, not title", async () => {
    const tag = `ALBPOS-${Date.now()}-`;
    const { data: album } = await admin.from("albums").insert({ title: `${tag}Album` }).select("id").single();
    albumIds.push(album!.id);
    const { data: zed } = await admin.from("tracks").insert({ title: `${tag}Zed`, audio_url: "tracks/z.mp3" }).select("id").single();
    const { data: alpha } = await admin.from("tracks").insert({ title: `${tag}Alpha`, audio_url: "tracks/a.mp3" }).select("id").single();
    trackIds.push(zed!.id, alpha!.id);
    await admin.from("track_albums").insert([
      { track_id: zed!.id, album_id: album!.id, position: 1 },
      { track_id: alpha!.id, album_id: album!.id, position: 2 },
    ]);

    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const detail = await getAlbum(client, album!.id);
      expect(detail!.tracks.map((t) => t.title)).toEqual([`${tag}Zed`, `${tag}Alpha`]);
      expect(detail!.artistNames).toEqual([]);
    } finally {
      await user.cleanup();
    }
  });
});
