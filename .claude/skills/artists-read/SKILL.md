---
name: artists-read
description: Use when working on the artist browse/search/detail pages (`/artists`, `/artists/[id]`), their data functions (`getArtists`, `getArtist`, `escapeLike` in `src/lib/supabase/artists.ts`), `SearchInput`, `Pagination`, `ArtistCard`, or `initials` — or when reviving the retired `/artists` route, adding artist pages back to the nav, or reusing artist search elsewhere.
---

# Artists Read Slice (present but retired)

A browse + search + detail slice for artists: a paginated, searchable list at `/artists` and
an artist page at `/artists/[id]` showing bio and credited tracks. Built 2026-09-17 (PR #6).
**Retired from the listener MVP**: the code, tests, and data layer are intact, but signed-in
users who visit `/artists` or `/artists/*` are redirected to `/feed` and there is no nav link.

## The one thing to understand first

**The route is dark only because of one rule in `authRedirectPath`.** Middleware sends
signed-in users on `/artists*` to `/feed` (`src/lib/auth/route-guard.ts`). Nothing else
disables it — the pages still compile, build, and pass tests. Reviving it means removing that
rule (and its test), adding a nav link in `AppShell`, and fixing the gaps listed below. Parts
of the slice are live elsewhere: `escapeLike` is used by the admin artist search, and
`initials` / `ArtistCard` are shared.

## Pieces

| Concern | Where |
|---|---|
| Data: list (search + paging + track counts), detail | `src/lib/supabase/artists.ts` (`getArtists`, `getArtist`) |
| LIKE-escaping (also used by `searchArtists` in admin) | `src/lib/supabase/artists.ts` (`escapeLike`) |
| Browse page (server) | `src/app/(app)/artists/page.tsx` + `artists.styles.ts` |
| Debounced URL search box | `src/app/(app)/artists/SearchInput.tsx` |
| Prev/next pager + `pageHref` | `src/app/(app)/artists/Pagination.tsx` |
| Detail page (server) | `src/app/(app)/artists/[id]/page.tsx` + `artist-detail.styles.ts` |
| List row | `src/components/ArtistCard/ArtistCard.tsx` |
| Initials placeholder (server-safe) | `src/lib/initials.ts` |
| Retirement redirect | `src/lib/auth/route-guard.ts` |

## References

- [data-layer.md](References/data-layer.md) — `getArtists` / `getArtist` signatures,
  query shapes, search escaping and length cap, paging, track counts, tests.
- [pages.md](References/pages.md) — the browse page (out-of-range page redirect, empty
  states), `SearchInput` debounce, `Pagination`, the detail page, and the layout.
- [retirement-and-revival.md](References/retirement-and-revival.md) — exactly how it's
  dark, what's shared and live, and a checklist (with known gaps) for bringing it back.

## Depends on

- [[catalog-schema]] — `artists`, `track_artists`, `track_albums`, `albums`; read policies.
- [[component-library]] — `Heading`, `Input`, `ArtistCard`, `*.styles.ts` pattern.
- [[auth]] — protected prefix + the retirement redirect.

## Known gaps (as of 2026-10-02)

- `photoUrl` / `profile_photo_url` is rendered straight into `<img src>`, but the column holds
  an R2 **key** — needs `signImageUrl` ([[media-storage]]) before any photo is set.
- Detail tracks sort by title and ignore `position`; the play glyph is a placeholder (not
  wired to the player).
- `trackCount` counts all credited tracks, including ones with no release.

A code guide is in `Walkthrough/walkthrough.md` (gitignored).
