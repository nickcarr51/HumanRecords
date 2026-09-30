# Reference: Testing this feature

## What is tested

**Player state machine** — `src/components/Player/PlayerProvider.test.tsx` (unit,
React Testing Library). jsdom has no media playback, so `beforeAll` stubs
`HTMLMediaElement.prototype.play/pause/load`. `getTrackStreamUrl` is mocked. A small
`Harness` component drives the actions. Covers: `toPlayerTrack` fallback; `playQueue` sets
current + requests signed URL; `next` advances + re-signs; `ended` auto-advances; `next()`
end-of-queue no-op; `prev()` back-nav; signing error → `status:"error"` (never stuck on
loading); autoplay-block → off loading; `toggle()` plays; and `toggle()` no-op + `src`
cleared after an error.

**PlayerBar** — `src/components/Player/PlayerBar.test.tsx` (unit). Mocks `usePlayer`. Covers:
null render on empty queue; title/artist; controls call actions; play vs pause icon by
`isPlaying`; scrubbing calls `seek`; error note; NaN/Infinity duration → slider `max="0"`.

**Data layer** — `src/lib/supabase/feed.data.test.ts` and `albums.data.test.ts`
(integration, `*.data.test.ts` convention). These require a **local Supabase** running
(`yarn supabase start`); `test-helpers.ts` refuses non-local URLs. They self-seed rows with
`createAdminClient`/`createTestUser`, sign in, exercise real queries, and clean up in
`afterEach`. Covers: releases newest first with album tracks + credits in `position`
order; tracks without a release excluded; uncredited single → empty `artistNames`;
pagination (`pageSize`/`hasMore`) — the tests give `releases.created_at` values that
contradict track creation order, proving ordering comes from `releases`; `getAlbum`
positive + null (missing + non-UUID) paths and position (not title) track order.

**Auth redirects** — `route-guard.test.ts`, `safe-next.test.ts`, `not-found.test.tsx`,
`middleware.test.ts`, `auth/confirm/route.test.ts` all assert the `/feed` targets.

## What is deliberately NOT tested (agreed scope)

Pure front-end component render tests for the feed rows (`FeedList`/`SingleTrackRow`/
`AlbumRow`) and `AppShell` were intentionally dropped as overkill for this stage — the
player state machine and data layer carry the meaningful coverage, and the play-on-click
wiring + empty states are checked in the manual smoke. `AppShell.test.tsx` was deleted (not
replaced) when the player was mounted. If you add feature logic to those components, add
tests for the logic (not just render).

## Running

- Unit only (no DB): `yarn test --run src/components/Player`
- Data layer: ensure `yarn supabase start` is up, then
  `yarn test --run src/lib/supabase/feed.data.test.ts src/lib/supabase/albums.data.test.ts`
- Everything: `yarn test --run` (data tests fail on connection if Supabase is down — that's
  environment, not a regression).
- Also gate on `yarn lint` and `yarn build` (Next build type-checks; it excludes test files,
  so a pre-existing `tsc --noEmit` error in `actions.test.ts` does not break the build).
