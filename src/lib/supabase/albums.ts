import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { FeedTrack } from "./feed";

export type AlbumDetail = {
  id: string;
  title: string;
  albumArtUrl: string | null;
  artistNames: string[];
  tracks: FeedTrack[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ArtistNameRel = Array<{ artists: { name: string } | null }> | null;

function namesFrom(rel: ArtistNameRel): string[] {
  const names = (rel ?? [])
    .map((r) => r.artists?.name)
    .filter((n): n is string => Boolean(n));
  return Array.from(new Set(names));
}

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
      "id, title, album_art_url, album_artists ( artists ( name ) ), track_albums ( tracks ( id, title, track_artists ( artists ( name ) ) ) )",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const trackRel = data.track_albums as unknown as Array<{
    tracks: { id: string; title: string; track_artists: ArtistNameRel } | null;
  }> | null;
  const tracks: FeedTrack[] = (trackRel ?? [])
    .map((r) => r.tracks)
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({ id: t.id, title: t.title, artistNames: namesFrom(t.track_artists) }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    id: data.id,
    title: data.title,
    albumArtUrl: data.album_art_url,
    artistNames: namesFrom(data.album_artists as unknown as ArtistNameRel),
    tracks,
  };
}
