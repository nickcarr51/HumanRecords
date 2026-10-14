# Reference: The persistent player

Files: `src/components/Player/PlayerProvider.tsx`, `src/components/Player/peaks.ts`,
`src/components/Player/audioMeter.ts` (contexts, hooks, `isTouchDevice`, desktop `useAudioMeterSource`),
`src/components/Player/PlayerBar.tsx`, `src/components/Player/PixelWaveform.tsx`,
`src/components/Player/PlaybackButton.tsx`, `src/components/Player/{PlaybackIcon,SweepIcon}.tsx`,
`src/components/Player/queue.ts`, `src/components/Player/useMediaSession.ts`,
`src/components/Player/index.ts` (barrel, re-exported from `src/components/index.ts`),
`src/lib/feed/actions.ts`, `src/components/Feed/FollowPlayingPage.tsx`.

## Playback path (read this before touching `<audio>`)

```
click → playQueue(...)            (client)
      → load effect               (PlayerProvider)
      → getTrackStreamUrl(trackId) (server action, src/lib/storage/actions.ts; see [[media-storage]])
      → presigned R2 URL (2 h)    ({ url, error }, never throws to the client)
      → audio.src = url; play()   (the single <audio preload="metadata">; CORS mode on desktop, plain on touch)
```

- The browser fetches the presigned URL **directly from R2**. There is no proxy / stream API
  route in this app and no feature flag choosing between modes; if you find a reference to
  `/api/tracks/[id]/stream` or `NEXT_PUBLIC_AUDIO_REACTIVITY`, it is stale.
- On **desktop** an effect in `PlayerProvider` sets `audio.crossOrigin = 'anonymous'` (the
  live analyser needs it), so the media request is CORS mode and needs the bucket's `GET`
  rule for the site origin (the existing rule covers it). On **touch devices** the effect
  removes it: the element is plain, the request is no-CORS, and playback does not depend on
  bucket CORS. **Never** add `crossOrigin` or an `AudioContext` on touch devices: it silences
  iOS background playback. The rules in
  `infra/r2/cors.{local,dev,prod}.json` (status table in `infra/r2/README.md`) also matter
  for the touch peaks `fetch`, a cross-origin `GET`: a bucket without `GET`
  for the site origin leaves the touch waveform on idle dots. Downloads
  (navigation) and `<img>` artwork do not need CORS.
- Debug order when a track won't play on one environment: (1) `getTrackStreamUrl` returning
  `{ error }` (missing object, env vars — [[media-storage]]), (2) autoplay (the player lands in `status: "idle"`, not
  `"error"`, when `play()` is blocked).

## Provider + hooks

`PlayerProvider` is a client component (`'use client'`) that owns:

- one `<audio>` ref (rendered once, hidden, `preload="metadata"`; `crossOrigin="anonymous"` only on desktop, set by an effect),
- state: `queueState: { tracks: PlayerTrack[]; index; source }`, `isPlaying`, `currentTime`,
  `duration`, `status: "idle" | "loading" | "playing" | "error"`,
- the meter: `readLevel`, `readWaveform`, provided via `AudioMeterContext` /
  `AudioWaveformContext` — from `useAudioMeterSource` on desktop, from
  `usePeaks(peakTrackId)` → `usePeakReaders(audioRef, peaks)` on touch.

It exposes **two contexts** — pick the right one:

| Hook | Value | Re-renders when |
|---|---|---|
| `usePlayer()` | `queue`, `currentIndex`, `currentTrack`, `source`, `isPlaying`, `status`, `playQueue(tracks, startIndex?, source?)`, `toggle()`, `next()`, `prev()`, `seek(seconds)` | the queue, track, play state or status changes (the value is `useMemo`d, so a time tick hands consumers the same object) |
| `usePlayerTime()` | `{ currentTime, duration }` | every `timeupdate` (~4×/s) and `loadedmetadata` |

**Rule:** anything that only needs track / playing / status — every play button
(`usePlayButton`), `FollowPlayingPage`, the Media Session hook — must call `usePlayer()` and
**must not** call `usePlayerTime()`. Only the scrubber in `PlayerBar` needs the time. Before
the split, `currentTime` lived on the one context and every play button on the page
re-rendered four times a second during playback; `PixelAccordion` unmounting collapsed
rows (see routing-and-auth.md) is the other half of that fix. Both hooks throw outside the
provider. A component that needs both (PlayerBar) calls both.

Two more contexts come from `audioMeter.ts` and are provided by the same tree:
`AudioMeterContext` (`useAudioMeter()` → `readLevel` or `null`) and `AudioWaveformContext`
(`useAudioWaveform()` → `readWaveform` or `null`). They hand out stable functions, never
per-frame values, so reading them causes no React updates.

