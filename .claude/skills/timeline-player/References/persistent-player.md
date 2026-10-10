# Reference: The persistent player

Files: `src/components/Player/PlayerProvider.tsx`, `src/components/Player/PlayerBar.tsx`,
`src/components/Player/queue.ts`, `src/components/Player/useMediaSession.ts`,
`src/components/Player/index.ts` (barrel, re-exported from `src/components/index.ts`),
`src/lib/feed/actions.ts`, `src/components/Feed/FollowPlayingPage.tsx`.

## Provider + hook

`PlayerProvider` is a client component (`'use client'`) that owns:

- one `<audio>` ref (rendered once, hidden, `preload="metadata"`),
- state: `queue: PlayerTrack[]`, `currentIndex`, `isPlaying`, `currentTime`, `duration`,
  `status: "idle" | "loading" | "playing" | "error"`,
- actions exposed via `usePlayer()`: `playQueue(tracks, startIndex?, source?)`, `toggle()`,
  `next()`, `prev()`, `seek(seconds)`.

`PlayerTrack = { id; title; artistName; page? }` (`page` = the feed page it came from; absent on the album page). Convert feed/album data with
`toPlayerTrack({ id, title, artistNames })` — it joins names or falls back to
`"Unknown Artist"`. `usePlayer()` throws if used outside the provider.

## The load-and-play effect (the core)

A `useEffect` keyed on `[currentTrack]` does the work whenever the selected track changes:

1. `setStatus("loading")`, reset time/duration, and **`audioRef.current?.pause()`** — stop
   the previous track immediately so audio never overlaps during the async URL fetch.
2. `await getTrackStreamUrl(currentTrack.id)` — the server action returns
   `{ url, error }` (never throws to the client). The client only ever sends a `trackId`;
   the object key is resolved server-side (see [[media-storage]]).
3. On `{ error }` / no url: **clear the element** (`removeAttribute("src")` + `load()`),
   `setStatus("error")`, `setIsPlaying(false)`. Clearing src is important — otherwise a
   later `toggle()` would resume the *previous* track under the failed track's title.
4. On success: `startAudio(url, isCurrent)` (the shared helper: `audio.src = url`, `audio.play()`). `.then` → `status: "playing"`;
   `.catch` (autoplay blocked / interrupted) → `status: "idle"`, `isPlaying: false`
   (ready-but-paused, never stuck on "loading").

A `cancelled` flag guards every state write so a fast `next()`/`prev()` can't let a stale
signed URL win the race.

## Media-element event listeners

A separate `useEffect` (dep `[next]`) attaches/detaches listeners with 1:1 symmetry:
`timeupdate`→currentTime, `loadedmetadata`→duration (guarded finite), `play`→playing,
`pause`→`isPlaying:false`, `ended`→`setIsPlaying(false)` then `next()`, `error`→`status:error`.

## Action semantics

- `next()` moves on, fetching the next page first when the queue ends but can be extended (see
  "Queue sources and paging"); with nothing after it, it is a no-op.
- `prev()` restarts the current track if `currentTime > 3`, else goes to the previous track.
- `toggle()` is a **no-op while `status === "error"`** (nothing valid is loaded); otherwise
  plays if paused / pauses if playing.
- `seek(s)` sets `audio.currentTime` and mirrors it into state.

## PlayerBar

Fixed bottom bar (rendered in `AppShell` below `<Main>`), consumes `usePlayer()`:

- Renders `null` when the queue is empty.
- Play/pause chrome is driven by **`isPlaying`**, not `status` (a manual pause leaves
  `status:"playing"` — a known cosmetic quirk; always key play-state UI off `isPlaying`).
- Scrubber `<input type="range">` guards non-finite duration: `HTMLMediaElement.duration`
  is `NaN` before `loadedmetadata`, so `max`/`value` are clamped to a finite `safeDuration`
  (otherwise React renders `max="NaN"`).
- On phones (`<= theme.breakpoints.sm`) the scrubber drops to its own full-width row.
- Shows a short error note when `status === "error"`.

## Queue sources and paging

Pure model in `queue.ts` (no `'use client'`, so server actions build `PlayerTrack`s with it too);
state and effects in `PlayerProvider`.

- **`QueueSource`** says where the queue came from and so what follows its last track:
  `{ kind: "feed", q, lastPage, hasMore }` (next page of the same search), `{ kind: "album", albumId }`
  (album page: continues into the feed after that album), `{ kind: "none" }` (ends). `playQueue`
  takes it as the third arg; `canExtend(source)` is true for a feed with `hasMore` and for an album.
  `advance(state)` returns `moved | needsMore | end`.
- **Prefetch**: an effect fires `extend()` as soon as the *last loaded* track starts, not when it ends
  (a locked phone may not get to run anything then). One request in flight (`extendingRef`);
  concurrent callers share it. `extend()` calls `loadFeedPage({ q, page: lastPage + 1 })` or
  `continueAfterAlbum(albumId)` (server actions in `src/lib/feed/actions.ts`, which return
  `{ tracks, page, hasMore, error }` and never throw).
- **`genRef`**: bumped by every `playQueue`. Any async result (extend, pre-sign, `startAudio`) from an
  older generation is dropped, so a slow page can't land in a newer queue.
- **`appendPage`** skips tracks already queued (a release published or moved mid-session shifts the
  pages, so a track can reappear) and records `lastPage`/`hasMore`. If a page adds nothing,
  `goNext` fetches again, up to `MAX_EXTEND_ATTEMPTS` (3), then stops.
- **Pre-sign**: an effect signs the *next* track's URL (`presignedRef`, `{ trackId, url, at }`).
  It is kept only if that track is still next when the result arrives. A pre-signed URL older than
  `PRESIGN_MAX_AGE_MS` (60 min; stream URLs live 2 h) is ignored and signed again.
- **`moveTo`**: if the new track has a fresh pre-signed URL it sets `audio.src` and calls `play()`
  right there, inside the `ended` (or click) handler, and marks `startedRef` so the load effect does
  not load it twice. Reason: on a locked iPhone, playback started after an awaited network call
  outside the handler can be blocked; starting synchronously in `ended` keeps it alive.
- **Album to feed handoff**: the album page passes `{ kind: "album", albumId }`; when its last
  track ends, `continueAfterAlbum` (`getFeedAfterAlbum`) returns the rest of the album's feed page,
  or the next page if it was last, and the source becomes a feed source.
- **Media Session** (`useMediaSession`): metadata (title, artist, fixed artwork
  `/human_records_main_logo.png` for every track), `playbackState`, handlers for play, pause,
  previoustrack, nexttrack and seekto (registered once, reading the latest callbacks through a ref;
  unsupported actions are swallowed), and `setPositionState` on loadedmetadata/play/pause/seeked/
  ratechange. Every part is skipped where `navigator.mediaSession` is missing.
- **`FollowPlayingPage`** (on `/feed`): when playback crosses from the viewed page to the next one
  (`from === viewedPage && playing === from + 1`, same `q`), `router.replace` the view to that page.
  Viewing any other page or search is never moved. While `document.hidden` the move is deferred:
  on `visibilitychange` it goes to wherever the music got to.

## Gotchas

- jsdom doesn't implement `HTMLMediaElement.play/pause/load` — tests stub them (see
  [testing.md](testing.md)); `audio.paused` stays `true` in jsdom.
- The player is server-action-adjacent but fully client-side; never import `@/lib/storage/*`
  modules (they read the R2 secret) into it — only call the `getTrackStreamUrl` action.
