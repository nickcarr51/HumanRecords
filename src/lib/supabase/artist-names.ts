// Shared shape + flattener for PostgREST `... artists ( name )` embeds.
// The generated types type these embeds loosely, so the shape here mirrors the
// exact `select()` strings in feed.ts / albums.ts and is bridged with
// `as unknown` at the call sites.
export type ArtistNameRel = Array<{ artists: { name: string } | null }> | null;

export function namesFrom(rel: ArtistNameRel): string[] {
  const names = (rel ?? [])
    .map((r) => r.artists?.name)
    .filter((n): n is string => Boolean(n));
  return Array.from(new Set(names));
}
