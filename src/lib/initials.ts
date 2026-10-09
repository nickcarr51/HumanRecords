/**
 * First letters of the first two words of a name, uppercased. Used for the
 * placeholder tile shown when an artist has no profile photo.
 *
 * Lives in its own server-safe module (no "use client") so it can be called
 * from Server Components (e.g. the artist detail page) as well as from the
 * client ArtistCard — a client-module export cannot be invoked on the server.
 */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}
