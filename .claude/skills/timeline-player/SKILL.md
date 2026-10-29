---
name: timeline-player
description: Use when working on the listener timeline (`/feed`), the persistent music player (`PlayerProvider` / `usePlayer` / `usePlayerTime` / `PlayerBar`), where the waveform plugs into the player (`PixelWaveform`, `PlaybackButton` particles, the meter contexts; the waveform end to end is the `waveform` skill), the album page (`/albums/[id]`), the feed/album data layer (`getFeed` / `getAlbum`, `catalogNumber`; the feed's Drizzle read through `asUser` with `searchMatches` in `feed-search.ts`, `TRACK_WITH` / `ARTIST_NAMES` / `toFeedTrack` in `catalog-selects.ts`, `artistNamesOf`, `MAX_ROWS`, `UNAUTHENTICATED` when signed out), the feed rows (`AlbumRow` "Pack", `SingleTrackRow` "Single", `PixelAccordion`, `CatalogLine` HS###/HSS###), per-track downloads on those pages (`DownloadButton`, `DownloadsProvider`/`useDownloads`, `getMyDownloadedTrackIds`), or the auth redirects that land signed-in users on `/feed`. Also when play buttons re-render during playback, or album art is missing from the album page. Covers playback of presigned R2 URLs (CORS-mode `<audio>` on desktop for the live meter, plain `<audio>` on touch), how playback persists across navigation, how the feed (pinned first, then `sort_at`, archived hidden) is assembled, and how these routes are guarded.
---

# Timeline + Persistent Player

The listener MVP: a single **timeline** at `/feed` (pinned releases first, then newest `sort_at`) (a mix of album and
single releases) and a **music player** that keeps playing while the user navigates the
app — SoundCloud-style. Built on branch `feature/media-player-and-refactor` (2026-09-29);
vector controls, the waveform meter (live Web Audio on desktop, stored peaks on touch since 2026-10), catalog numbers and the "Pack"/"Single" vocabulary
landed on `feat/playback-vector-icons` (2026-10-11).

## The two things to understand first

**1. Playback persists because of where the player is mounted, not because of any store.**
`PlayerProvider` (which owns the single `<audio>` element) is rendered inside `AppShell`,
which is rendered once by the `(app)` route-group layout (`src/app/(app)/layout.tsx`). The
App Router keeps that layout mounted while the user moves between routes inside `(app)`
(`/feed` ↔ `/albums/[id]` ↔ `/dashboard`), so the `<audio>` element and all player state
never unmount. No global state library, no refresh-resume.

**2. The browser plays the presigned R2 URL directly; the `<audio>` differs by device.**
The path is browser → `getTrackStreamUrl(trackId)` server action → presigned R2 URL →
`<audio src={url}>`. There is no proxy/stream route and no feature flag. On **desktop**
`useAudioMeterSource` routes the element through a Web Audio analyser
(`createMediaElementSource` → `AnalyserNode`) and `PlayerProvider` sets
`crossOrigin="anonymous"`, so playback is a CORS request (the bucket's existing `GET` rule
covers it). On **touch devices** (`isTouchDevice()`: coarse pointer or iOS/iPadOS) the element
stays plain: **never** set `crossOrigin` or create an `AudioContext` /
`createMediaElementSource` there, because iOS silences playback the moment Safari is
backgrounded, and a plain `<audio>` keeps playing when the user switches apps or locks the
phone, which the site relies on. Touch playback is therefore not a CORS request; bucket CORS
`GET` is needed there only for the waveform's peaks `fetch`.

**3. The waveform and button particles read the meter contexts, filled differently by device.**
`PlayerProvider` provides `readLevel` / `readWaveform` through `AudioMeterContext` /
`AudioWaveformContext` (`useAudioMeter()` / `useAudioWaveform()`, consumed by `PlaybackButton`
and `PixelWaveform`). Desktop fills them from `useAudioMeterSource`'s live analyser
(`enableMeter()` in `playQueue` / `play`) and never fetches peaks. Touch fills them from
`usePeaks` + `usePeakReaders` over the track's stored `peaks/<id>.bin`, requested only once the
`<audio>` fires **'playing'** for that track (the started mark resets on every track change).
A touch track without peaks gets `null` readers: idle dots, playback unaffected.
End-to-end (upload, Analyze all, readers, tuning, troubleshooting): see [[waveform]].
The CORS rules are `infra/r2/cors.{local,dev,prod}.json` + `infra/r2/README.md`
(see [[media-storage]]).

## Pieces

| Concern | Where |
|---|---|
| Player state + `<audio>` + actions (`usePlayer`, `usePlayerTime`) | `src/components/Player/PlayerProvider.tsx` |
| Stored-peaks readers (`levelAt`, `shimmer`, `loadPeaks`, `usePeaks`, `usePeakReaders`; tuning `LEVEL_GAIN`/`WAVE_GAIN`/`WAVE_MIX`) | `src/components/Player/peaks.ts` |
| Meter contexts + hooks (`AudioMeterContext`, `AudioWaveformContext`, `useAudioMeter`, `useAudioWaveform`), `isTouchDevice`, desktop analyser `useAudioMeterSource` | `src/components/Player/audioMeter.ts` |
| Player control bar (UI) | `src/components/Player/PlayerBar.tsx` |
| Waveform canvas in the bar | `src/components/Player/PixelWaveform.tsx` |
| Play/pause button with glow + particles (every play button in the app) | `src/components/Player/PlaybackButton.tsx` |
| Play/pause glyph, hover-sweep SVG wrapper | `src/components/Player/{PlaybackIcon,SweepIcon}.tsx` |
| Queue model (sources, paging, dedup; `PlayerTrack.catalogNumber?`) | `src/components/Player/queue.ts` |
| Lock-screen controls | `src/components/Player/useMediaSession.ts` |
| Next-page server actions | `src/lib/feed/actions.ts` (`loadFeedPage`, `continueAfterRelease`) |
| Follow-the-music on /feed | `src/components/Feed/FollowPlayingPage.tsx` |
| Feed search box + pager | `src/components/{SearchInput,Pagination}/` (shared with [[artists-read]]); `src/app/(app)/feed/{page.tsx,params.ts}` |
| Feed data (pinned + `sort_at` order, archived hidden, `catalogNumber`; Drizzle via `asUser`) | `src/lib/supabase/feed.ts` (`getFeed`) |
| Feed search filter (same matches as the old `search_feed` SQL function) | `src/lib/supabase/feed-search.ts` (`searchMatches`) |
| Album detail data (one supabase-js read after `getClaims`) | `src/lib/supabase/albums.ts` (`getAlbum`) |
| The feed's Drizzle query shapes (`ARTIST_NAMES`, `TRACK_WITH`, `DbTrack`, `toFeedTrack`) | `src/lib/supabase/catalog-selects.ts` |
| Shared artist-name flatteners (`artistNamesOf` for Drizzle rows, `namesFrom` for supabase-js embeds) | `src/lib/supabase/artist-names.ts` |
| Catalog id stamp (`HS###` album / `HSS###` track) + row line | `src/components/CatalogId/{CatalogId,CatalogLine}.tsx` |
| Timeline page | `src/app/(app)/feed/page.tsx` |
| Album page (artwork hidden for now) | `src/app/(app)/albums/[id]/{page.tsx,album-page.styles.ts}` |
| Downloaded-state ids (user client) | `src/lib/supabase/downloads.ts` (`feedTrackIds`, `getMyDownloadedTrackIds`) |
| Download button (SVG glyphs) + provider | `src/components/Downloads/{DownloadsProvider,DownloadButton}.tsx` |
| Feed rows ("Pack" / "Single") | `src/components/Feed/{FeedList,SingleTrackRow,AlbumRow,AlbumTracks}.tsx` |
| Album-row expand panel (mount/unmount + particles) | `src/components/Feed/PixelAccordion.tsx` |
| Shared play-button behaviour | `src/components/Feed/usePlayButton.ts` |
| Row styles (`Row`, `PlayButton`, `Kind`, `RowActions`, `ExpandArea`) | `src/components/Feed/feed.styles.ts` |
| Player mount | `src/components/AppShell/AppShell.tsx` |
| Auth redirects → `/feed` | `src/lib/auth/{route-guard,safe-next}.ts`, `src/app/not-found.tsx` |
| Route error boundary | `src/app/(app)/error.tsx` |

## References

- [persistent-player.md](References/persistent-player.md) — the playback path (presigned R2
  URL on one `<audio>`: CORS mode on desktop, plain on touch), the `usePlayer` / `usePlayerTime` split, the state machine
  (load/play/pause/next/prev/seek), error/autoplay handling, the meter wiring
  (`audioMeter.ts`, `peaks.ts`, `PixelWaveform`, `PlaybackButton`), queue sources and paging (a search
  queue that runs out continues into the main feed after its last release; the view stays on
  the search), pre-signing, Media Session, and `FollowPlayingPage`.
- [feed-and-album-data.md](References/feed-and-album-data.md) — `getFeed` (one Drizzle
  transaction over `releases`, a rows query plus a count query, with an optional `searchMatches`
  filter for `q`, `pinned desc, sort_at desc`, archived hidden, exact-count pagination,
  `FEED_PAGE_SIZE`), `getReleaseFeedPage` / `getFeedAfterRelease`,
  and `getAlbum` (tracks in `position` order); the required `catalogNumber` on every shape; position
  ordering and the "Various Artists" label. Also how both pages seed downloaded state
  (`getMyDownloadedTrackIds` + `DownloadsProvider`).
- [routing-and-auth.md](References/routing-and-auth.md) — the `(app)` route group, `/feed`
  as the authenticated home, `/albums/[id]` (artwork hidden), the auth retarget, retired `/artists`, the
  global 404 bounce, the error boundary, and the feed row components ("Pack"/"Single" labels,
  aria-labels, `CatalogLine`, `PixelAccordion`).
- [testing.md](References/testing.md) — how this feature is tested (player state-machine
  unit tests, data integration tests against local Supabase, the canvas/rAF/matchMedia stubs
  for the visual pieces) and the deliberately dropped front-end render tests.

## Depends on

- [[media-storage]] — the player plays presigned R2 URLs via the `getTrackStreamUrl` server
  action; the client only ever passes a `trackId`. `getTrackPeaksUrl` signs
  the `peaks/<id>.bin` GET the same way. Playback is a CORS request on desktop only
  (`crossOrigin="anonymous"`, so a bucket without `GET` breaks desktop playback); on touch it
  is not, and `GET` there only serves the peaks `fetch` (else idle dots).
- [[waveform]] — the meter end to end: stored peaks, the desktop analyser, Analyze all, CORS.
- [[catalog-schema]] — `getFeed`/`getAlbum` read `releases`/`albums`/`tracks`/
  `track_albums`/`track_artists`/`album_artists` (including `catalog_number`) and rely on the
  "authenticated" RLS policies.
- [[db-access]] — `getFeed` runs through Drizzle's `asUser` (as the signed-in user, so those RLS
  policies apply); its errors come back as `DomainError` / `DatabaseError`. `getAlbum` is one
  supabase-js read (back from Drizzle in slice 2) after the same `getClaims` session check.
