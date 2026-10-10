# Reference: Retirement and revival

## How it's dark today

- `src/lib/auth/route-guard.ts`: signed-in + (`/artists` or `/artists/*`) → `/feed`. Covered
  by `route-guard.test.ts` ("retires /artists: signed-in users are sent to /feed").
- `/artists` stays in `PROTECTED_PREFIXES`, so signed-out users still go to `/login`.
- `AppShell` has no Artists link; the brand links to `/feed`.
- The middleware redirect runs before rendering, so the pages never execute for anyone.

Retired when the listener timeline became the home (`/feed`, PR #7).

## Still live elsewhere — don't delete casually

| Piece | Live consumer |
|---|---|
| `escapeLike` | `src/lib/admin/actions.ts` → `searchArtists` (upload form's artist combobox) |
| `initials` (`src/lib/initials.ts`) | `ArtistCard`; the detail page |
| `ArtistCard` | Only the artists page today, but barrel-exported from `@/components` |

## Revival checklist

1. Remove the `/artists` rule from `authRedirectPath` and update `route-guard.test.ts` (keep
   `/artists` in `PROTECTED_PREFIXES`).
2. Add an Artists `NavLink` in `src/components/AppShell/AppShell.tsx` (and an `AppShell` test).
3. Sign media keys: `photoUrl` (and `trackArtUrl`) are R2 keys. Resolve them server-side with
   `signImageUrl` from `src/lib/storage/sign.ts` in the page (or in a server-only wrapper),
   never in `ArtistCard` ([[media-storage]]).
4. Wire the detail page's play slot to the player: convert tracks with `toPlayerTrack` and call
   `playQueue` from a client row component, like `AlbumTracks` ([[timeline-player]]). The
   detail query would need `track_artists(position, artists(name))` per track for artist names.
5. Decide track order (title today) and whether to show only released tracks (join through
   `releases` / `track_albums`) — `trackCount` currently counts every credited track.
6. Optionally link artist names in the feed and album pages to `/artists/{id}`.
7. Run `yarn test --run src/app/\(app\)/artists src/lib/supabase/artists` (data tests need
   `yarn supabase start`), then `yarn lint` and `yarn build`.
8. Fix two known data-layer gaps in `src/lib/supabase/artists.ts`: `getArtist` does not filter
   archived tracks for label members (RLS shows them), and `track_artists(count)` counts archived
   tracks. Filter on `tracks.archived_at` and count only live tracks.
