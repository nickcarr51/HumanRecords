import { relations } from "drizzle-orm/relations";
import { albumArtists, albums, artists, releases, trackAlbums, trackArtists, tracks } from "./generated/schema";

// Hand-written: the pulled relations.ts doesn't compile (it references an
// auth.users table the public-only pull never generates). These match the
// catalog foreign keys exactly; the names are the ones drizzle-kit generates.
export const artistsRelations = relations(artists, ({ many }) => ({
  trackArtists: many(trackArtists),
  albumArtists: many(albumArtists),
}));

export const releasesRelations = relations(releases, ({ one }) => ({
  track: one(tracks, { fields: [releases.trackId], references: [tracks.id] }),
  album: one(albums, { fields: [releases.albumId], references: [albums.id] }),
}));

export const tracksRelations = relations(tracks, ({ many }) => ({
  releases: many(releases),
  trackAlbums: many(trackAlbums),
  trackArtists: many(trackArtists),
}));

export const albumsRelations = relations(albums, ({ many }) => ({
  releases: many(releases),
  trackAlbums: many(trackAlbums),
  albumArtists: many(albumArtists),
}));

export const trackAlbumsRelations = relations(trackAlbums, ({ one }) => ({
  track: one(tracks, { fields: [trackAlbums.trackId], references: [tracks.id] }),
  album: one(albums, { fields: [trackAlbums.albumId], references: [albums.id] }),
}));

export const trackArtistsRelations = relations(trackArtists, ({ one }) => ({
  track: one(tracks, { fields: [trackArtists.trackId], references: [tracks.id] }),
  artist: one(artists, { fields: [trackArtists.artistId], references: [artists.id] }),
}));

export const albumArtistsRelations = relations(albumArtists, ({ one }) => ({
  album: one(albums, { fields: [albumArtists.albumId], references: [albums.id] }),
  artist: one(artists, { fields: [albumArtists.artistId], references: [artists.id] }),
}));
