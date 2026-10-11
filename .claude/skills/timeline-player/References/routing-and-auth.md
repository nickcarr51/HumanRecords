# Reference: Routing, auth redirects, and error handling

## The `(app)` route group

Authenticated pages live under `src/app/(app)/` and share one layout,
`src/app/(app)/layout.tsx`, which guards the session (`getSessionUser()` → `redirect("/login")`
if signed out), reads `getCurrentRole()` for the Admin nav link, and renders
`<AppShell isLabelMember={…}>`. Because the layout stays mounted across in-app
navigation, the player mounted inside `AppShell` persists (see
[persistent-player.md](persistent-player.md)). Routes in the group: `/feed`, `/albums/[id]`,
`/dashboard`, `/admin/**` ([[admin-upload]]), and the retired `/artists` ([[artists-read]]).

- `/feed` (`src/app/(app)/feed/page.tsx`) — async server component. Reads `?q=` (trimmed) and
  `?page=` (`parsePage` in the plain module `params.ts`: junk, `0`, negatives, non-finite or above `MAX_PAGE` (100 000) → 1; `2.5` → 2; `q` is also capped at `MAX_QUERY_LENGTH` (200) and a repeated `?q=a&q=b` / `?page=` is ignored),
  then `getFeed(supabase, { page, q })`. A page past the end redirects to the last page, keeping
  `q` (`pageHref`). Renders `SearchInput` (label `Search artists, tracks, albums`) as the header,
  a scroll area keyed on `q|page` (new page/search starts at the top) with
  `<FeedList items source={{ kind: "feed", q, lastPage: page, hasMore }} emptyMessage>` (search
  with no hits → `No results for "<q>"`), `Pagination` below, and `FollowPlayingPage`. This is the
  authenticated home.
- `/albums/[id]` (`src/app/(app)/albums/[id]/page.tsx`) — async server component:
  `getAlbum(supabase, id)`; `notFound()` when null; renders album header + `<AlbumTracks>`
  whose rows play through the persistent player.

## Auth redirect model → `/feed`

Signed-in users land on `/feed` everywhere the app used to send them to `/dashboard`:

- `src/lib/auth/route-guard.ts` — `authRedirectPath(pathname, isAuthed)`:
  - `PROTECTED_PREFIXES = ["/dashboard", "/artists", "/feed", "/albums", "/admin"]`;
    signed-out on any of these → `/login`. (`/admin` role gating is in [[admin-upload]].)
  - signed-in on `/artists` or `/artists/*` → `/feed` (route retired, code kept).
  - signed-in on `/` or `/login` → `/feed`.
  - Consumed by `src/lib/supabase/middleware.ts` (via `src/middleware.ts`).
- `src/lib/auth/safe-next.ts` — `safeNextPath` defaults to `/feed` (was `/dashboard`) and
  still rejects absolute URLs, `//`, and `/\` (no open redirect). Used by the OTP confirm
  route (`src/app/auth/confirm/route.ts`).

`/dashboard` remains reachable by URL (by design); it's just no longer the landing target,
and the `AppShell` brand links to `/feed` with no Artists nav link.

See [[auth]] for the full invite/OTP flow — this feature only retargeted destinations.

## Global 404 bounce

`src/app/not-found.tsx` is an async server component: signed-in users hitting any unmatched
path are `redirect("/feed")`; signed-out visitors get a plain 404. (This also means a
`notFound()` from the album page sends a signed-in user to `/feed` rather than a 404 page —
intended.)

## Route error boundary

`src/app/(app)/error.tsx` is a client error boundary (`'use client'`, default export taking
`{ error, reset }`). If `getFeed`/`getAlbum` throw (a real Supabase error, not the empty
case — empty is handled by `FeedList`'s "Nothing here yet."), it renders a friendly retry
state instead of a 500.

## Feed row components

`src/components/Feed/` (all `'use client'`, consume `usePlayer` + `toPlayerTrack`):

- `FeedList` — maps `FeedItem[]` to `AlbumRow`/`SingleTrackRow`; `emptyMessage` when empty
  (default "Nothing here yet."). Builds ONE page-wide queue with `feedQueue(items, page)`
  (every track in feed order, each tagged with its feed `page` and its release `from`) plus each
  item's offset into it, so next/prev move from release to release. Passes its `source` down.
- `SingleTrackRow` — play → `playQueue(feedQueue, itsOffset, source)`.
- `AlbumRow` — collapsed by default; expand reveals `AlbumTracks`; "play album" →
  `playQueue(feedQueue, albumOffset, source)`, disabled when the album has no tracks; links to `/albums/{id}`.
- `AlbumTracks` — shared by the expanded row and the album page. In the feed it gets the
  feed queue + album offset + source (`playQueue(feedQueue, albumOffset + i, source)`); on the
  album page it gets `albumId` instead and the album is its own queue with source
  `{ kind: "album", albumId }`, so it continues into the feed when the album ends.
- `FollowPlayingPage` (feed page only) — when the playing track's `page` goes N → N+1 while the
  viewer is on page N with the same `q`, `router.replace` to N+1; deferred until the tab is
  visible. Never moves the view otherwise (see [persistent-player.md](persistent-player.md)).
- `usePlayButton(trackIds, start)` — shared by all three buttons. If the current track is one
  of `trackIds` the button shows ⏸ while playing (or loading) and toggles pause/resume instead
  of restarting; an album button covers all its track ids. Not current → `start()`. Loading →
  click ignored. Errored → `start()` again (retry).
