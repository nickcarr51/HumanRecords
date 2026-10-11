// src/lib/supabase/release-admin-fixtures.ts
// Shared fixtures for the release-admin data tests. Everything a test creates
// carries `tag` in a title, name, or object key so cleanup(tag) can find it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "./test-helpers";

export const admin = createAdminClient();
const userCleanups: Array<() => Promise<void>> = [];

export function newTag(prefix: string): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1e6)}x`;
}

export async function signedIn(role: "label_member" | "listener" = "label_member"): Promise<SupabaseClient> {
  const user = await createTestUser({ role });
  userCleanups.push(user.cleanup);
  return user.signIn();
}

export async function makeArtist(name: string): Promise<string> {
  const { data, error } = await admin.from("artists").insert({ name }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function makeTrack(tag: string, n: number, art = false): Promise<string> {
  const { data, error } = await admin
    .from("tracks")
    .insert({
      title: `${tag}-T${n}`,
      audio_url: `tracks/${tag}-${n}.mp3`,
      track_art_url: art ? `art/${tag}-${n}.jpg` : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const artistId = await makeArtist(`${tag}-A${n}`);
  const { error: credit } = await admin
    .from("track_artists")
    .insert({ track_id: data.id, artist_id: artistId, position: 1 });
  if (credit) throw credit;
  return data.id as string;
}

export async function makeSingle(tag: string, opts: { art?: boolean } = {}) {
  const trackId = await makeTrack(tag, 1, opts.art);
  const { data, error } = await admin
    .from("releases")
    .insert({ kind: "single", track_id: trackId })
    .select("id")
    .single();
  if (error) throw error;
  return { releaseId: data.id as string, trackId };
}

export async function makeAlbum(tag: string, n: number, opts: { albumArt?: boolean } = {}) {
  const { data: album, error } = await admin
    .from("albums")
    .insert({ title: `${tag}-Album`, album_art_url: opts.albumArt ? `art/${tag}-album.jpg` : null })
    .select("id")
    .single();
  if (error) throw error;
  const trackIds: string[] = [];
  for (let i = 1; i <= n; i++) {
    const id = await makeTrack(tag, i);
    const { error: link } = await admin
      .from("track_albums")
      .insert({ track_id: id, album_id: album.id, position: i });
    if (link) throw link;
    trackIds.push(id);
  }
  const { data: rel, error: relErr } = await admin
    .from("releases")
    .insert({ kind: "album", album_id: album.id })
    .select("id")
    .single();
  if (relErr) throw relErr;
  return { releaseId: rel.id as string, albumId: album.id as string, trackIds };
}

export async function queueRows(tag: string) {
  const { data, error } = await admin
    .from("r2_cleanup_queue")
    .select("object_key, reason, source_table, source_id, cleaned_at")
    .like("object_key", `%${tag}%`)
    .order("object_key")
    .order("reason");
  if (error) throw error;
  return data ?? [];
}

export async function archivedAt(table: "releases" | "tracks", ids: string[]) {
  const { data, error } = await admin.from(table).select("id, archived_at").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.id as string, r.archived_at as string | null]));
}

export async function positions(albumId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("track_albums")
    .select("track_id, position")
    .eq("album_id", albumId)
    .order("position");
  if (error) throw error;
  return (data ?? []).map((r) => r.track_id as string);
}

export async function cleanup(tag: string): Promise<void> {
  if (tag) {
    // Deleting tracks/albums cascades to releases and link rows.
    await admin.from("tracks").delete().like("title", `${tag}%`);
    await admin.from("albums").delete().like("title", `${tag}%`);
    await admin.from("artists").delete().ilike("name", `${tag}%`);
    await admin.from("r2_cleanup_queue").delete().like("object_key", `%${tag}%`);
  }
  for (const c of userCleanups.splice(0)) await c();
}
