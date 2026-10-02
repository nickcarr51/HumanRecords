---
name: timeline-player
description: Use when working on the listener timeline (the `/feed` page), the persistent music player (PlayerProvider / usePlayer / PlayerBar), the album page (`/albums/[id]`), the feed/album data layer (getFeed / getAlbum), or the auth redirects that land signed-in users on `/feed`. Covers how playback persists across navigation, how the chronological feed is assembled, and how these routes are guarded.
---

# Timeline + Persistent Player

The listener MVP: a single chronological **timeline** at `/feed` (a mix of album and
single releases) and a **music player** that keeps playing while the user navigates the
app — SoundCloud-style. Built on branch `feature/media-player-and-refactor` (2026-09-29).

## The one thing to understand first

Playback persists **because of where the player is mounted, not because of any store.**
`PlayerProvider` (which owns the single `<audio>` element) is rendered inside `AppShell`,
which is rendered once by the `(app)` route-group layout (`src/app/(app)/layout.tsx`). The
App Router keeps that layout mounted while the user moves between routes inside `(app)`
(`/feed` ↔ `/albums/[id]` ↔ `/dashboard`), so the `<audio>` element and all player state
never unmount. No global state library, no refresh-resume.

## Pieces

| Concern | Where |
|---|---|
| Player state + `<audio>` + actions | `src/components/Player/PlayerProvider.tsx` |
| Player control bar (UI) | `src/components/Player/PlayerBar.tsx` |
| Feed data (releases, newest first) | `src/lib/supabase/feed.ts` (`getFeed`) |
| Album detail data | `src/lib/supabase/albums.ts` (`getAlbum`) |
| Shared artist-name flattener | `src/lib/supabase/artist-names.ts` |
| Timeline page | `src/app/(app)/feed/page.tsx` |
| Album page | `src/app/(app)/albums/[id]/page.tsx` |
| Feed rows | `src/components/Feed/{FeedList,SingleTrackRow,AlbumRow,AlbumTracks}.tsx` |
| Player mount | `src/components/AppShell/AppShell.tsx` |
| Auth redirects → `/feed` | `src/lib/auth/{route-guard,safe-next}.ts`, `src/app/not-found.tsx` |
| Route error boundary | `src/app/(app)/error.tsx` |

## References

- [persistent-player.md](References/persistent-player.md) — the player context, its state
  machine (load/play/pause/next/prev/seek), signed-URL playback, and error/autoplay handling.
- [feed-and-album-data.md](References/feed-and-album-data.md) — `getFeed` (one query on
  `releases`, newest first, SQL pagination) and `getAlbum` (tracks in `position` order);
  position ordering and the "Various Artists" label.
- [routing-and-auth.md](References/routing-and-auth.md) — the `(app)` route group, `/feed`
  as the authenticated home, `/albums/[id]`, the auth retarget, retired `/artists`, the
  global 404 bounce, and the error boundary.
- [testing.md](References/testing.md) — how this feature is tested (player state-machine
  unit tests, data integration tests against local Supabase) and the deliberately dropped
  front-end render tests.

## Depends on

- [[media-storage]] — the player plays signed R2 URLs via the `getTrackStreamUrl` server
  action; the client only ever passes a `trackId`.
- [[catalog-schema]] — `getFeed`/`getAlbum` read `releases`/`albums`/`tracks`/
  `track_albums`/`track_artists`/`album_artists` and rely on the "authenticated" RLS policies.
- [[admin-upload]] — owns the `releases` table, `position` columns, and the publish path
  that creates what the feed shows.
- [[component-library]] — all UI is styled-components using the theme tokens.
- [[auth]] — the `(app)` layout session guard and the redirect model that lands users on `/feed`.

## Known deferrals (as of 2026-10-02)

- **Releases model** — shipped in `feature/admin-release-upload`: the feed reads a
  `releases` table and link rows carry `position`. See [[admin-upload]].
- Feed search bar and Load-More/pagination UI are deferred (data layer supports paging).
- Player icons/artwork are placeholder pending a design pass.

A code guide (mount chain, player state machine, feed data, reading order) is in
`Walkthrough/walkthrough.md` (gitignored).