- [[content-lifecycle]] — owns `archived_at`, `pinned`/`sort_at` and `move_release`, which decide what the feed shows and in what order.
- [[admin-upload]] — owns the `releases` table, `position` columns, and the publish path
  that creates what the feed shows.
- [[media-storage]] also serves downloads: rows render `DownloadButton`, which calls `getTrackDownloadUrl`.
- [[component-library]] — all UI is styled-components using the theme tokens; the hover
  sweep (`iconSweepStyles`, `--hover-progress`), `withAlpha`, `theme.effects.particle` and
  the general canvas/rAF/matchMedia test stubs live there.
- [[auth]] — the `(app)` layout session guard and the redirect model that lands users on `/feed`.

## Known deferrals (as of 2026-10-11)

- **Releases model** — shipped in `feature/admin-release-upload`: the feed reads a
  `releases` table and link rows carry `position`. See [[admin-upload]].
- **Album art is not rendered on the album page** until image upload ships
  (`album_art_url` holds an unsigned R2 key). `Art` / `ArtPlaceholder` in
  `album-page.styles.ts` are kept; to restore, put the `Head` grid back to `96px 1fr` and
  render `<Art>` as its first child (see routing-and-auth.md).
- Feed rows show no artwork; `useMediaSession` sets the fixed logo as artwork.
- **Lock-screen playback has never worked on iPhone (any version of the app, with or
  without Web Audio).** Locking the phone stops the audio and no controls appear, even though
  `useMediaSession` is wired. Cause unknown; not caused by Web Audio (touch devices never use it) and
  not a regression of any branch. Open investigation: test on hosted dev over https (LAN
  http is a variable), Safari tab vs Home Screen app, and whether `play()` on the first
  track vs auto-advance differs. Background playback when *switching apps* does work.
