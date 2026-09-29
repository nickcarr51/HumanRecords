import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";
import { getFeed } from "./feed";

const admin = createAdminClient();
const trackIds: string[] = [];
const albumIds: string[] = [];
const artistIds: string[] = [];

async function makeArtist(name: string) {
  const { data, error } = await admin.from("artists").insert({ name }).select("id").single();
  if (error) throw error;
  artistIds.push(data!.id);
  return data!.id as string;
}
async function makeTrack(title: string) {
  const { data, error } = await admin
    .from("tracks")
    .insert({ title, audio_url: `tracks/${title}/audio.mp3` })
    .select("id")
    .single();
  if (error) throw error;
  trackIds.push(data!.id);
  return data!.id as string;
}
async function makeAlbum(title: string) {
  const { data, error } = await admin.from("albums").insert({ title }).select("id").single();
  if (error) throw error;
  albumIds.push(data!.id);
  return data!.id as string;
}

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
  if (artistIds.length) await admin.from("artists").delete().in("id", artistIds.splice(0));
});

describe("getFeed", () => {
  it("returns albums (with their tracks + artist names) and standalone tracks, newest first", async () => {
    const tag = `FEED-${Date.now()}-`;
    const artistA = await makeArtist(`${tag}Alpha`);
    const artistB = await makeArtist(`${tag}Beta`);

    // An album with two tracks.
    const albumId = await makeAlbum(`${tag}Album`);
    const t1 = await makeTrack(`${tag}AlbumTrack1`);
    const t2 = await makeTrack(`${tag}AlbumTrack2`);
    await admin.from("album_artists").insert({ album_id: albumId, artist_id: artistA });
    await admin.from("track_albums").insert([
      { track_id: t1, album_id: albumId },
      { track_id: t2, album_id: albumId },
    ]);
    await admin.from("track_artists").insert([
      { track_id: t1, artist_id: artistA },
      { track_id: t2, artist_id: artistB },
    ]);

    // A standalone track (no track_albums row).
    const single = await makeTrack(`${tag}Single`);
    await admin.from("track_artists").insert({ track_id: single, artist_id: artistB });

    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const { items } = await getFeed(client, { page: 1, pageSize: 50 });

      const album = items.find((i) => i.kind === "album" && i.id === albumId);
      expect(album).toBeDefined();
      if (album?.kind === "album") {
        expect(album.tracks.map((t) => t.title).sort()).toEqual(
          [`${tag}AlbumTrack1`, `${tag}AlbumTrack2`].sort(),
        );
        expect(album.artistNames).toContain(`${tag}Alpha`);
      }

      const feedSingle = items.find((i) => i.kind === "track" && i.id === single);
      expect(feedSingle).toBeDefined();
      if (feedSingle?.kind === "track") {
        expect(feedSingle.artistNames).toEqual([`${tag}Beta`]);
      }

      // The album's own tracks must NOT appear as standalone feed items.
      expect(items.some((i) => i.kind === "track" && (i.id === t1 || i.id === t2))).toBe(false);
    } finally {
      await user.cleanup();
    }
  });

  it("credits an uncredited track with an empty artistNames array (never crashes)", async () => {
    const tag = `NOART-${Date.now()}-`;
    const single = await makeTrack(`${tag}Orphan`);
    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const { items } = await getFeed(client, { page: 1, pageSize: 50 });
      const orphan = items.find((i) => i.kind === "track" && i.id === single);
      expect(orphan).toBeDefined();
      if (orphan?.kind === "track") expect(orphan.artistNames).toEqual([]);
    } finally {
      await user.cleanup();
    }
  });

  it("paginates: pageSize caps items and hasMore flags a remainder", async () => {
    const tag = `PG-${Date.now()}-`;
    for (let i = 0; i < 3; i++) await makeTrack(`${tag}${i}`);
    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const page1 = await getFeed(client, { page: 1, pageSize: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.hasMore).toBe(true);
    } finally {
      await user.cleanup();
    }
  });
});
