// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { getAlbum } from "./albums";
import { createAdminClient, createAnonClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();

// Delete in FK-safe order. Track and album deletes cascade their link rows;
// artists go last because credit FKs are `restrict` (20261010120400).
const created = { releases: [] as string[], tracks: [] as string[], albums: [] as string[], artists: [] as string[] };
afterEach(async () => {
  for (const table of ["releases", "tracks", "albums", "artists"] as const) {
    const ids = created[table].splice(0);
    if (ids.length) await admin.from(table).delete().in("id", ids);
  }
});
async function row(table: keyof typeof created, values: Record<string, unknown>) {
  const { data, error } = await admin.from(table).insert(values).select("id").single();
  if (error) throw error;
  created[table].push(data.id);
  return data.id as string;
}

describe("getAlbum (Drizzle)", () => {
  it("orders tracks and artists by position, dedupes artists, drops archived tracks", async () => {
    const tag = `ALBDZ${Date.now()}`;
    const al = await row("albums", { title: `${tag} LP` });
    const a1 = await row("artists", { name: `${tag} First` });
    const a2 = await row("artists", { name: `${tag} Second` });
    await admin.from("album_artists").insert([
      { album_id: al, artist_id: a2, position: 2 },
      { album_id: al, artist_id: a1, position: 1 },
    ]);
    const t1 = await row("tracks", { title: `${tag} One`, audio_url: "tracks/1.mp3" });
    const t2 = await row("tracks", { title: `${tag} Two`, audio_url: "tracks/2.mp3" });
    const gone = await row("tracks", { title: `${tag} Gone`, audio_url: "tracks/3.mp3", archived_at: new Date().toISOString() });
    await admin.from("track_albums").insert([
      { album_id: al, track_id: t2, position: 2 },
      { album_id: al, track_id: gone, position: 3 },
      { album_id: al, track_id: t1, position: 1 },
    ]);
    await admin.from("track_artists").insert([
      { track_id: t1, artist_id: a1, position: 1 },
      { track_id: t1, artist_id: a2, position: 2 },
    ]);
    await row("releases", { kind: "album", album_id: al });

    const user = await createTestUser();
    try {
      const album = await getAlbum(await user.signIn(), al);
      expect(album?.artistNames).toEqual([`${tag} First`, `${tag} Second`]);
      expect(album?.tracks.map((t) => t.title)).toEqual([`${tag} One`, `${tag} Two`]);
      expect(album?.tracks[0].artistNames).toEqual([`${tag} First`, `${tag} Second`]);
    } finally {
      await user.cleanup();
    }
  });

  it("rejects a signed-out client with UNAUTHENTICATED", async () => {
    await expect(getAlbum(createAnonClient(), "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