`PlayerTrack = { id; catalogNumber?; title; artistName; page?; from? }` (`page` = the feed
page it came from, absent on the album page; `from` = its `ReleaseRef`). Convert feed/album
data with `toPlayerTrack({ id, catalogNumber?, title, artistNames }, page?, from?)` — it
joins names or falls back to `"Unknown Artist"` and copies `catalogNumber` through when
present (PlayerBar's `CatalogId` reads it; `feedQueue` always passes it because
`FeedTrack`/`FeedItem` carry it).

## The load-and-play effect (the core)

A `useEffect` keyed on `[currentTrack]` does the work whenever the selected track changes
(unless `moveTo` already started it from a pre-signed URL — `startedRef`):

1. `setStatus("loading")`, reset time/duration, and **`audioRef.current?.pause()`** — stop
   the previous track immediately so audio never overlaps during the async URL fetch.
2. Use the fresh pre-signed URL if there is one, else `await getTrackStreamUrl(currentTrack.id)` —
   the server action returns `{ url, error }` (never throws to the client); a rejected call
   (network loss, stale action id) is caught and treated as `{ url: null, error }`. The client
   only ever sends a `trackId`; the object key is resolved server-side (see [[media-storage]]).
3. On `{ error }` / no url: **clear the element** (`removeAttribute("src")` + `load()`),
   `setStatus("error")`, `setIsPlaying(false)`. Clearing src is important — otherwise a
   later `toggle()` would resume the *previous* track under the failed track's title.
4. On success: `startAudio(url, isCurrent)` (the shared helper: `audio.src = url`, `audio.play()`). `.then` → `status: "playing"`;
   `.catch` (autoplay blocked / interrupted) → `status: "idle"`, `isPlaying: false`
   (ready-but-paused, never stuck on "loading").

A `cancelled` flag guards every state write so a fast `next()`/`prev()` can't let a stale
signed URL win the race.

## Media-element event listeners

A separate `useEffect` (dep `[goNext]`) attaches/detaches listeners with 1:1 symmetry:
`timeupdate`→currentTime, `loadedmetadata`→duration (guarded finite), `play`→`isPlaying:true` +
`status:"playing"`, `pause`→`isPlaying:false`, `ended`→`setIsPlaying(false)` then `goNext(true)`,
`error`→`status:"error"`, `isPlaying:false` (a failed load lands here).

## Action semantics

- `next()` moves on, fetching the next page first when the queue ends but can be extended (see
  "Queue sources and paging"); with nothing after it, it is a no-op.
- `prev()` restarts the current track if `currentTime > 3`, else goes to the previous track.
- `toggle()` reads `audio.paused`: paused → `play()`, else `pause()`. `play()` is a **no-op
  while `status === "error"`** (nothing valid is loaded; src was cleared).
- `seek(s)` sets `audio.currentTime` and mirrors it into state.

## Meter: live on desktop, stored peaks on touch (`audioMeter.ts`, `peaks.ts`)

End-to-end (format, upload, Analyze all, reader math, tuning, CORS, troubleshooting): see
[[waveform]]. What this provider does:

- `const live = useAudioMeterSource(audioRef)`; `live.supported` is `!isTouchDevice()`.
- An effect sets `audio.crossOrigin = 'anonymous'` on desktop and removes the attribute on
  touch.
- `enableMeter()` (`live.enable`) runs at the top of `playQueue` and `play` (desktop only does
  anything; it bails unless `crossOrigin` is `'anonymous'`).
- Touch only: `onPlaying` (the `<audio>` **'playing'** event) records the current track id as
  started; `peakTrackId` is that id while it still equals `currentTrack.id`, so
  `usePeaks(peakTrackId)` is never queued ahead of `getTrackStreamUrl` and a quick skip leaves
  no stale request. The load effect resets the started mark on every track change (going back
  to the last-played track waits for its own 'playing'). Desktop leaves `peakTrackId`
  `undefined` and never fetches peaks.
- `readLevel` / `readWaveform` = `live.*` on desktop, `peakReaders.*` on touch. On touch both
  are `null` until the track's peaks load; on desktop they are non-null inside the provider.

Consumers:

- `PlayerBar` → `<PixelWaveform playing status>`: a 24 px-tall canvas, 96 px wide on desktop and stretched to the row (`ResizeObserver`, columns = width/3) ≤ `md`, with
  32 pixel columns, redrawn at ≤30 fps via `requestAnimationFrame` while `playing`; each
  column's height is the peak of its slice of `readWaveform()`. Paused → one static dim
  frame; `document.hidden` → no sampling; `prefers-reduced-motion` → no animation loop. It
  also renders the text label `Playing` / `Paused` / `Loading` / `Error` from `status`.
