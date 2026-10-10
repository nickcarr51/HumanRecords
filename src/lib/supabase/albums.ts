import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { FeedTrack } from "./feed";
import { byPosition, namesFrom, type ArtistNameRel } from "./artist-names";

export type AlbumDetail = {
  id: string;
  title: string;
  albumArtUrl: string | null;
  artistNames: string[];
  tracks: FeedTrack[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAlbum(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<AlbumDetail | null> {
  // A non-UUID id would make Postgres raise "invalid input syntax for type
  // uuid" and surface as a 500; treat a malformed id as simply not found.
  if (!UUID_RE.test(id)) return null;

  const { data, error } = await supabase
    .from("albums")
    .select(
      "id, title, album_art_url, releases ( archived_at ), album_artists ( position, artists ( name ) ), track_albums ( position, tracks ( id, title, archived_at, track_artists ( position, artists ( name ) ) ) )",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // An archived album is gone for everyone, label members included (they
  // manage it from the admin pages, not the listener view). The embed is
  // one-to-one (releases.album_id is unique) but tolerate an array too.
  const rel = (data as unknown as { releases: { archived_at: string | null } | Array<{ archived_at: string | null }> | null }).releases;
  const relRows = Array.isArray(rel) ? rel : rel ? [rel] : [];
  if (relRows.some((r) => r.archived_at)) return null;

  const trackRel = (data.track_albums ?? []) as unknown as Array<{
    position: number;
    tracks: { id: string; title: string; archived_at: string | null; track_artists: ArtistNameRel } | null;
  }>;
  const tracks: FeedTrack[] = byPosition(trackRel)
    .map((r) => r.tracks)
    .filter((t): t is NonNullable<typeof t> => t !== null && !t.archived_at)
    .map((t) => ({ id: t.id, title: t.title, artistNames: namesFrom(t.track_artists) }));

  return {
    id: data.id,
    title: data.title,
    albumArtUrl: data.album_art_url,
    artistNames: namesFrom(data.album_artists as unknown as ArtistNameRel),
    tracks,
  };
}
