// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeed, type FeedItem } from "./feed";
import { createAdminClient, createAnonClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const tag = `FDZ${Date.now()}`;
let user: Awaited<ReturnType<typeof createTestUser>>;
let labelUser: Awaited<ReturnType<typeof createTestUser>>;
let client: SupabaseClient;
let labelClient: SupabaseClient;
let singleRelease: string;
// The feed ids of the four fixture releases (a single's is its track id, an
// album's its album id), oldest first.
const ids = { single: "", plain: "", titled: "", credited: "" };

// Delete in an order the database allows: deleting a track or an album also
// deletes its link rows, and artists go last because the database refuses to
// delete an artist that a credit still points at (20261010120400).
const created = { releases: [] as string[], tracks: [] as string[], albums: [] as string[], artists: [] as string[] };
async function row(table: keyof typeof created, values: Record<string, unknown>) {
  const { data, error } = await admin.from(table).insert(values).select("id").single();
  if (error) throw error;
  created[table].push(data.id);
  return data.id as string;
}
async function insert(
  table: "track_albums" | "album_artists" | "track_artists",
  values: Record<string, unknown> | Array<Record<string, unknown>>,
) {
  const { error } = await admin.from(table).insert(values);
  if (error) throw error;
}

beforeAll(async () => {
  // A single with a %, _ and \ in its title, credited to a mixed-case artist.
  const t = await row("tracks", { title: `${tag} 100% under_score back\\slash`, audio_url: "tracks/a.mp3" });
  const a = await row("artists", { name: `${tag} MiXeD Artist` });
  await insert("track_artists", { track_id: t, artist_id: a, position: 1 });
  singleRelease = await row("releases", { kind: "single", track_id: t });
  ids.single = t;
  // An album that matches only through a live track (its title or its artist),
  // plus an archived track that must not match.
  const al = await row("albums", { title: "Plain Album" });
  ids.plain = al;
  const live = await row("tracks", { title: `${tag} inner live`, audio_url: "tracks/b.mp3" });
  await insert("track_artists", { track_id: live, artist_id: await row("artists", { name: `${tag} Inner Artist` }), position: 1 });
  const archived = await row("tracks", { title: `${tag} ghost`, audio_url: "tracks/c.mp3", archived_at: new Date().toISOString() });
  await insert("track_albums", [
    { album_id: al, track_id: live, position: 1 },
    { album_id: al, track_id: archived, position: 2 },
  ]);
  await row("releases", { kind: "album", album_id: al });
  // An album that matches through its own title, and one through its album artist credit.
  const titled = await row("albums", { title: `${tag} Titled LP` });
  ids.titled = titled;
  const titledTrack = await row("tracks", { title: "Titled track", audio_url: "tracks/d.mp3" });
  await insert("track_albums", { album_id: titled, track_id: titledTrack, position: 1 });
  await row("releases", { kind: "album", album_id: titled });
  const credited = await row("albums", { title: "Credited Album" });
  ids.credited = credited;
  const creditArtist = await row("artists", { name: `${tag} Album Credit` });
  await insert("album_artists", { album_id: credited, artist_id: creditArtist, position: 1 });
  const creditedTrack = await row("tracks", { title: "Credited track", audio_url: "tracks/e.mp3" });
  await insert("track_albums", { album_id: credited, track_id: creditedTrack, position: 1 });
  await row("releases", { kind: "album", album_id: credited });
  user = await createTestUser({ role: "listener" });
  client = await user.signIn();
  labelUser = await createTestUser({ role: "label_member" });
  labelClient = await labelUser.signIn();
});

// Users are guarded so a failed beforeAll doesn't make cleanup throw; if
// deleting a test row fails, the run still fails after the users are removed.
afterAll(async () => {
  try {
    for (const table of ["releases", "tracks", "albums", "artists"] as const) {
      const ids = created[table].splice(0);
      if (!ids.length) continue;
      const { error } = await admin.from(table).delete().in("id", ids);
      if (error) throw error;
    }
  } finally {
    if (user) await user.cleanup();
    if (labelUser) await labelUser.cleanup();
  }
});

// What search_feed (the SQL function getFeed replaced, dropped in slice 4)
// returned for each search, newest first. Every term but the last four only
// matches the fixture.
const SEARCHES: Array<[string, () => string[]]> = [
  [tag, () => [ids.credited, ids.titled, ids.plain, ids.single]],
  [`${tag} 100%`, () => [ids.single]],
  [`${tag.toLowerCase()} mixed artist`, () => [ids.single]],
  [`${tag} ghost`, () => []],
  [`${tag} inner`, () => [ids.plain]],
  [`${tag} inner artist`, () => [ids.plain]],
  [`${tag} Titled`, () => [ids.titled]],
  [`${tag} Album Credit`, () => [ids.credited]],
];

// %, _ and \ are plain characters in a search, never wildcards. These terms
// match across the whole local catalog: of the fixture, only the single
// matches, and every result must really contain the term.
const CATALOG_WIDE = [`under_score`, `back\\slash`, `%`, `_`];

// The text a search looks at: the title and artists, plus (for an album) its
// live tracks' titles and artists.
function searchedText(item: FeedItem): string[] {
  const own = [item.title, ...item.artistNames];
  return item.kind === "album" ? [...own, ...item.tracks.flatMap((t) => [t.title, ...t.artistNames])] : own;
}

describe("getFeed on Drizzle: search results (as search_feed gave them)", () => {
  describe.each([
    ["listener", () => client],
    ["label_member", () => labelClient],
  ])("as a %s", (_role, as) => {
    it.each(SEARCHES)("finds exactly the matching releases for %j, newest first", async (q, expected) => {
      const { items } = await getFeed(as(), { q, pageSize: 500 });
      expect(items.map((i) => i.id)).toEqual(expected());
    });

    it.each(CATALOG_WIDE)("treats %j as plain text", async (q) => {
      const { items } = await getFeed(as(), { q, pageSize: 500 });
      const fixture = Object.values(ids);
      expect(items.map((i) => i.id).filter((id) => fixture.includes(id))).toEqual([ids.single]);
      for (const item of items) {
        expect(searchedText(item).some((text) => text.toLowerCase().includes(q.toLowerCase()))).toBe(true);
      }
    });
  });

  it("returns a hit's kind and title", async () => {
    const { items } = await getFeed(client, { q: `${tag} 100%`, pageSize: 5 });
    expect(items[0]).toMatchObject({ kind: "track", id: ids.single, title: `${tag} 100% under_score back\\slash` });
  });

  it("createdAt is byte-identical to PostgREST's string", async () => {
    const { data, error } = await admin.from("releases").select("created_at").eq("id", singleRelease).single();
    if (error) throw error;
    const { items } = await getFeed(client, { q: `${tag} 100%`, pageSize: 5 });
    expect(items[0].createdAt).toBe(data.created_at);
  });

  it("a page past the end has no items and correct totals", async () => {
    const { count, error } = await client.from("releases").select("id", { count: "exact", head: true }).is("archived_at", null);
    if (error) throw error;
    if (count === null) throw new Error("the release count came back empty");
    const page = await getFeed(client, { page: 9999, pageSize: 1 });
    expect(page).toMatchObject({ items: [], total: count, totalPages: Math.max(1, count), hasMore: false });
  });

  it("rejects a signed-out client with UNAUTHENTICATED", async () => {
    await expect(getFeed(createAnonClient(), {})).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