- `PlaybackButton` (`active` prop) — the circular play/pause button used by **every** play
  control (PlayerBar, `AlbumRow`, `SingleTrackRow`, `AlbumTracks`). While `active` it tints
  accent (`withAlpha` glow) and mounts a 130 px `<canvas>` of particles whose emission rate
  is `readLevel()`; the loop stops when not active, when `useAudioMeter()` is `null`, or under
  `prefers-reduced-motion`. `PlaybackIcon playing` is the ▶ / ❚❚ SVG; `SweepIcon` is the SVG
  wrapper that reveals an accent copy left-to-right on the parent's `:hover` via
  `--hover-progress` (`iconSweepStyles` in `src/components/field/hoverStyles.ts`,
  [[component-library]]). Prev/next in the bar, the chevron, the open-pack arrow and the
  download glyphs all use `SweepIcon`.

Symptoms: **waveform not moving / no particles while audio plays** → see [[waveform]]
Troubleshooting (desktop: `enable()` bailed / context suspended; touch: no `peaks/<id>.bin` →
Analyze all, `getTrackPeaksUrl` null, CORS `GET`, or not 'playing' yet). **Nothing plays at
all** → signing/object problem, or on desktop a bucket without CORS `GET` (see above).

Known gap: **iOS lock-screen playback has never worked** — the audio stops when the phone
locks and no lock-screen controls appear, on every version of the app (owner-confirmed
2026-10-11). It predates Web Audio and is unrelated to it (touch devices never use it). Cause unknown; see the Known deferrals list in SKILL.md for the
investigation plan. Switching apps *does* keep playing. Tests can't cover any of this —
jsdom has no lock state.

## PlayerBar

Fixed bottom bar (rendered in `AppShell` below `<Main>`, inside `ToastProvider`), consumes
`usePlayer()` **and** `usePlayerTime()`:

- Renders `null` when there is no `currentTrack`.
- Layout: a 3-column grid `1fr auto 1fr` — `Meta` (`<CatalogId kind="track" number={currentTrack.catalogNumber}>`
  → `HSS###`, title, artist or the error note), `Controls` (`PixelWaveform`, prev `IconButton`,
  `PlaybackButton` + `PlaybackIcon`, next `IconButton`), `Scrubber` (time, `<input type="range">`,
  duration). Below `theme.breakpoints.md` it collapses to one column (`Transport` groups prev/play/next, `min-width: 0` guards overflow): controls span
  the row with `space-between`, the scrubber drops to its own full-width row, and the bottom
  padding respects `env(safe-area-inset-bottom)`.
- Play/pause chrome is driven by **`isPlaying`**, not `status` (`aria-label` "Play"/"Pause";
  `PlaybackButton active={isPlaying && status !== "error"}`). Always key play-state UI off `isPlaying`.
- Scrubber guards non-finite duration: `HTMLMediaElement.duration` is `NaN` before
  `loadedmetadata`, so `max`/`value` are clamped to a finite `safeDuration`
  (otherwise React renders `max="NaN"`).
- Shows "Couldn't play this track." in place of the artist when `status === "error"`.
- Button aria-labels: "Previous track", "Play"/"Pause", "Next track", slider "Seek".

## Queue sources and paging

Pure model in `queue.ts` (no `'use client'`, so server actions build `PlayerTrack`s with it too);
state and effects in `PlayerProvider`.

- **`QueueSource`** says where the queue came from and so what follows its last track:
  `{ kind: "feed", q, lastPage, hasMore }` (next page of the same search; a search with non-empty `q`
  and no more pages continues into the main feed after its last release), `{ kind: "album", albumId }`
  (album page: continues into the feed after that album), `{ kind: "none" }` (ends). `playQueue`
  takes it as the third arg; `canExtend(source)` is true for a feed with `hasMore`, for a finished
  search (`isFinishedSearch`) and for an album. A plain feed (`q: ""`) with no more pages ends.
  `advance(state)` returns `moved | needsMore | end`.
- **`PlayerTrack.from`**: `feedQueue` tags every track with its release (`ReleaseRef`: album tracks
  `{ kind: "album", albumId }`, singles `{ kind: "single", trackId }`). A finished search continues
  after the *last queued track's* `from`; a track without `from` just ends the queue.
