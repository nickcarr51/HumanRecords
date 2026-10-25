// src/lib/supabase/feed-drizzle.parity.data.test.ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeed } from "./feed";
import { createAdminClient, createAnonClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const tag = `FDZ${Date.now()}`;
let user: Awaited<ReturnType<typeof createTestUser>>;
let client: SupabaseClient;
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

beforeAll(async () => {
  // A single with a %, _ and \ in its title, credited to a mixed-case artist.
  const t = await row("tracks", { title: `${tag} 100% under_score back\\slash`, audio_url: "tracks/a.mp3" });
  const a = await row("artists", { name: `${tag} MiXeD Artist` });
  await admin.from("track_artists").insert({ track_id: t, artist_id: a, position: 1 });
  singleRelease = await row("releases", { kind: "single", track_id: t });
  // An album that matches only through a live track, plus an archived track that must not match.
  const al = await row("albums", { title: "Plain Album" });
  const live = await row("tracks", { title: `${tag} inner live`, audio_url: "tracks/b.mp3" });
  const archived = await row("tracks", { title: `${tag} ghost`, audio_url: "tracks/c.mp3", archived_at: new Date().toISOString() });
  await admin.from("track_albums").insert([
    { album_id: al, track_id: live, position: 1 },
    { album_id: al, track_id: archived, position: 2 },
  ]);
  await row("releases", { kind: "album", album_id: al });
  user = await createTestUser({ role: "listener" });
  client = await user.signIn();
});

afterAll(async () => {
  for (const table of ["releases", "tracks", "albums", "artists"] as const) {
    const ids = created[table].splice(0);
    if (ids.length) await admin.from(table).delete().in("id", ids);
  }
  await user.cleanup();
});

async function rpcIds(q: string): Promise<string[]> {
  const { data, error } = await client
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

describe("getFeed on Drizzle: parity with search_feed", () => {
  it.each([
    tag,
    `${tag} 100%`,
    `under_score`,
    `back\\slash`,
    `${tag.toLowerCase()} mixed artist`,
    `${tag} ghost`,
    `${tag} inner`,
    `%`,
    `_`,
  ])("same matches and order as search_feed for %j", async (q) => {
    const { items } = await getFeed(client, { q, pageSize: 500 });
    expect(items.map((i) => i.id)).toEqual(await rpcIds(q));
  });

  it("createdAt is byte-identical to PostgREST's string", async () => {
    const { data } = await admin.from("releases").select("created_at").eq("id", singleRelease).single();
    const { items } = await getFeed(client, { q: `${tag} 100%`, pageSize: 5 });
    expect(items[0].createdAt).toBe(data!.created_at);
  });

  it("a page past the end has no items and correct totals", async () => {
    const { count } = await client.from("releases").select("id", { count: "exact", head: true }).is("archived_at", null);
    const page = await getFeed(client, { page: 9999, pageSize: 1 });
    expect(page).toMatchObject({ items: [], total: count, totalPages: Math.max(1, count!), hasMore: false });
  });

  it("rejects a signed-out client with UNAUTHENTICATED", async () => {
    await expect(getFeed(createAnonClient(), {})).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
