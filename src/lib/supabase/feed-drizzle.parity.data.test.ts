// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeed } from "./feed";
import { createAdminClient, createAnonClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const tag = `FDZ${Date.now()}`;
let user: Awaited<ReturnType<typeof createTestUser>>;
let labelUser: Awaited<ReturnType<typeof createTestUser>>;
let client: SupabaseClient;
let labelClient: SupabaseClient;
let singleRelease: string;

// Delete in FK-safe order. Track and album deletes cascade their link rows;
// artists go last because credit FKs are `restrict` (20261010120400).
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
  // An album that matches only through a live track, plus an archived track that must not match.
  const al = await row("albums", { title: "Plain Album" });
  const live = await row("tracks", { title: `${tag} inner live`, audio_url: "tracks/b.mp3" });
  const archived = await row("tracks", { title: `${tag} ghost`, audio_url: "tracks/c.mp3", archived_at: new Date().toISOString() });
  await insert("track_albums", [
    { album_id: al, track_id: live, position: 1 },
    { album_id: al, track_id: archived, position: 2 },
  ]);
  await row("releases", { kind: "album", album_id: al });
  // An album that matches through its own title, and one through its album artist credit.
  const titled = await row("albums", { title: `${tag} Titled LP` });
  const titledTrack = await row("tracks", { title: "Titled track", audio_url: "tracks/d.mp3" });
  await insert("track_albums", { album_id: titled, track_id: titledTrack, position: 1 });
  await row("releases", { kind: "album", album_id: titled });
  const credited = await row("albums", { title: "Credited Album" });
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

// Users are guarded so a failed beforeAll doesn't make cleanup throw; a failed
// fixture delete still fails the run after the users are removed.
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

async function rpcIds(c: SupabaseClient, q: string): Promise<string[]> {
  const { data, error } = await c
    .rpc("search_feed", { q })
    .select("kind, album_id, track_id, pinned, sort_at, id")
    .is("archived_at", null)
    .order("pinned", { ascending: false })
    .order("sort_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return (data as Array<{ kind: string; album_id: string; track_id: string }>).map((r) =>
    r.kind === "album" ? r.album_id : r.track_id,
  );
}

const SEARCH_CASES = [
  tag,
  `${tag} 100%`,
  `under_score`,
  `back\\slash`,
  `${tag.toLowerCase()} mixed artist`,
  `${tag} ghost`,
  `${tag} inner`,
  `${tag} Titled`,
  `${tag} Album Credit`,
  `%`,
  `_`,
];

describe("getFeed on Drizzle: parity with search_feed", () => {
  it.each(SEARCH_CASES)("same matches and order as search_feed for %j (listener)", async (q) => {
    const { items } = await getFeed(client, { q, pageSize: 500 });
    expect(items.map((i) => i.id)).toEqual(await rpcIds(client, q));
  });

  it.each(SEARCH_CASES)("same matches and order as search_feed for %j (label_member)", async (q) => {
    const { items } = await getFeed(labelClient, { q, pageSize: 500 });
    expect(items.map((i) => i.id)).toEqual(await rpcIds(labelClient, q));
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
    const page = await getFeed(client, { page: 9999, pageSize: 1 });
    expect(page).toMatchObject({ items: [], total: count, totalPages: Math.max(1, count!), hasMore: false });
  });

  it("rejects a signed-out client with UNAUTHENTICATED", async () => {
    await expect(getFeed(createAnonClient(), {})).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