- **Prefetch**: an effect fires `extend()` as soon as the *last loaded* track starts, not when it ends
  (a locked phone may not get to run anything then). One request in flight (`extendingRef`);
  concurrent callers share it. The background prefetch stops after 3 consecutive fetches that add
  nothing for the same queue length (`goNext` can still fetch). `extend()` calls `loadFeedPage({ q, page: lastPage + 1 })` or
  `continueAfterRelease(ref)` (finished search: the last track's `from`; album: `{ kind: "album",
  albumId }`) (server actions in `src/lib/feed/actions.ts`, which return
  `{ tracks, page, hasMore, error }` and never throw).
- **`genRef`**: bumped by every `playQueue`. Any async result (extend, pre-sign, `startAudio`) from an
  older generation is dropped, so a slow page can't land in a newer queue.
- **`appendPage`** skips tracks already queued (a release published or moved mid-session shifts the
  pages, so a track can reappear) and records `lastPage`/`hasMore`. Its optional `q` arg says which
  search the page came from; `extend()` passes `""` for a continuation, so afterwards the source is
  the plain feed and later pages come from the main feed. If a page adds nothing,
  `goNext` fetches again, up to `MAX_EXTEND_ATTEMPTS` (3), then stops.
- **Pre-sign**: an effect signs the *next* track's URL (`presignedRef`, `{ trackId, url, at }`).
  It is kept only if that track is still next when the result arrives. A pre-signed URL older than
  `PRESIGN_MAX_AGE_MS` (60 min; stream URLs live 2 h) is ignored and signed again.
- **`moveTo`**: if the new track has a fresh pre-signed URL it sets `audio.src` and calls `play()`
  right there, inside the `ended` (or click) handler, and marks `startedRef` so the load effect does
  not load it twice. Reason: on a locked iPhone, playback started after an awaited network call
  outside the handler can be blocked; starting synchronously in `ended` keeps it alive.
- **Album / search to feed handoff**: the album page passes `{ kind: "album", albumId }`; a search
  queue that runs out uses its last track's `from`. `continueAfterRelease` (`getFeedAfterRelease`)
  returns the rest of that release's main-feed page, or the next page if it was last; tracks already
  queued are skipped, and the source becomes `{ kind: "feed", q: "" }`. An archived/missing release
  returns nothing, so the queue stops. The search view does not move (`FollowPlayingPage` compares
  the viewed `q` with the source `q`).
- **Media Session** (`useMediaSession`): metadata (title, artist, fixed artwork
  `/human_records_main_logo.png` for every track), `playbackState`, handlers for play, pause,
  previoustrack, nexttrack and seekto (registered once, reading the latest callbacks through a ref;
  unsupported actions are swallowed), and `setPositionState` on loadedmetadata/play/pause/seeked/
  ratechange. Every part is skipped where `navigator.mediaSession` is missing. Reads the
  `<audio>` element directly for position, not `usePlayerTime`.
- **`FollowPlayingPage`** (on `/feed`): when playback crosses from the viewed page to the next one
  (`from === viewedPage && playing === from + 1`, same `q`), `router.replace` the view to that page.
  Viewing any other page or search is never moved. While `document.hidden` the move is deferred:
  on `visibilitychange` it goes to wherever the music got to. Uses `usePlayer()` only.

## Gotchas

- **A bucket without `GET` CORS breaks desktop playback and the touch visuals.** Desktop
  playback is CORS mode (`crossOrigin`); touch playback is not, but the touch peaks `fetch` is
  cross-origin. After any CORS or domain change re-check `infra/r2/README.md` and confirm
  desktop plays and the touch waveform moves on that environment. The
  `media-storage` skill owns the CORS files; this skill owns the consequence.
- **Don't call `usePlayerTime()` from anything that isn't the scrubber.** It re-renders on
  every `timeupdate`.
- jsdom doesn't implement `HTMLMediaElement.play/pause/load` — tests stub them (see
  [testing.md](testing.md)); `audio.paused` stays `true` in jsdom. The readers are pure functions of a peaks
  `Uint8Array` and are tested in `peaks.test.tsx` (inject `load` into `usePeaks`);
  `PixelWaveform`/`PlaybackButton` tests inject `AudioWaveformContext`/`AudioMeterContext`
  values and stub `HTMLCanvasElement.prototype.getContext`, `requestAnimationFrame` and `matchMedia`.
- Never create an `AudioContext` or set `crossOrigin` on the `<audio>` on touch devices (iOS
  background playback); only `useAudioMeterSource` does so, on desktop. Read via `useAudioMeter()`/`useAudioWaveform()`.
- The player is server-action-adjacent but fully client-side; never import `@/lib/storage/*`
  modules (they read the R2 secret) into it — only call the `getTrackStreamUrl` action.
