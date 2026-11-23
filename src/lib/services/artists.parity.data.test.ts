// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { removeArtist } from "./artists";
import { getViewer } from "./viewer";

// removeArtist, checked the way it was checked next to the admin_delete_artist
// SQL function it replaced (dropped in slice 4).
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
  const credit = await admin.from("track_artists").insert({ track_id: data.id, artist_id: artistId, position: 1 });
  if (credit.error) throw credit.error;
}

async function creditOnAlbum(artistId: string) {
  const { data, error } = await admin.from("albums").insert({ title: "RMA album" }).select("id").single();
  if (error) throw error;
  albumIds.push(data.id);
  const credit = await admin.from("album_artists").insert({ album_id: data.id, artist_id: artistId, position: 1 });
  if (credit.error) throw credit.error;
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

const viaService = async (role: keyof typeof clients, id: string) =>
  removeArtist(await getViewer(clients[role]), id);

describe("removeArtist (was admin_delete_artist)", () => {
  it("deletes an artist with a photo and queues the cleanup row", async () => {
    const next = await seedArtist("artists/rma.jpg");
    await viaService("label_member", next);
    expect(await exists(next)).toBe(false);
    const row = { object_key: "artists/rma.jpg", reason: "archived", source_table: "artists", cleaned_at: null };
    expect(await queued(next)).toEqual([row]);
  });

  it("deletes an artist without a photo and queues nothing", async () => {
    const next = await seedArtist();
    await viaService("label_member", next);
    expect(await exists(next)).toBe(false);
    expect(await queued(next)).toEqual([]);
  });

  it.each([
    ["a track", creditOnTrack],
    ["an album", creditOnAlbum],
  ])("refuses an artist credited on %s, changes nothing and queues nothing", async (_what, credit) => {
    const next = await seedArtist("artists/kept.jpg");
    await credit(next);
    await expect(viaService("label_member", next)).rejects.toMatchObject({ name: "DomainError", code: "CONFLICT" });
    expect(await exists(next)).toBe(true);
    expect(await queued(next)).toEqual([]);
  });

  it("reports an unknown artist", async () => {
    await expect(viaService("label_member", randomUUID())).rejects.toMatchObject({
      name: "DomainError",
      code: "NOT_FOUND",
    });
  });

  it.each(["listener", "artist"] as const)("refuses the %s role and leaves the artist", async (role) => {
    const next = await seedArtist("artists/kept.jpg");
    await expect(viaService(role, next)).rejects.toMatchObject({ name: "DomainError", code: "FORBIDDEN" });
    expect(await exists(next)).toBe(true);
    expect(await queued(next)).toEqual([]);
  });
});
