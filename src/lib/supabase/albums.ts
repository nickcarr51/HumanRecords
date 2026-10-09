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
      "id, title, album_art_url, album_artists ( position, artists ( name ) ), track_albums ( position, tracks ( id, title, track_artists ( position, artists ( name ) ) ) )",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const trackRel = (data.track_albums ?? []) as unknown as Array<{
    position: number;
    tracks: { id: string; title: string; track_artists: ArtistNameRel } | null;
  }>;
  const tracks: FeedTrack[] = byPosition(trackRel)
    .map((r) => r.tracks)
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({ id: t.id, title: t.title, artistNames: namesFrom(t.track_artists) }));

  return {
    id: data.id,
    title: data.title,
    albumArtUrl: data.album_art_url,
    artistNames: namesFrom(data.album_artists as unknown as ArtistNameRel),
    tracks,
  };
}
