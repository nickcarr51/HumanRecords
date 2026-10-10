import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const trackIds: string[] = [];
const albumIds: string[] = [];
const artistIds: string[] = [];

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
  if (artistIds.length) await admin.from("artists").delete().in("id", artistIds.splice(0));
});

async function track(title: string) {
  const { data, error } = await admin.from("tracks").insert({ title, audio_url: "tracks/x.mp3" }).select("id").single();
  if (error) throw error;
  trackIds.push(data.id);
  return data.id as string;
}
async function artist(name: string) {
  const { data, error } = await admin.from("artists").insert({ name }).select("id").single();
  if (error) throw error;
  artistIds.push(data.id);
  return data.id as string;
}
async function album(title: string) {
  const { data, error } = await admin.from("albums").insert({ title }).select("id").single();
  if (error) throw error;
  albumIds.push(data.id);
  return data.id as string;
}
async function single(trackId: string) {
  const { data, error } = await admin.from("releases").insert({ kind: "single", track_id: trackId }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
async function albumRelease(albumId: string) {
  const { data, error } = await admin.from("releases").insert({ kind: "album", album_id: albumId }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function search(q: string): Promise<string[]> {
  const user = await createTestUser({ role: "listener" });
  try {
    const client = await user.signIn();
    const { data, error } = await client.rpc("search_feed", { q }).select("id");
    if (error) throw error;
    return ((data as unknown as Array<{ id: string }> | null) ?? []).map((r) => r.id);
  } finally {
    await user.cleanup();
  }
}

describe("search_feed", () => {
  it("matches a single by track title, case-insensitively", async () => {
    const tag = `SRCH${Date.now()}`;
    const rel = await single(await track(`${tag} Wavelength`));
    expect(await search(`${tag} wAVE`)).toEqual([rel]);
  });

  it("matches a single by credited artist name", async () => {
    const tag = `SRCHA${Date.now()}`;
    const t = await track("Untitled");
    const a = await artist(`${tag} Nova`);
    await admin.from("track_artists").insert({ track_id: t, artist_id: a, position: 1 });
    const rel = await single(t);
    expect(await search(`${tag} nova`)).toEqual([rel]);
  });

  it("matches an album by title, album artist, track title and track artist", async () => {
    const tag = `SRCHB${Date.now()}`;
    const al = await album(`${tag} Album Title`);
    const albumArtist = await artist(`${tag} Album Artist`);
    const trackArtist = await artist(`${tag} Track Artist`);
    const t = await track(`${tag} Inner Song`);
    await admin.from("album_artists").insert({ album_id: al, artist_id: albumArtist, position: 1 });
    await admin.from("track_albums").insert({ album_id: al, track_id: t, position: 1 });
    await admin.from("track_artists").insert({ track_id: t, artist_id: trackArtist, position: 1 });
    const rel = await albumRelease(al);
    for (const q of [`${tag} Album Title`, `${tag} Album Artist`, `${tag} Inner`, `${tag} Track Artist`]) {
      expect(await search(q)).toEqual([rel]);
    }
  });

  it("excludes archived releases and archived album tracks", async () => {
    const tag = `SRCHC${Date.now()}`;
    const t1 = await track(`${tag} Gone Single`);
    const rel = await single(t1);
    await admin.from("releases").update({ archived_at: new Date().toISOString() }).eq("id", rel);
    expect(await search(`${tag} Gone Single`)).toEqual([]);

    const al = await album(`${tag} Live Album`);
    const t2 = await track(`${tag} Removed Track`);
    await admin.from("track_albums").insert({ album_id: al, track_id: t2, position: 1 });
    await albumRelease(al);
    await admin.from("tracks").update({ archived_at: new Date().toISOString() }).eq("id", t2);
    expect(await search(`${tag} Removed Track`)).toEqual([]);
  });

  it("treats % and _ literally", async () => {
    const tag = `SRCHD${Date.now()}`;
    const rel = await single(await track(`${tag} 100% Pure_Gold`));
    await single(await track(`${tag} 100X PureXGold`));
    expect(await search(`${tag} 100% Pure_`)).toEqual([rel]);
  });

  it("chains with an embedded select", async () => {
    const tag = `SRCHE${Date.now()}`;
    await single(await track(`${tag} Embedded`));
    const user = await createTestUser({ role: "listener" });
    try {
      const client = await user.signIn();
      // PostgREST orders an RPC result only by columns in the select projection.
      const { data, error } = await client
        .rpc("search_feed", { q: `${tag} Embedded` })
        .select("id, kind, pinned, sort_at, track:tracks ( title )")
        .order("pinned", { ascending: false })
        .order("sort_at", { ascending: false })
        .order("id", { ascending: false })
        .range(0, 9);
      expect(error).toBeNull();
      const rows = data as unknown as Array<Record<string, unknown>> | null;
      expect(rows?.[0]).toMatchObject({ kind: "single", track: { title: `${tag} Embedded` } });
    } finally {
      await user.cleanup();
    }
  });
});
