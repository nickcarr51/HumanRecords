import type { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { albums } from "@/lib/db/generated/schema";
import type { Tx } from "@/lib/db/client";
import { asUser } from "@/lib/db/user";
import { getClaims } from "@/lib/services/viewer";
import type { Database } from "./database.types";
import { artistNamesOf, byPosition } from "./artist-names";
import { ALBUM_TRACK_WITH, ARTIST_NAMES, toFeedTrack } from "./catalog-selects";
import type { FeedTrack } from "./feed";

export type AlbumDetail = {
  id: string;
  catalogNumber: number;
  title: string;
  albumArtUrl: string | null;
  artistNames: string[];
  tracks: FeedTrack[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The album page's query. Album tracks use ALBUM_TRACK_WITH, which leaves out
// trackArtUrl. Exported so a test can check the query getAlbum really sends.
export function findAlbum(tx: Pick<Tx, "query">, id: string) {
  return tx.query.albums.findFirst({
    columns: { id: true, catalogNumber: true, title: true, albumArtUrl: true },
    where: eq(albums.id, id),
    with: {
      releases: { columns: { archivedAt: true } },
      albumArtists: ARTIST_NAMES,
      trackAlbums: { columns: { position: true }, with: { track: ALBUM_TRACK_WITH } },
    },
  });
}

export async function getAlbum(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<AlbumDetail | null> {
  // A non-UUID id would make Postgres raise "invalid input syntax for type
  // uuid"; treat a malformed id as simply not found.
  if (!UUID_RE.test(id)) return null;

  const claims = await getClaims(supabase);
  const data = await asUser(claims, (tx) => findAlbum(tx, id));
  if (!data) return null;

  // An archived album is gone for everyone, label members included (they
  // manage it from the admin pages). RLS hides an archived release from
  // listeners, so it comes back empty for them; every album has a release.
  if (data.releases.length === 0 || data.releases.some((r) => r.archivedAt)) return null;

  const tracks: FeedTrack[] = byPosition(data.trackAlbums)
    .map((r) => r.track)
    .filter((t): t is NonNullable<typeof t> => t !== null && !t.archivedAt)
    .map(toFeedTrack);

  return {
    id: data.id,
    catalogNumber: data.catalogNumber,
    title: data.title,
    albumArtUrl: data.albumArtUrl,
    artistNames: artistNamesOf(data.albumArtists),
    tracks,
  };
}
