// Client-safe types + helpers for the /admin/artists pages.

export type LinkedUser = { id: string; name: string | null; email: string };
export type AdminArtistRow = {
  id: string;
  name: string;
  createdAt: string;
  trackCount: number;
  albumCount: number;
  linkedUser: LinkedUser | null;
};
export type AdminArtistDetail = AdminArtistRow & { bio: string | null };
export type AdminArtistsPage = { artists: AdminArtistRow[]; total: number; page: number; pageSize: number };
export type LinkableUser = LinkedUser & { linkedArtist: { id: string; name: string } | null };
export type LinkableUsersResult = { users: LinkableUser[]; error: string | null };
export type ArtistInput = { name: string; bio: string; userId: string | null };
export type ArtistActionResult = { error: string | null };

export const ADMIN_ARTISTS_PAGE_SIZE = 20;
export const MAX_ARTIST_NAME_LENGTH = 100;
export const MAX_BIO_LENGTH = 2000;
export const LINKABLE_USERS_LIMIT = 8;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function creditMessage(tracks: number, albums: number): string {
  return `This artist is credited on ${plural(tracks, "track")} / ${plural(albums, "album")}. Remove those credits first.`;
}

export function userLabel(u: LinkedUser): string {
  return u.name ? `${u.name} (${u.email})` : u.email;
}
