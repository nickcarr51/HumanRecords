# Reference: Routing, auth redirects, and error handling

## The `(app)` route group

Authenticated pages live under `src/app/(app)/` and share one layout,
`src/app/(app)/layout.tsx`, which guards the session (`getSessionUser()` → `redirect("/login")`
if signed out) and renders `<AppShell>`. Because the layout stays mounted across in-app
navigation, the player mounted inside `AppShell` persists (see
[persistent-player.md](persistent-player.md)). Routes in the group: `/feed`, `/albums/[id]`,
`/dashboard`, and the retired `/artists`.

- `/feed` (`src/app/(app)/feed/page.tsx`) — async server component: `createClient()` →
  `getFeed(supabase, { page: 1 })` → `<FeedList items={...} />`. Title-only header (search
  bar deferred). This is the authenticated home.
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

- `FeedList` — maps `FeedItem[]` to `AlbumRow`/`SingleTrackRow`; "Nothing here yet." when empty.
  Builds ONE feed-wide queue (every track, in feed order — singles as one track, albums as
  their tracks) plus each item's offset into it, so next/prev move from release to release.
- `SingleTrackRow` — play → `playQueue(feedQueue, itsOffset)`.
- `AlbumRow` — collapsed by default; expand reveals `AlbumTracks`; "play album" →
  `playQueue(feedQueue, albumOffset)`, disabled when the album has no tracks; links to `/albums/{id}`.
- `AlbumTracks` — shared by the expanded row and the album page. In the feed it gets the
  feed queue + album offset (`playQueue(feedQueue, albumOffset + i)`); on the album page those
  props are omitted and the album is its own queue (`playQueue(albumTracks, i)`).
