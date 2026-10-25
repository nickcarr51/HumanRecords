# Reference: Routing, auth redirects, error handling, and the feed rows

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
  `getAlbum(supabase, id)`; `notFound()` when null; renders a `‹ timeline` back link, the
  `Head` (`<CatalogId kind="album">` → `HS###`, `Title`, `Artists` via `albumArtistLabel`) and
  `<AlbumTracks tracks albumId>` inside `DownloadsProvider`; rows play through the persistent player.

### Album artwork is intentionally not rendered (yet)

`album_art_url` holds an R2 object key that is not signed for display yet, so an `<img>`
would be a blank square. The page therefore renders only the text column, and
`album-page.styles.ts` sets the `Head` grid to a single column (`grid-template-columns: 1fr`).
The pieces for the image-upload pass are kept, not deleted: `Art` (`styled(GlitchArt)`,
96×96, `object-fit: cover`) and `ArtPlaceholder` (96×96 `raised` block) in
`album-page.styles.ts`, and `albumArtUrl` on `AlbumDetail`. **To turn artwork back on:**
set `Head` back to `grid-template-columns: 96px 1fr`, render `<Art src={signedUrl} alt="">`
(or `<ArtPlaceholder>` when null) as the first child of `<Head>` before the text `<div>`, and
sign the key with `signImageUrl` ([[media-storage]]). Feed rows show no artwork either.

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
`{ error, reset }`). If `getFeed`/`getAlbum` throw (a database error, which `asUser` turns into
a `DatabaseError` or a `DomainError` such as `UNAUTHENTICATED` for a session that expired after
the middleware ran; not the empty case — empty is handled by `FeedList`'s "Nothing here yet."),
it renders a friendly retry state instead of a 500.

## Feed row components

`src/components/Feed/` (all `'use client'`, consume `usePlayer` + `toPlayerTrack`; none of
them use `usePlayerTime`). Every play control is `PlaybackButton` + `PlaybackIcon` from
`src/components/Player/` (circle, accent glow and particles while its track plays); every
other icon is an inline SVG wrapped in `SweepIcon` (hover sweep). Shared styles live in
`feed.styles.ts`: `Row` (3-column grid `auto minmax(0,1fr) auto`; 2 columns ≤ `sm` with the
last child dropping under the meta), `PlayButton`/`AlbumLink` (the circular control styles +
`iconSweepStyles`), `Meta`, `Title`, `Sub`, `Kind` (uppercase xs label), `RowActions`,
`ExpandArea` (recessed panel: `theme.effects.panel` background, `withAlpha(theme.effects.shadow, …)` drop shadow, pixel corner marks, `4px` left radius), `Empty`. On ≤ `sm` the `Row` grid uses `display: contents` on `Meta` so the play button sits beside the title row even when the title wraps.

### Listener vocabulary

Listeners never see "album" or "track" as nouns. The feed says **Pack** for an album release
and **Single** for a single release (the `<Kind>` label at the right of each row); the back
link on the album page says `‹ timeline`. Keep this in aria-labels too:

| Control | aria-label |
|---|---|
| `AlbumRow` play/pause | `Play pack` / `Pause pack` |
| `AlbumRow` expand toggle | `Expand tracks` / `Collapse tracks` (+ `aria-expanded`, `aria-controls={panelId}`) |
| `AlbumRow` link to `/albums/{id}` | `Open pack <title>` |
| `SingleTrackRow` / `AlbumTracks` row play | `Play <title>` / `Pause <title>` |
| `DownloadButton` | `Download <title>` / `Downloaded — download <title> again` |
| `CatalogId` stamp | `Album catalog HS###` / `Track catalog HSS###` |

Tests query by these names (`FeedList.test.tsx`), so renaming one is a test change.

### The catalog line

Each row's first line is `<CatalogLine kind number issuedAt? slot? total?>`
(`src/components/CatalogId/CatalogLine.tsx`): the `CatalogId` stamp (`HS###` album /
`HSS###` track, zero-padded to 3, never truncated above 999), then `ISSUED yyyy.mm.dd`
(`createdAt` formatted in **UTC** via `toISOString`, as a `<time dateTime>`), then the track
position: `TRACKS NN` on an album row (`total` only) or `TRACK nn / NN` inside an album's
track list (`slot` + `total`). Singles pass `issuedAt` only. Everything after the id is
`display: none` at `<= theme.breakpoints.sm`, so phones see just the stamp.

- `FeedList` — maps `FeedItem[]` to `AlbumRow`/`SingleTrackRow`; `emptyMessage` when empty
  (default "Nothing here yet."). Builds ONE page-wide queue with `feedQueue(items, page)`
  (every track in feed order, each tagged with its feed `page` and its release `from`) plus each
  item's offset into it, so next/prev move from release to release. Passes its `source` down.
- `SingleTrackRow` — `Kind` "Single"; play → `playQueue(feedQueue, itsOffset, source)`; `DownloadButton`.
- `AlbumRow` — `Kind` "Pack"; collapsed by default; the chevron toggle (rotates 180° when
  open) expands a `PixelAccordion` containing `AlbumTracks`; "Play pack" →
  `playQueue(feedQueue, albumOffset, source)`, disabled when the album has no tracks; the
  arrow link opens `/albums/{id}`.
- `PixelAccordion({ open, id, children })` — the expand panel. A CSS grid `0fr → 1fr` height
  transition (420 ms, opacity 240 ms; none under `prefers-reduced-motion`) plus a one-shot
  body-level particle canvas on each open/close. **Children are mounted only while `open`
  or for `CLOSE_MS` (450 ms) after it turns false** (immediately under reduced motion), so
  the collapsed panel is empty DOM. While closed the panel is `inert` and `aria-hidden`, so
  its controls are neither focusable nor announced. Reason: every row's play button
  subscribes to the player; with 20 albums × N tracks of mounted rows, each `usePlayer`
  change would re-render all of them. Collapsed rows now cost nothing during playback.
- `AlbumTracks` — shared by the expanded row and the album page. In the feed it gets the
  feed queue + album offset + source (`playQueue(feedQueue, albumOffset + i, source)`); on the
  album page it gets `albumId` instead and the album is its own queue with source
  `{ kind: "album", albumId }`, so it continues into the feed when the album ends. Each row
  shows `CatalogLine` with `TRACK nn / NN` and a `DownloadButton`.
- `FollowPlayingPage` (feed page only) — when the playing track's `page` goes N → N+1 while the
  viewer is on page N with the same `q`, `router.replace` to N+1; deferred until the tab is
  visible. Never moves the view otherwise (see [persistent-player.md](persistent-player.md)).
- `usePlayButton(trackIds, start)` → `{ playing, activePlaying, onClick }`, shared by all three
  buttons. If the current track is one of `trackIds` the button shows the pause glyph while
  playing (or loading) and toggles pause/resume instead of restarting; an album button covers
  all its track ids. Not current → `start()`. Loading → click ignored. Errored → `start()`
  again (retry). `activePlaying` (`active && isPlaying && status !== 'error'`) drives
  `PlaybackButton active` (glow + particles), so an errored or loading track never glows.
