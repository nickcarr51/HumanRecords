import { artistNamesOf, type ArtistLink } from "./artist-names";
import type { FeedTrack } from "./feed";

// The nested rows getAlbum and getFeed ask Drizzle for (the `columns` and
// `with` options of findFirst/findMany). ARTIST_NAMES is shared by both;
// TRACK_WITH is the feed's and ALBUM_TRACK_WITH the album page's.
export const ARTIST_NAMES = {
  columns: { position: true },
  with: { artist: { columns: { name: true } } },
} as const;

export const TRACK_WITH = {
  columns: { id: true, catalogNumber: true, title: true, trackArtUrl: true, archivedAt: true },
  with: { trackArtists: ARTIST_NAMES },
} as const;

// An album's tracks on the album page: TRACK_WITH without trackArtUrl, which
// that page doesn't show (the same columns the album query read before Drizzle).
export const ALBUM_TRACK_WITH = {
  columns: { id: true, catalogNumber: true, title: true, archivedAt: true },
  with: { trackArtists: ARTIST_NAMES },
} as const;

// What a TRACK_WITH select returns.
export type DbTrack = {
  id: string;
  catalogNumber: number;
  title: string;
  trackArtUrl: string | null;
  archivedAt: string | null;
  trackArtists: ArtistLink[];
};

export function toFeedTrack(t: Omit<DbTrack, "trackArtUrl">): FeedTrack {
  return { id: t.id, catalogNumber: t.catalogNumber, title: t.title, artistNames: artistNamesOf(t.trackArtists) };
}