- **On touch devices, tracks without stored peaks show idle dots** until **Analyze all** runs on
  their release page. Waveform gaps and decisions: [[waveform]].

## Gotchas (quick list; details in the references)

- A track won't play on an environment → check signing (`getTrackStreamUrl`) and that the
  object exists. On desktop playback is CORS mode (`crossOrigin="anonymous"`), so a missing
  bucket `GET` rule can also block it; on touch it only affects the peaks `fetch`.
- Waveform flat while audio plays → [[waveform]] Troubleshooting (split by desktop / touch).
- Anything that only needs `currentTrack` / `isPlaying` / `status` must call `usePlayer()`,
  **never `usePlayerTime()`** — the time context ticks ~4×/s during playback.
- The only `AudioContext` is `useAudioMeterSource`'s, desktop only (a no-op in jsdom); the
  touch meter readers are pure functions of peaks bytes plus `currentTime`, unit-tested in
  `peaks.test.tsx`. Canvas pieces need `getContext`/`requestAnimationFrame`/`matchMedia` stubs.
- Collapsed album rows do not render their tracks (`PixelAccordion` unmounts children
  ~450 ms after close), so they do not subscribe to the player.

A code guide (mount chain, player state machine, meter, feed data, reading order) is in
`Walkthrough/walkthrough.md` (gitignored).
