import { artistNamesOf, type ArtistLink } from "./artist-names";
import type { FeedTrack } from "./feed";

// Drizzle relational-query shapes shared by getAlbum and getFeed.
export const ARTIST_NAMES = {
  columns: { position: true },
  with: { artist: { columns: { name: true } } },
} as const;

export const TRACK_WITH = {
  columns: { id: true, catalogNumber: true, title: true, trackArtUrl: true, archivedAt: true },
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

export function toFeedTrack(t: DbTrack): FeedTrack {
  return { id: t.id, catalogNumber: t.catalogNumber, title: t.title, artistNames: artistNamesOf(t.trackArtists) };
}
