import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type FeedTrack = {
  id: string;
  title: string;
  artistNames: string[];
};

export type FeedItem =
  | {
      kind: "album";
      id: string;
      title: string;
      albumArtUrl: string | null;
      artistNames: string[];
      createdAt: string;
      tracks: FeedTrack[];
    }
  | {
      kind: "track";
      id: string;
      title: string;
      trackArtUrl: string | null;
      artistNames: string[];
      createdAt: string;
    };

export type FeedPage = {
  items: FeedItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

const DEFAULT_PAGE_SIZE = 20;

// PostgREST embeds are typed loosely by the generated types; these shapes
// mirror the exact `select()` strings below and are bridged with `as unknown`.
type ArtistNameRel = Array<{ artists: { name: string } | null }> | null;

function namesFrom(rel: ArtistNameRel): string[] {
  const names = (rel ?? [])
    .map((r) => r.artists?.name)
    .filter((n): n is string => Boolean(n));
  return Array.from(new Set(names));
}

export async function getFeed(
  supabase: SupabaseClient<Database>,
  opts: { page?: number; pageSize?: number } = {},
): Promise<FeedPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE);
  const end = page * pageSize;
  // Over-fetch enough from each source to fill the page window and detect a
  // remainder after the in-memory merge. Fine for the MVP's small catalog;
  // the spec notes a `feed_items` SQL view as the upgrade at real volume.
  const limit = end + 1;

  const [albumsRes, tracksRes] = await Promise.all([
    supabase
      .from("albums")
      .select(
        "id, title, album_art_url, created_at, album_artists ( artists ( name ) ), track_albums ( tracks ( id, title, track_artists ( artists ( name ) ) ) )",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("tracks")
      .select(
        "id, title, track_art_url, created_at, track_albums ( album_id ), track_artists ( artists ( name ) )",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (albumsRes.error) throw albumsRes.error;
  if (tracksRes.error) throw tracksRes.error;

  const albumItems: FeedItem[] = (albumsRes.data ?? []).map((row) => {
    const trackRel = row.track_albums as unknown as Array<{
      tracks: { id: string; title: string; track_artists: ArtistNameRel } | null;
    }> | null;
    const tracks: FeedTrack[] = (trackRel ?? [])
      .map((r) => r.tracks)
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .map((t) => ({ id: t.id, title: t.title, artistNames: namesFrom(t.track_artists) }));
    return {
      kind: "album",
      id: row.id,
      title: row.title,
      albumArtUrl: row.album_art_url,
      artistNames: namesFrom(row.album_artists as unknown as ArtistNameRel),
      createdAt: row.created_at,
      tracks,
    };
  });

  const trackItems: FeedItem[] = (tracksRes.data ?? [])
    .filter((row) => {
      const albums = row.track_albums as unknown as Array<{ album_id: string }> | null;
      return (albums?.length ?? 0) === 0; // standalone only
    })
    .map((row) => ({
      kind: "track",
      id: row.id,
      title: row.title,
      trackArtUrl: row.track_art_url,
      artistNames: namesFrom(row.track_artists as unknown as ArtistNameRel),
      createdAt: row.created_at,
    }));

  const merged = [...albumItems, ...trackItems].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  const start = (page - 1) * pageSize;
  const items = merged.slice(start, end);
  const hasMore = merged.length > end;

  return { items, page, pageSize, hasMore };
}
