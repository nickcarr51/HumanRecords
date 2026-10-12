# Reference: Testing this feature

## What is tested

**Player state machine** — `src/components/Player/PlayerProvider.test.tsx` (unit,
React Testing Library). jsdom has no media playback, so `beforeAll` stubs
`HTMLMediaElement.prototype.play/pause/load`. `getTrackStreamUrl` and the feed actions are
mocked. A small `Harness` component drives the actions through `usePlayer()`. Covers:
`toPlayerTrack` fallback; **"plays the signed R2 URL directly on a CORS-enabled audio
element"** (asserts `audio.src` is exactly the mocked signed URL and `audio.crossOrigin ===
"anonymous"` — the guard against anyone reintroducing a proxy route or dropping
`crossOrigin`); `playQueue` sets current + requests signed URL; `next` advances + re-signs;
`ended` auto-advances; `next()` at the end of a queue that can't extend is a no-op; `prev()`
back-nav; signing error → `status:"error"` (never stuck on loading); a rejected action call
treated as a signing error; autoplay-block → off loading; `toggle()` plays; `toggle()` no-op
+ `src` cleared after an error; superseded `moveTo`/`play()` races. The Web Audio meter is
**not** exercised here: jsdom has no `AudioContext`, so `useAudioMeterSource.enable` returns
early on its `typeof AudioContext === 'undefined'` check. There is no test of the analyser
graph; verify waveform/particles in a browser.

**PlayerBar** — `src/components/Player/PlayerBar.test.tsx` (unit). Mocks **both**
`usePlayer` and `usePlayerTime` (`vi.mock("./PlayerProvider", () => ({ usePlayer: vi.fn(),
usePlayerTime: vi.fn() }))`; a `state()` helper routes `currentTime`/`duration` to the time
mock and everything else to the player mock) and stubs `HTMLCanvasElement.prototype.getContext`
to `null` so `PixelWaveform` bails out. Covers: null render on empty queue; title/artist;
controls call actions; play vs pause by `isPlaying` plus the `Playing`/`Paused` waveform label
(and that the label precedes the prev button); scrubbing calls `seek`; error note;
NaN/Infinity duration → slider `max="0"`.

**Waveform** — `src/components/Player/PixelWaveform.test.tsx`: provides a fake
`AudioWaveformContext` sampler, stubs `getContext` with a recording 2D context and
`requestAnimationFrame`/`cancelAnimationFrame`, and asserts the sampler is read and >32
`fillRect`s are drawn while `playing`, and that when paused the sampler is not called and
exactly 32 (one dim pixel per column) are drawn.

**Accordion** — `src/components/Feed/PixelAccordion.test.tsx`: stubs `matchMedia`, `rAF`
(captures the frame callback so the test can drive it), `cancelAnimationFrame` and
`getContext`; asserts a body-level canvas appears on open, pixels are emitted even when the
first frame arrives late, the canvas is removed and `cancelAnimationFrame` called on unmount,
and that no canvas is created under `prefers-reduced-motion`.

**Data layer** — `src/lib/supabase/feed.data.test.ts` and `albums.data.test.ts`
(integration, `*.data.test.ts` convention). These require a **local Supabase** running
(`yarn supabase start`); `test-helpers.ts` refuses non-local URLs. They self-seed rows with
`createAdminClient`/`createTestUser`, sign in, exercise real queries, and clean up in
`afterEach`. Covers: releases pinned first, then `sort_at` with album tracks + credits in `position`
order; tracks without a release excluded; uncredited single → empty `artistNames`;
pagination (`pageSize`/`hasMore`) — the tests give `releases.created_at` values that
contradict track creation order, proving ordering comes from `releases`; every item, album
track and `AlbumDetail` has a `catalogNumber > 0`; `getAlbum`
positive + null (missing + non-UUID + archived) paths and position (not title) track order; feed pinned/`sort_at` order and archived items hidden; `feed-page-size.test.ts` (unit) for `FEED_PAGE_SIZE`; `feed-query.data.test.ts` for search (`q`), counts/`totalPages` and past-the-end totals; `feed-after-release.data.test.ts` for `getReleaseFeedPage`/`getFeedAfterRelease` (albums and singles, archived → null).
`src/lib/supabase/catalog-numbers.data.test.ts` (using `release-admin-fixtures.ts`) proves
`catalog_number` is assigned on insert, increasing, survives a title edit and rejects a
manual renumber — the invariant the required `catalogNumber` fields rely on ([[catalog-schema]]).

**Queue + lock screen** — `queue.test.ts` (pure queue functions, dedup; `toPlayerTrack`
preserves `catalogNumber` and carries `page`; fixtures include `catalogNumber` on every
`FeedItem`/`FeedTrack`), `PlayerProvider.test.tsx` (paging, retries, pre-sign, album and finished-search continuation into the main feed), `useMediaSession.test.tsx`.

**Auth redirects** — `route-guard.test.ts`, `safe-next.test.ts`, `not-found.test.tsx`,
`middleware.test.ts`, `auth/confirm/route.test.ts` all assert the `/feed` targets.

**Feed play wiring** — `src/components/Feed/FeedList.test.tsx` (unit). Mocks `usePlayer`
(keeps the real `toPlayerTrack`), `@/components/Downloads` and `next/link`. Queries buttons by
the listener aria-labels (`Play pack` / `Pause pack`, `Play <title>` / `Pause <title>`,
`Expand tracks`). Covers the feed-wide queue and offsets
(single, album, and a track inside an expanded album each start at the right index) and the
`usePlayButton` rules: pause shown for the current track and toggles instead of restarting,
paused current track resumes, album button reflects any of its tracks, clicks ignored while
loading, errored track retries via `playQueue`. Also asserts rows pass their `source`.
**Accordion a11y pattern** ("links the accordion toggle to its panel and disables collapsed
controls"): find the toggle by name, resolve its panel via
`document.getElementById(toggle.getAttribute('aria-controls'))`, assert `inert` +
`aria-hidden="true"` while collapsed and that a track's play button is absent; click → `aria-expanded="true"`, panel not `inert`, `Play NIGHT SHIFT` present; click again → collapsed
attributes back and the track button gone (children unmount synchronously in jsdom because
`matchMedia` is undefined there, which `PixelAccordion` treats like reduced motion).
`AlbumTracks.test.tsx` covers the album-page source (`{ kind: "album", albumId }`).

**Feed page** — `src/app/(app)/feed/page.test.tsx` (redirect past the end keeping `q`, trimmed
`q`, past-the-end empty search → its page 1, empty search on page 1 not redirected), `params.test.ts` (`parsePage`),
`src/components/Feed/FollowPlayingPage.test.tsx` (follows only from the viewed page with the
same `q`; deferred while hidden). `Pagination`/`SearchInput` tests live with the components in
`src/components/` ([[artists-read]]).

**Catalog id** — `src/components/CatalogId/CatalogId.test.tsx`: `HS001`, `HSS012`, `HS1001`
(no truncation) via the `Album catalog …`/`Track catalog …` labels; nothing rendered without a number.

**Downloads** — `src/components/Downloads/DownloadsProvider.test.tsx` (seeded ids,
mark flips every consumer, new `initialIds` on rerender unioned with local marks, no-provider fallback);
`DownloadButton.test.tsx` (the idle/downloaded states are told apart by **aria-label** — the glyphs are
`aria-hidden` SVGs, not text, so never assert on "↓"/"✓" — spinner + double-tap ignored, success marks + navigates via mocked
`navigate.ts`, `{ error }` and thrown action → toast, state unchanged);
`src/components/Feed/AlbumTracks.downloads.test.tsx` (real button in real rows: seeded downloaded state, and no
ToastProvider/DownloadsProvider → renders and survives a failed download); `FeedList.test.tsx` (every single
and expanded album track has a download button, Downloads mocked); `src/lib/supabase/downloads.test.ts`
(`feedTrackIds`, empty → no query, chunks of 100, error → `[]`) and `downloads.data.test.ts` (RLS: only the
caller's rows; repeat upsert keeps one row); page tests `src/app/(app)/feed/page.test.tsx` and
`albums/[id]/page.test.tsx` (ids passed to `getMyDownloadedTrackIds`, `Feed` title, album `generateMetadata`).
Filename/signing tests live with [[media-storage]].

## The jsdom stub recipe for the visual pieces

The general recipe (and the reasoning) is documented in [[visual-effects]] (`References/testing.md`)
and summarised in [[component-library]]; the files in this feature that use it are
`PlayerBar.test.tsx`, `PixelWaveform.test.tsx`, `PixelAccordion.test.tsx` and (indirectly, through
`PlaybackButton`) `FeedList.test.tsx` / `AlbumTracks*.test.tsx`. In short:

```ts
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);          // effect bails out
// or a recording context: { scale, clearRect, fillRect, fillStyle: '', globalAlpha: 1 }
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { draw = cb; return 1; });
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('matchMedia', () => ({ matches: false }));                              // or true for reduced motion
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
```

Render through `renderWithTheme` (`src/test/renderWithTheme.tsx`; `{ dark: true }` for the amber
theme) — `PixelWaveform`, `PlaybackButton`, `PixelAccordion` and `SweepIcon` all read the theme.
`AudioContext` is never stubbed: the meter stays off in tests and the canvas components receive
their samplers through `AudioMeterContext` / `AudioWaveformContext` providers instead.

## What is deliberately NOT tested (agreed scope)

Pure presentational render tests for `SingleTrackRow`/`AlbumRow` layout and `AppShell`'s
player mount are intentionally skipped — the player state machine, the feed queue logic, and
the data layer carry the meaningful coverage. `AppShell.test.tsx` covers only the
label-member Admin nav link ([[admin-upload]]). The Web Audio graph, the particle look, and
iOS lock-screen behaviour (never worked; cause unknown) are browser/device checks, not unit tests.
If you add feature logic to these components, add tests for the logic (not just render).

## Running

- Unit only (no DB): `yarn test --run src/components/Player src/components/Feed src/components/CatalogId`
- Vitest runs two projects: `unit` (parallel) and `db` (serial; every `*.data.test.ts` plus the `dbTests` list in `vitest.config.mts`). See [[catalog-schema]] `References/local-workflow.md`.
- Data layer: ensure `yarn supabase start` is up, then
  `yarn test --run src/lib/supabase/feed.data.test.ts src/lib/supabase/albums.data.test.ts src/lib/supabase/catalog-numbers.data.test.ts`
- Everything: `yarn test --run` (data tests fail on connection if Supabase is down — that's
  environment, not a regression).
- Also gate on `yarn lint` and `yarn build` (Next build type-checks; it excludes test files,
  so a pre-existing `tsc --noEmit` error in `actions.test.ts` does not break the build).
- Playback itself (CORS, meter, lock screen) needs a browser against a bucket with the CORS
  rule applied: `yarn dev` + the local bucket (`infra/r2/README.md`).
