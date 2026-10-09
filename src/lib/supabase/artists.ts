import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type ArtistListItem = {
  id: string;
  name: string;
  photoUrl: string | null;
  trackCount: number;
};

export type ArtistsPage = {
  artists: ArtistListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ArtistTrack = {
  id: string;
  title: string;
  trackArtUrl: string | null;
  albumTitle: string | null;
};

export type ArtistDetail = {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  tracks: ArtistTrack[];
};

const DEFAULT_PAGE_SIZE = 12;

// Cap the free-text search so a member can't force arbitrarily large scans.
const MAX_QUERY_LENGTH = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Escape LIKE/ILIKE metacharacters so user input is matched literally — a bare
// `%` or `_` would otherwise act as a wildcard (backslash is Postgres' default
// LIKE escape character).
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function getArtists(
  supabase: SupabaseClient<Database>,
  opts: { query?: string; page?: number; pageSize?: number } = {},
): Promise<ArtistsPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE);
  const query = (opts.query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let builder = supabase
    .from("artists")
    .select("id, name, profile_photo_url, track_artists(count)", { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);

  if (query) builder = builder.ilike("name", `%${escapeLike(query)}%`);

  const { data, error, count } = await builder;
  if (error) throw error;

  const artists: ArtistListItem[] = (data ?? []).map((row) => {
    const rel = row.track_artists as unknown as Array<{ count: number }> | null;
    return {
      id: row.id,
      name: row.name,
      photoUrl: row.profile_photo_url,
      trackCount: rel?.[0]?.count ?? 0,
    };
  });

  return { artists, total: count ?? 0, page, pageSize };
}

export async function getArtist(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ArtistDetail | null> {
  // A non-UUID id would make Postgres raise "invalid input syntax for type
  // uuid" and surface as a 500; treat a malformed id as simply not found.
  if (!UUID_RE.test(id)) return null;

  const { data: artist, error } = await supabase
    .from("artists")
    .select("id, name, bio, profile_photo_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!artist) return null;

  const { data: rows, error: tracksError } = await supabase
    .from("track_artists")
    .select("track:tracks(id, title, track_art_url, track_albums(albums(title)))")
    .eq("artist_id", id);
  if (tracksError) throw tracksError;

  const tracks: ArtistTrack[] = (rows ?? [])
    .map((r) => {
      const track = r.track as unknown as {
        id: string;
        title: string;
        track_art_url: string | null;
        track_albums: Array<{ albums: { title: string } | null }> | null;
      } | null;
      if (!track) return null;
      return {
        id: track.id,
        title: track.title,
        trackArtUrl: track.track_art_url,
        albumTitle: track.track_albums?.[0]?.albums?.title ?? null,
      };
    })
    .filter((t): t is ArtistTrack => t !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    id: artist.id,
    name: artist.name,
    bio: artist.bio,
    photoUrl: artist.profile_photo_url,
    tracks,
  };
}
