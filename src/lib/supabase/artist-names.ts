// Shared shape + flattener for PostgREST `... ( position, artists ( name ) )`
// embeds. The generated types type these embeds loosely, so the shape here
// mirrors the exact `select()` string in storage/actions.ts and is bridged
// with `as unknown` at the call site.
export type ArtistNameRel = Array<{
  position?: number | null;
  artists: { name: string } | null;
}> | null;

// PostgREST can't order nested embeds by a column of the link table without
// per-embed modifiers, so link rows carry `position` and are ordered here.
export function byPosition<T extends { position?: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export function namesFrom(rel: ArtistNameRel): string[] {
  const names = byPosition(rel ?? [])
    .map((r) => r.artists?.name)
    .filter((n): n is string => Boolean(n));
  return Array.from(new Set(names));
}

// Drizzle relational rows: `{ position, artist: { name } }` (singular
// `artist`, unlike PostgREST's `artists` embed). Same rules as namesFrom:
// position order, missing artists dropped, duplicates removed.
export type ArtistLink = { position?: number | null; artist: { name: string } | null };

export function artistNamesOf(links: ArtistLink[]): string[] {
  const names = byPosition(links)
    .map((l) => l.artist?.name)
    .filter((n): n is string => Boolean(n));
  return Array.from(new Set(names));
}

export const VARIOUS_ARTISTS = "Various Artists";

// Display-only fallback: an album with no album_artists rows reads as a
// compilation. Nothing is stored for it.
export function albumArtistLabel(names: string[]): string {
  return names.length ? names.join(", ") : VARIOUS_ARTISTS;
}
