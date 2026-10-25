import type { SupabaseClient } from "@supabase/supabase-js";
import { and, count, desc, isNull } from "drizzle-orm";
import { releases } from "@/lib/db/generated/schema";
import { pgrstTs } from "@/lib/db/timestamps";
import { asUser } from "@/lib/db/user";
import { getClaims } from "@/lib/services/viewer";
import type { Database } from "./database.types";
import { artistNamesOf, byPosition, type ArtistLink } from "./artist-names";
import { ARTIST_NAMES, TRACK_WITH, toFeedTrack, type DbTrack } from "./catalog-selects";
import { searchMatches } from "./feed-search";

export type FeedTrack = {
  id: string;
  catalogNumber: number;
  title: string;
  artistNames: string[];
};

export type FeedItem =
  | {
      kind: "album";
      catalogNumber: number;
      id: string;
      title: string;
      albumArtUrl: string | null;
      artistNames: string[];
      createdAt: string;
      tracks: FeedTrack[];
    }
  | {
      kind: "track";
      catalogNumber: number;
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

// The nested data each feed row needs (same fields as the old RELEASE_SELECT).
const RELEASE_WITH = {
  track: TRACK_WITH,
  album: {
    columns: { id: true, catalogNumber: true, title: true, albumArtUrl: true },
    with: {
      albumArtists: ARTIST_NAMES,
      trackAlbums: { columns: { position: true }, with: { track: TRACK_WITH } },
    },
  },
} as const;

// What one RELEASE_WITH row returns (createdAt comes from pgrstTs, so it is
// PostgREST's exact string).
type DbRelease = {
  kind: "single" | "album";
  createdAt: string | null;
  track: DbTrack | null;
  album: {
    id: string;
    catalogNumber: number;
    title: string;
    albumArtUrl: string | null;
    albumArtists: ArtistLink[];
    trackAlbums: Array<{ position: number; track: DbTrack | null }>;
  } | null;
};

function toFeedItem(row: DbRelease): FeedItem | null {
  if (row.kind === "single" && row.track) {
    if (row.track.archivedAt) return null;
    return {
      kind: "track",
      id: row.track.id,
      catalogNumber: row.track.catalogNumber,
      title: row.track.title,
      trackArtUrl: row.track.trackArtUrl,
      artistNames: artistNamesOf(row.track.trackArtists),
      createdAt: row.createdAt as string,
    };
  }
  if (row.kind === "album" && row.album) {
    const tracks = byPosition(row.album.trackAlbums)
      .map((r) => r.track)
      .filter((t): t is DbTrack => t !== null && !t.archivedAt)
      .map(toFeedTrack);
    if (tracks.length === 0) return null; // never show an empty album
    return {
      kind: "album",
      id: row.album.id,
      catalogNumber: row.album.catalogNumber,
      title: row.album.title,
      albumArtUrl: row.album.albumArtUrl,
      artistNames: artistNamesOf(row.album.albumArtists),
      createdAt: row.createdAt as string,
      tracks,
    };
  }
  return null; // a release whose target was hidden/removed: skip rather than crash
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

  const claims = await getClaims(supabase);
  return asUser(claims, async (tx) => {
    // RLS already hides archived rows from listeners; label members can read
    // them, so the feed filters explicitly. A blank q means no search filter.
    const where = and(isNull(releases.archivedAt), q ? searchMatches(tx, q) : undefined);

    // One ordering definition for search and the plain feed:
    // pinned first, then newest sort_at, id as the tiebreak.
    // The rows and the count are pipelined on the same transaction.
    const [rows, [{ total }]] = await Promise.all([
      tx.query.releases.findMany({
        columns: { kind: true },
        extras: { createdAt: pgrstTs(releases.createdAt).as("created_at") },
        where,
        orderBy: [desc(releases.pinned), desc(releases.sortAt), desc(releases.id)],
        limit: pageSize,
        offset: from,
        with: RELEASE_WITH,
      }),
      tx.select({ total: count() }).from(releases).where(where),
    ]);

    const items = rows.map(toFeedItem).filter((i): i is FeedItem => i !== null);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    // A page past the end simply comes back empty with the real totals, which
    // is what the old PGRST103 branch reconstructed.
    return { items, page, pageSize, hasMore: page < totalPages, total, totalPages };
  });
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
