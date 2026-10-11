import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { byPosition, namesFrom, type ArtistNameRel } from "./artist-names";

export type FeedTrack = {
  id: string;
  catalogNumber?: number;
  title: string;
  artistNames: string[];
};

export type FeedItem =
  | {
      kind: "album";
      catalogNumber?: number;
      id: string;
      title: string;
      albumArtUrl: string | null;
      artistNames: string[];
      createdAt: string;
      tracks: FeedTrack[];
    }
  | {
      kind: "track";
      catalogNumber?: number;
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
  total: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 20;

// FEED_PAGE_SIZE lets local dev use tiny pages (e.g. 3) to exercise paging
// and auto-advance with a small catalog. Production leaves it unset.
// Input caps: PostgREST rejects an exponent-notation offset (page 1e22), and a
// search string has no business being longer than this.
export const MAX_PAGE = 100_000;
export const MAX_QUERY_LENGTH = 200;

export function feedPageSize(): number {
  const raw = process.env.FEED_PAGE_SIZE;
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PAGE_SIZE;
}

// pinned and sort_at are selected only so PostgREST can order by them: it
// orders an RPC result (search_feed, chained later) only by projected columns.
const RELEASE_SELECT = `
  id, kind, created_at, pinned, sort_at,
  track:tracks ( id, catalog_number, title, track_art_url, archived_at, track_artists ( position, artists ( name ) ) ),
  album:albums (
    id, catalog_number, title, album_art_url,
    album_artists ( position, artists ( name ) ),
    track_albums ( position, tracks ( id, catalog_number, title, archived_at, track_artists ( position, artists ( name ) ) ) )
  )
`;

type TrackRel = { id: string; catalog_number: number; title: string; track_art_url?: string | null; archived_at?: string | null; track_artists: ArtistNameRel };
type ReleaseRow = {
  kind: "single" | "album";
  created_at: string;
  track: TrackRel | null;
  album: {
    id: string;
    catalog_number: number;
    title: string;
    album_art_url: string | null;
    album_artists: ArtistNameRel;
    track_albums: Array<{ position: number; tracks: TrackRel | null }> | null;
  } | null;
};

function toFeedItem(row: ReleaseRow): FeedItem | null {
  if (row.kind === "single" && row.track) {
    if (row.track.archived_at) return null;
    return {
      kind: "track",
      id: row.track.id,
      catalogNumber: row.track.catalog_number,
      title: row.track.title,
      trackArtUrl: row.track.track_art_url ?? null,
      artistNames: namesFrom(row.track.track_artists),
      createdAt: row.created_at,
    };
  }
  if (row.kind === "album" && row.album) {
    const tracks: FeedTrack[] = byPosition(row.album.track_albums ?? [])
      .map((r) => r.tracks)
      .filter((t): t is TrackRel => t !== null && !t.archived_at)
      .map((t) => ({ id: t.id, catalogNumber: t.catalog_number, title: t.title, artistNames: namesFrom(t.track_artists) }));
    if (tracks.length === 0) return null; // never show an empty album
    return {
      kind: "album",
      id: row.album.id,
      catalogNumber: row.album.catalog_number,
      title: row.album.title,
      albumArtUrl: row.album.album_art_url,
      artistNames: namesFrom(row.album.album_artists),
      createdAt: row.created_at,
      tracks,
    };
  }
  return null; // a release whose target was hidden/removed — skip rather than crash
}

// Both sources (the releases table and the search_feed RPC) are PostgREST
// builders over release rows. Typing them as one shape lets a single function
// own the archived filter, the order and the range, so search results and the
// plain feed can never disagree on order.
type FeedQuery = PromiseLike<{ data: unknown; error: PostgrestError | null; count: number | null }> & {
  is(column: "archived_at", value: null): FeedQuery;
  order(column: "pinned" | "sort_at" | "id", opts: { ascending: boolean }): FeedQuery;
  range(from: number, to: number): FeedQuery;
};

function releaseQuery(supabase: SupabaseClient<Database>, q: string, countOnly = false): FeedQuery {
  const columns = countOnly ? "id" : RELEASE_SELECT;
  const opts = countOnly ? ({ count: "exact", head: true } as const) : ({ count: "exact" } as const);
  // search_feed only filters (an empty pattern would match everything, so it
  // is skipped for a blank q); count: 'exact' gives the page count either way.
  const query = q
    ? supabase.rpc("search_feed", { q }, opts).select(columns)
    : supabase.from("releases").select(columns, opts);
  return query as unknown as FeedQuery;
}

export async function getFeed(
  supabase: SupabaseClient<Database>,
  opts: { page?: number; pageSize?: number; q?: string } = {},
): Promise<FeedPage> {
  const rawPage = Math.floor(Number(opts.page ?? 1));
  const page = Number.isFinite(rawPage) && rawPage >= 1 && rawPage <= MAX_PAGE ? rawPage : 1;
  const pageSize = Math.max(1, opts.pageSize ?? feedPageSize());
  const q = typeof opts.q === "string" ? opts.q.trim().slice(0, MAX_QUERY_LENGTH) : "";
  const from = (page - 1) * pageSize;

  const { data, error, count } = await releaseQuery(supabase, q)
    // RLS already hides archived rows from listeners; label members can read
    // them, so the feed filters explicitly.
    .is("archived_at", null)
    .order("pinned", { ascending: false })
    .order("sort_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    if (error.code !== "PGRST103") throw error;
    // Past-the-end page: PostgREST refuses the range. Report the totals (same
    // source and archived filter, count only) so callers can redirect.
    const counted = await releaseQuery(supabase, q, true).is("archived_at", null);
    if (counted.error) throw counted.error;
    const total = counted.count ?? 0;
    return { items: [], page, pageSize, hasMore: false, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  const rows = (data ?? []) as unknown as ReleaseRow[];
  const items = rows.map(toFeedItem).filter((i): i is FeedItem => i !== null);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { items, page, pageSize, hasMore: page < totalPages, total, totalPages };
}

// A release in the feed: an album by its album id, a single by its track id
// (the same ids a FeedItem carries).
export type ReleaseRef = { kind: "album"; albumId: string } | { kind: "single"; trackId: string };

export type FeedAfterRelease = { items: FeedItem[]; page: number; hasMore: boolean };

// The feed page a release is on, or null if it is archived/missing. Counts the
// live releases ordered ahead of it using the feed's own order: pinned desc,
// sort_at desc, id desc.
export async function getReleaseFeedPage(
  supabase: SupabaseClient<Database>,
  ref: ReleaseRef,
  pageSize: number = feedPageSize(),
): Promise<number | null> {
  const lookup = supabase.from("releases").select("id, pinned, sort_at");
  const { data: rel, error } = await (ref.kind === "album"
    ? lookup.eq("album_id", ref.albumId)
    : lookup.eq("track_id", ref.trackId)
  )
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!rel) return null;

  // Timestamps contain ':' and '+', which PostgREST's or() syntax reserves, so quote them.
  const s = `"${rel.sort_at}"`;
  const ahead = rel.pinned
    ? `and(pinned.eq.true,sort_at.gt.${s}),and(pinned.eq.true,sort_at.eq.${s},id.gt.${rel.id})`
    : `pinned.eq.true,sort_at.gt.${s},and(sort_at.eq.${s},id.gt.${rel.id})`;

  const { count, error: countError } = await supabase
    .from("releases")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null)
    .or(ahead);
  if (countError) throw countError;

  return Math.floor((count ?? 0) / Math.max(1, pageSize)) + 1;
}

// What plays after a release when its queue runs out (an album-page queue, or a
// search queue's last release): the rest of the release's main-feed page, or
// the next page when the release was the last item on its page.
export async function getFeedAfterRelease(
  supabase: SupabaseClient<Database>,
  ref: ReleaseRef,
  pageSize: number = feedPageSize(),
): Promise<FeedAfterRelease | null> {
  const page = await getReleaseFeedPage(supabase, ref, pageSize);
  if (page === null) return null;

  const current = await getFeed(supabase, { page, pageSize });
  const idx = current.items.findIndex((i) =>
    ref.kind === "album" ? i.kind === "album" && i.id === ref.albumId : i.kind !== "album" && i.id === ref.trackId,
  );
  if (idx === -1) return null;

  const rest = current.items.slice(idx + 1);
  if (rest.length > 0 || !current.hasMore) return { items: rest, page, hasMore: current.hasMore };

  const following = await getFeed(supabase, { page: page + 1, pageSize });
  return { items: following.items, page: page + 1, hasMore: following.hasMore };
}
