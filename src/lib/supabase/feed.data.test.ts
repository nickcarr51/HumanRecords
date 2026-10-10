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
  artistIds.push(data.id);
  return data.id as string;
}
async function makeTrack(title: string) {
  const { data, error } = await admin
    .from("tracks")
    .insert({ title, audio_url: `tracks/${title}.mp3` })
    .select("id")
    .single();
  if (error) throw error;
  trackIds.push(data.id);
  return data.id as string;
}
async function makeAlbum(title: string) {
  const { data, error } = await admin.from("albums").insert({ title }).select("id").single();
  if (error) throw error;
  albumIds.push(data.id);
  return data.id as string;
}
async function makeSingleRelease(trackId: string, createdAt?: string) {
  const { error } = await admin
    .from("releases")
    .insert({ kind: "single", track_id: trackId, ...(createdAt ? { created_at: createdAt } : {}) });
  if (error) throw error;
}
async function makeAlbumRelease(albumId: string, createdAt?: string) {
  const { error } = await admin
    .from("releases")
    .insert({ kind: "album", album_id: albumId, ...(createdAt ? { created_at: createdAt } : {}) });
  if (error) throw error;
}

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
  if (artistIds.length) await admin.from("artists").delete().in("id", artistIds.splice(0));
});

describe("getFeed", () => {
  it("returns album and single releases newest first, with tracks and credits in position order", async () => {
    const tag = `FEED-${Date.now()}-`;
    const lead = await makeArtist(`${tag}Lead`);
    const feat = await makeArtist(`${tag}Feat`);

    const albumId = await makeAlbum(`${tag}Album`);
    const first = await makeTrack(`${tag}Zed`); // title sorts last, position 1
    const second = await makeTrack(`${tag}Alpha`);
    await admin.from("album_artists").insert({ album_id: albumId, artist_id: lead, position: 1 });
    await admin.from("track_albums").insert([
      { track_id: second, album_id: albumId, position: 2 },
      { track_id: first, album_id: albumId, position: 1 },
    ]);
    await admin.from("track_artists").insert([
      { track_id: first, artist_id: feat, position: 2 },
      { track_id: first, artist_id: lead, position: 1 },
      { track_id: second, artist_id: lead, position: 1 },
    ]);
    await makeAlbumRelease(albumId, "2099-01-01T00:00:00Z");

    const single = await makeTrack(`${tag}Single`);
    await admin.from("track_artists").insert({ track_id: single, artist_id: feat, position: 1 });
    await makeSingleRelease(single, "2099-01-02T00:00:00Z");

    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const { items } = await getFeed(client, { page: 1, pageSize: 2 });

      expect(items.map((i) => i.kind)).toEqual(["track", "album"]); // newest first
      const [s, a] = items;
      if (s.kind !== "track" || a.kind !== "album") throw new Error("unexpected kinds");
      expect(s.id).toBe(single);
      expect(s.artistNames).toEqual([`${tag}Feat`]);
      expect(a.id).toBe(albumId);
      expect(a.artistNames).toEqual([`${tag}Lead`]);
      expect(a.tracks.map((t) => t.id)).toEqual([first, second]);
      expect(a.tracks[0].artistNames).toEqual([`${tag}Lead`, `${tag}Feat`]);
    } finally {
      await user.cleanup();
    }
  });

  it("excludes tracks that have no release", async () => {
    const tag = `NOREL-${Date.now()}-`;
    const orphan = await makeTrack(`${tag}Orphan`);
    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const { items } = await getFeed(client, { page: 1, pageSize: 100 });
      expect(items.some((i) => i.id === orphan)).toBe(false);
    } finally {
      await user.cleanup();
    }
  });

  it("credits an uncredited single with an empty artistNames array", async () => {
    const tag = `NOART-${Date.now()}-`;
    // Created first (older track row) but released newest; the later-created
    // track has the older release. Only a releases-based feed puts `single` first.
    const single = await makeTrack(`${tag}Uncredited`);
    const other = await makeTrack(`${tag}Other`);
    await makeSingleRelease(other, "2099-02-01T00:00:00Z");
    await makeSingleRelease(single, "2099-02-02T00:00:00Z");
    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const { items } = await getFeed(client, { page: 1, pageSize: 1 });
      expect(items[0]).toMatchObject({ kind: "track", id: single, artistNames: [] });
    } finally {
      await user.cleanup();
    }
  });

  it("paginates in the database: pageSize caps items and hasMore flags a remainder", async () => {
    const tag = `PG-${Date.now()}-`;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await makeTrack(`${tag}${i}`);
      // Release dates run opposite to track creation order (first-created = newest release).
      await makeSingleRelease(id, `2099-03-0${3 - i}T00:00:00Z`);
      ids.push(id);
    }
    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const page1 = await getFeed(client, { page: 1, pageSize: 2 });
      expect(page1.items.map((i) => i.id)).toEqual([ids[0], ids[1]]);
      expect(page1.hasMore).toBe(true);
      const page2 = await getFeed(client, { page: 2, pageSize: 2 });
      expect(page2.items[0].id).toBe(ids[2]);
    } finally {
      await user.cleanup();
    }
  });
});

describe("getFeed ordering and archive", () => {
  it("puts pinned releases first, then sort_at newest first", async () => {
    const tag = `ORD-${Date.now()}-`;
    const old = await makeTrack(`${tag}Old`);
    const mid = await makeTrack(`${tag}Mid`);
    const top = await makeTrack(`${tag}Top`);
    await makeSingleRelease(old, "1990-01-01T00:00:00Z");
    await makeSingleRelease(mid, "1991-01-01T00:00:00Z");
    await makeSingleRelease(top, "1992-01-01T00:00:00Z");
    await admin.from("releases").update({ pinned: true }).eq("track_id", old);
    await admin.from("releases").update({ sort_at: "1993-01-01T00:00:00Z" }).eq("track_id", mid);

    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const { items } = await getFeed(client, { page: 1, pageSize: 500 });
      const ids = items.filter((i) => [old, mid, top].includes(i.id)).map((i) => i.id);
      expect(ids).toEqual([old, mid, top]);
      expect(items.findIndex((i) => i.id === old)).toBeLessThan(items.findIndex((i) => i.id === mid));
    } finally {
      await user.cleanup();
    }
  });

  it("hides archived releases and archived album tracks, even from label members", async () => {
    const tag = `ARCF-${Date.now()}-`;
    const gone = await makeTrack(`${tag}Gone`);
    await makeSingleRelease(gone);
    await admin.from("releases").update({ archived_at: new Date().toISOString() }).eq("track_id", gone);

    const albumId = await makeAlbum(`${tag}Album`);
    const keep = await makeTrack(`${tag}Keep`);
    const removed = await makeTrack(`${tag}Removed`);
    await admin.from("track_albums").insert([
      { album_id: albumId, track_id: keep, position: 1 },
      { album_id: albumId, track_id: removed, position: 2 },
    ]);
    await makeAlbumRelease(albumId);
    await admin.from("tracks").update({ archived_at: new Date().toISOString() }).eq("id", removed);

    const label = await createTestUser({ role: "label_member" });
    try {
      const client = await label.signIn();
      const { items } = await getFeed(client, { page: 1, pageSize: 500 });
      expect(items.some((i) => i.id === gone)).toBe(false);
      const albumItem = items.find((i) => i.id === albumId);
      expect(albumItem?.kind === "album" && albumItem.tracks.map((t) => t.id)).toEqual([keep]);
    } finally {
      await label.cleanup();
    }
  });
});
