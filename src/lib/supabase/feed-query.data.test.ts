import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";
import { getFeed } from "./feed";

const admin = createAdminClient();
const trackIds: string[] = [];
const albumIds: string[] = [];
const artistIds: string[] = [];

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
  // artist-side FKs are restrict: credits go with their tracks (above) first
  if (artistIds.length) await admin.from("artists").delete().in("id", artistIds.splice(0));
});

async function track(title: string) {
  const { data, error } = await admin.from("tracks").insert({ title, audio_url: "tracks/x.mp3" }).select("id").single();
  if (error) throw error;
  trackIds.push(data.id);
  return data.id as string;
}
async function single(trackId: string, sortAt: string) {
  const { error } = await admin.from("releases").insert({ kind: "single", track_id: trackId, sort_at: sortAt });
  if (error) throw error;
}
async function albumWithTrack(albumTitle: string, trackTitle: string, sortAt: string) {
  const { data, error } = await admin.from("albums").insert({ title: albumTitle }).select("id").single();
  if (error) throw error;
  albumIds.push(data.id);
  const t = await track(trackTitle);
  await admin.from("track_albums").insert({ album_id: data.id, track_id: t, position: 1 });
  const rel = await admin.from("releases").insert({ kind: "album", album_id: data.id, sort_at: sortAt });
  if (rel.error) throw rel.error;
  return data.id as string;
}
async function asListener<T>(fn: (client: Awaited<ReturnType<Awaited<ReturnType<typeof createTestUser>>["signIn"]>>) => Promise<T>) {
  const user = await createTestUser({ role: "listener" });
  try {
    return await fn(await user.signIn());
  } finally {
    await user.cleanup();
  }
}

describe("getFeed with q", () => {
  it("returns only matches, in feed order, paginated, with total and totalPages", async () => {
    const tag = `FSQ${Date.now()}`;
    const a = await track(`${tag} One`);
    const b = await track(`${tag} Two`);
    const c = await track(`${tag} Three`);
    const other = await track(`Unrelated ${Date.now()}`);
    await single(a, "2101-01-01T00:00:00Z");
    await single(b, "2101-01-03T00:00:00Z");
    await single(c, "2101-01-02T00:00:00Z");
    await single(other, "2101-01-04T00:00:00Z");

    await asListener(async (client) => {
      const p1 = await getFeed(client, { q: tag, page: 1, pageSize: 2 });
      expect(p1.items.map((i) => i.id)).toEqual([b, c]);
      expect(p1).toMatchObject({ total: 3, totalPages: 2, hasMore: true });
      const p2 = await getFeed(client, { q: tag, page: 2, pageSize: 2 });
      expect(p2.items.map((i) => i.id)).toEqual([a]);
      expect(p2.hasMore).toBe(false);
    });
  });

  it("matches an album through a track title inside it", async () => {
    const tag = `FSA${Date.now()}`;
    const albumId = await albumWithTrack(`Album ${Date.now()}`, `${tag} Inner`, "2101-02-01T00:00:00Z");
    await asListener(async (client) => {
      const { items } = await getFeed(client, { q: `${tag} inner`, pageSize: 10 });
      expect(items.map((i) => [i.kind, i.id])).toEqual([["album", albumId]]);
    });
  });

  it("matches a single through its credited artist name", async () => {
    const tag = `FSR${Date.now()}`;
    const t = await track(`Plain title ${Date.now()}`);
    const { data: artist, error } = await admin.from("artists").insert({ name: `${tag} Artist` }).select("id").single();
    if (error) throw error;
    artistIds.push(artist.id);
    const credit = await admin.from("track_artists").insert({ track_id: t, artist_id: artist.id, position: 1 });
    if (credit.error) throw credit.error;
    await single(t, "2101-05-01T00:00:00Z");
    await asListener(async (client) => {
      const { items } = await getFeed(client, { q: `${tag} artist`, pageSize: 10 });
      expect(items.map((i) => [i.kind, i.id])).toEqual([["track", t]]);
    });
  });

  it("matches an album by its album title", async () => {
    const tag = `FSL${Date.now()}`;
    const albumId = await albumWithTrack(`${tag} Album Title`, `Inner ${Date.now()}`, "2101-06-01T00:00:00Z");
    await asListener(async (client) => {
      const { items } = await getFeed(client, { q: `${tag} album`, pageSize: 10 });
      expect(items.map((i) => [i.kind, i.id])).toEqual([["album", albumId]]);
    });
  });

  it("trims q, and whitespace-only q is the plain feed", async () => {
    const tag = `FST${Date.now()}`;
    const a = await track(`${tag} Padded`);
    await single(a, "2101-03-01T00:00:00Z");
    await asListener(async (client) => {
      const padded = await getFeed(client, { q: `   ${tag}  `, pageSize: 10 });
      expect(padded.items.map((i) => i.id)).toEqual([a]);
      const blank = await getFeed(client, { q: "   ", pageSize: 3 });
      const plain = await getFeed(client, { pageSize: 3 });
      expect(blank.items.map((i) => i.id)).toEqual(plain.items.map((i) => i.id));
      expect(blank.total).toBe(plain.total);
    });
  });

  it("excludes archived releases and treats % and _ literally", async () => {
    const tag = `FSX${Date.now()}`;
    const live = await track(`${tag} 100% Pure_Gold`);
    const decoy = await track(`${tag} 100X PureXGold`);
    const gone = await track(`${tag} 100% Pure_Gone`);
    await single(live, "2101-04-01T00:00:00Z");
    await single(decoy, "2101-04-02T00:00:00Z");
    await single(gone, "2101-04-03T00:00:00Z");
    await admin.from("releases").update({ archived_at: new Date().toISOString() }).eq("track_id", gone);
    await asListener(async (client) => {
      const { items, total } = await getFeed(client, { q: `${tag} 100% Pure_`, pageSize: 10 });
      expect(items.map((i) => i.id)).toEqual([live]);
      expect(total).toBe(1);
    });
  });

  it("plain feed reports total and totalPages", async () => {
    await asListener(async (client) => {
      const { total, totalPages, pageSize } = await getFeed(client, { pageSize: 2 });
      expect(total).toBeGreaterThan(0);
      expect(totalPages).toBe(Math.max(1, Math.ceil(total / pageSize)));
    });
  });
});
