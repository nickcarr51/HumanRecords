# Reference: Testing this feature

## What is tested

**Player state machine** — `src/components/Player/PlayerProvider.test.tsx` (unit,
React Testing Library). jsdom has no media playback, so `beforeAll` stubs
`HTMLMediaElement.prototype.play/pause/load`. `getTrackStreamUrl` is mocked. A small
`Harness` component drives the actions. Covers: `toPlayerTrack` fallback; `playQueue` sets
current + requests signed URL; `next` advances + re-signs; `ended` auto-advances; `next()`
at the end of a queue that can't extend is a no-op; `prev()` back-nav; signing error → `status:"error"` (never stuck on
loading); autoplay-block → off loading; `toggle()` plays; and `toggle()` no-op + `src`
cleared after an error.

**PlayerBar** — `src/components/Player/PlayerBar.test.tsx` (unit). Mocks `usePlayer`. Covers:
null render on empty queue; title/artist; controls call actions; play vs pause icon by
`isPlaying`; scrubbing calls `seek`; error note; NaN/Infinity duration → slider `max="0"`.

**Data layer** — `src/lib/supabase/feed.data.test.ts` and `albums.data.test.ts`
(integration, `*.data.test.ts` convention). These require a **local Supabase** running
(`yarn supabase start`); `test-helpers.ts` refuses non-local URLs. They self-seed rows with
`createAdminClient`/`createTestUser`, sign in, exercise real queries, and clean up in
`afterEach`. Covers: releases pinned first, then `sort_at` with album tracks + credits in `position`
order; tracks without a release excluded; uncredited single → empty `artistNames`;
pagination (`pageSize`/`hasMore`) — the tests give `releases.created_at` values that
contradict track creation order, proving ordering comes from `releases`; `getAlbum`
positive + null (missing + non-UUID + archived) paths and position (not title) track order; feed pinned/`sort_at` order and archived items hidden; `feed-page-size.test.ts` (unit) for `FEED_PAGE_SIZE`; `feed-query.data.test.ts` for search (`q`), counts/`totalPages` and past-the-end totals; `feed-after-release.data.test.ts` for `getReleaseFeedPage`/`getFeedAfterRelease` (albums and singles, archived → null).

**Queue + lock screen** — `queue.test.ts` (pure queue functions, dedup), `PlayerProvider.test.tsx` (paging, retries, pre-sign, album and finished-search continuation into the main feed), `useMediaSession.test.tsx`.

**Auth redirects** — `route-guard.test.ts`, `safe-next.test.ts`, `not-found.test.tsx`,
`middleware.test.ts`, `auth/confirm/route.test.ts` all assert the `/feed` targets.

**Feed play wiring** — `src/components/Feed/FeedList.test.tsx` (unit). Mocks `usePlayer`
(keeps the real `toPlayerTrack`) and `next/link`. Covers the feed-wide queue and offsets
(single, album, and a track inside an expanded album each start at the right index) and the
`usePlayButton` rules: pause shown for the current track and toggles instead of restarting,
paused current track resumes, album button reflects any of its tracks, clicks ignored while
loading, errored track retries via `playQueue`. Also asserts rows pass their `source`.
`AlbumTracks.test.tsx` covers the album-page source (`{ kind: "album", albumId }`).

**Feed page** — `src/app/(app)/feed/page.test.tsx` (redirect past the end keeping `q`, trimmed
`q`, past-the-end empty search → its page 1, empty search on page 1 not redirected), `params.test.ts` (`parsePage`),
`src/components/Feed/FollowPlayingPage.test.tsx` (follows only from the viewed page with the
same `q`; deferred while hidden). `Pagination`/`SearchInput` tests live with the components in
`src/components/` ([[artists-read]]).

**Downloads** (feature/downloads) — `src/components/Downloads/DownloadsProvider.test.tsx` (seeded ids,
mark flips every consumer, new `initialIds` on rerender unioned with local marks, no-provider fallback);
`DownloadButton.test.tsx` (↓/✓ labels, spinner + double-tap ignored, success marks + navigates via mocked
`navigate.ts`, `{ error }` and thrown action → toast, state unchanged);
`src/components/Feed/AlbumTracks.downloads.test.tsx` (real button in real rows: seeded ✓, and no
ToastProvider/DownloadsProvider → renders and survives a failed download); `FeedList.test.tsx` (every single
and expanded album track has a download button, Downloads mocked); `src/lib/supabase/downloads.test.ts`
(`feedTrackIds`, empty → no query, chunks of 100, error → `[]`) and `downloads.data.test.ts` (RLS: only the
caller's rows; repeat upsert keeps one row); page tests `src/app/(app)/feed/page.test.tsx` and
`albums/[id]/page.test.tsx` (ids passed to `getMyDownloadedTrackIds`, `Feed` title, album `generateMetadata`).
Filename/signing tests live with [[media-storage]].

## What is deliberately NOT tested (agreed scope)

Pure presentational render tests for `SingleTrackRow`/`AlbumRow` layout and `AppShell`'s
player mount are intentionally skipped — the player state machine, the feed queue logic, and
the data layer carry the meaningful coverage. `AppShell.test.tsx` covers only the
label-member Admin nav link ([[admin-upload]]). If you add feature logic to these
components, add tests for the logic (not just render).

## Running

- Unit only (no DB): `yarn test --run src/components/Player src/components/Feed`
- Vitest runs two projects: `unit` (parallel) and `db` (serial; every `*.data.test.ts` plus the `dbTests` list in `vitest.config.mts`). See [[catalog-schema]] `References/local-workflow.md`.
- Data layer: ensure `yarn supabase start` is up, then
  `yarn test --run src/lib/supabase/feed.data.test.ts src/lib/supabase/albums.data.test.ts`
- Everything: `yarn test --run` (data tests fail on connection if Supabase is down — that's
  environment, not a regression).
- Also gate on `yarn lint` and `yarn build` (Next build type-checks; it excludes test files,
  so a pre-existing `tsc --noEmit` error in `actions.test.ts` does not break the build).
