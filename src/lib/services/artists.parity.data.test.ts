// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { removeArtist } from "./artists";
import { getViewer } from "./viewer";

// removeArtist next to the admin_delete_artist SQL function it replaces: on
// the same kind of artist, both give the same result.
const admin = createAdminClient();
const artistIds: string[] = [];
const trackIds: string[] = [];
const albumIds: string[] = [];
const users: Array<Awaited<ReturnType<typeof createTestUser>>> = [];
const clients = {} as Record<"label_member" | "listener" | "artist", SupabaseClient>;

beforeAll(async () => {
  for (const role of ["label_member", "listener", "artist"] as const) {
    const user = await createTestUser({ role });
    users.push(user);
    clients[role] = await user.signIn();
  }
});

afterAll(async () => {
  for (const u of users) await u.cleanup();
});

// Tracks and albums first (their credit rows go with them), then the queue
// rows and the artists.
afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
  const ids = artistIds.splice(0);
  if (ids.length) {
    await admin.from("r2_cleanup_queue").delete().in("source_id", ids);
    await admin.from("artists").delete().in("id", ids);
  }
});

async function seedArtist(photo: string | null = null): Promise<string> {
  const { data, error } = await admin
    .from("artists")
    .insert({ name: `RMA-${randomUUID()}`, profile_photo_url: photo })
    .select("id")
    .single();
  if (error) throw error;
  artistIds.push(data.id);
  return data.id as string;
}

async function creditOnTrack(artistId: string) {
  const { data, error } = await admin.from("tracks").insert({ title: "RMA track", audio_url: "tracks/x.mp3" }).select("id").single();
  if (error) throw error;
  trackIds.push(data.id);
  await admin.from("track_artists").insert({ track_id: data.id, artist_id: artistId, position: 1 });
}

async function creditOnAlbum(artistId: string) {
  const { data, error } = await admin.from("albums").insert({ title: "RMA album" }).select("id").single();
  if (error) throw error;
  albumIds.push(data.id);
  await admin.from("album_artists").insert({ album_id: data.id, artist_id: artistId, position: 1 });
}

async function exists(id: string): Promise<boolean> {
  const { data, error } = await admin.from("artists").select("id").eq("id", id);
  if (error) throw error;
  return data.length === 1;
}

async function queued(id: string) {
  const { data, error } = await admin
    .from("r2_cleanup_queue")
    .select("object_key, reason, source_table, cleaned_at")
    .eq("source_id", id);
  if (error) throw error;
  return data;
}

const viaFunction = (role: keyof typeof clients, id: string) =>
  clients[role].rpc("admin_delete_artist", { target: id });
const viaService = async (role: keyof typeof clients, id: string) =>
  removeArtist(await getViewer(clients[role]), id);

describe("removeArtist vs admin_delete_artist", () => {
  it("deletes an artist with a photo and queues the same cleanup row", async () => {
    const [old, next] = [await seedArtist("artists/rma.jpg"), await seedArtist("artists/rma.jpg")];
    expect((await viaFunction("label_member", old)).error).toBeNull();
    await viaService("label_member", next);
    expect([await exists(old), await exists(next)]).toEqual([false, false]);
    const row = { object_key: "artists/rma.jpg", reason: "archived", source_table: "artists", cleaned_at: null };
    expect(await queued(old)).toEqual([row]);
    expect(await queued(next)).toEqual([row]);
  });

  it("deletes an artist without a photo and queues nothing", async () => {
    const [old, next] = [await seedArtist(), await seedArtist()];
    expect((await viaFunction("label_member", old)).error).toBeNull();
    await viaService("label_member", next);
    expect([await exists(old), await exists(next)]).toEqual([false, false]);
    expect(await queued(old)).toEqual([]);
    expect(await queued(next)).toEqual([]);
  });

  it.each([
    ["a track", creditOnTrack],
    ["an album", creditOnAlbum],
  ])("refuses an artist credited on %s, changes nothing and queues nothing", async (_what, credit) => {
    const [old, next] = [await seedArtist("artists/kept.jpg"), await seedArtist("artists/kept.jpg")];
    await credit(old);
    await credit(next);
    expect((await viaFunction("label_member", old)).error?.code).toBe("23503");
    await expect(viaService("label_member", next)).rejects.toMatchObject({ name: "DomainError", code: "CONFLICT" });
    expect([await exists(old), await exists(next)]).toEqual([true, true]);
    expect(await queued(old)).toEqual([]);
    expect(await queued(next)).toEqual([]);
  });

  it("reports an unknown artist", async () => {
    expect((await viaFunction("label_member", randomUUID())).error?.code).toBe("P0002");
    await expect(viaService("label_member", randomUUID())).rejects.toMatchObject({
      name: "DomainError",
      code: "NOT_FOUND",
    });
  });

  it.each(["listener", "artist"] as const)("refuses the %s role and leaves the artist", async (role) => {
    const [old, next] = [await seedArtist("artists/kept.jpg"), await seedArtist("artists/kept.jpg")];
    expect((await viaFunction(role, old)).error?.code).toBe("42501");
    await expect(viaService(role, next)).rejects.toMatchObject({ name: "DomainError", code: "FORBIDDEN" });
    expect([await exists(old), await exists(next)]).toEqual([true, true]);
    expect(await queued(next)).toEqual([]);
  });
});
