import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { byPosition, namesFrom, type ArtistNameRel } from "./artist-names";

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

const RELEASE_SELECT = `
  id, kind, created_at,
  track:tracks ( id, title, track_art_url, track_artists ( position, artists ( name ) ) ),
  album:albums (
    id, title, album_art_url,
    album_artists ( position, artists ( name ) ),
    track_albums ( position, tracks ( id, title, track_artists ( position, artists ( name ) ) ) )
  )
`;

type TrackRel = { id: string; title: string; track_art_url?: string | null; track_artists: ArtistNameRel };
type ReleaseRow = {
  kind: "single" | "album";
  created_at: string;
  track: TrackRel | null;
  album: {
    id: string;
    title: string;
    album_art_url: string | null;
    album_artists: ArtistNameRel;
    track_albums: Array<{ position: number; tracks: TrackRel | null }> | null;
  } | null;
};

function toFeedItem(row: ReleaseRow): FeedItem | null {
  if (row.kind === "single" && row.track) {
    return {
      kind: "track",
      id: row.track.id,
      title: row.track.title,
      trackArtUrl: row.track.track_art_url ?? null,
      artistNames: namesFrom(row.track.track_artists),
      createdAt: row.created_at,
    };
  }
  if (row.kind === "album" && row.album) {
    const tracks: FeedTrack[] = byPosition(row.album.track_albums ?? [])
      .map((r) => r.tracks)
      .filter((t): t is TrackRel => t !== null)
      .map((t) => ({ id: t.id, title: t.title, artistNames: namesFrom(t.track_artists) }));
    return {
      kind: "album",
      id: row.album.id,
      title: row.album.title,
      albumArtUrl: row.album.album_art_url,
      artistNames: namesFrom(row.album.album_artists),
      createdAt: row.created_at,
      tracks,
    };
  }
  return null; // a release whose target was hidden/removed — skip rather than crash
}

export async function getFeed(
  supabase: SupabaseClient<Database>,
  opts: { page?: number; pageSize?: number } = {},
): Promise<FeedPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE);
  const from = (page - 1) * pageSize;

  // One extra row past the page tells us whether another page exists.
  const { data, error } = await supabase
    .from("releases")
    .select(RELEASE_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize);
  if (error) throw error;

  const rows = (data ?? []) as unknown as ReleaseRow[];
  const items = rows
    .slice(0, pageSize)
    .map(toFeedItem)
    .filter((i): i is FeedItem => i !== null);

  return { items, page, pageSize, hasMore: rows.length > pageSize };
}
