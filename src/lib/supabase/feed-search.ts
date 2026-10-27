import { and, eq, exists, ilike, isNull, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { albumArtists, albums, artists, releases, trackAlbums, trackArtists, tracks } from "@/lib/db/generated/schema";
import { escapeLike } from "./artists";

const one = (tx: Tx) => tx.select({ one: sql`1` });

function creditedArtistMatches(tx: Tx, trackId: AnyColumn, p: string) {
  return exists(
    one(tx)
      .from(trackArtists)
      .innerJoin(artists, eq(artists.id, trackArtists.artistId))
      .where(and(eq(trackArtists.trackId, trackId), ilike(artists.name, p))),
  );
}

// Case-insensitive substring match on track titles, album titles and credited
// artist names. An album also matches through any of its live tracks; archived
// tracks never match. %, _ and \ in q are literal (escapeLike).
export function searchMatches(tx: Tx, q: string): SQL {
  const p = `%${escapeLike(q)}%`;
  const liveTrackMatches = and(isNull(tracks.archivedAt), or(ilike(tracks.title, p), creditedArtistMatches(tx, tracks.id, p)));

  const single = and(
    eq(releases.kind, "single"),
    exists(one(tx).from(tracks).where(and(eq(tracks.id, releases.trackId), liveTrackMatches))),
  );

  const album = and(
    eq(releases.kind, "album"),
    exists(
      one(tx)
        .from(albums)
        .where(
          and(
            eq(albums.id, releases.albumId),
            or(
              ilike(albums.title, p),
              exists(
                one(tx)
                  .from(albumArtists)
                  .innerJoin(artists, eq(artists.id, albumArtists.artistId))
                  .where(and(eq(albumArtists.albumId, albums.id), ilike(artists.name, p))),
              ),
              exists(
                one(tx)
                  .from(trackAlbums)
                  .innerJoin(tracks, eq(tracks.id, trackAlbums.trackId))
                  .where(and(eq(trackAlbums.albumId, albums.id), liveTrackMatches)),
              ),
            ),
          ),
        ),
    ),
  );

  return or(single, album)!;
}
