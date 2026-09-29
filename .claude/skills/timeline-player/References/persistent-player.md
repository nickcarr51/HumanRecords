# Reference: The persistent player

Files: `src/components/Player/PlayerProvider.tsx`, `src/components/Player/PlayerBar.tsx`,
`src/components/Player/index.ts` (barrel, re-exported from `src/components/index.ts`).

## Provider + hook

`PlayerProvider` is a client component (`'use client'`) that owns:

- one `<audio>` ref (rendered once, hidden, `preload="metadata"`),
- state: `queue: PlayerTrack[]`, `currentIndex`, `isPlaying`, `currentTime`, `duration`,
  `status: "idle" | "loading" | "playing" | "error"`,
- actions exposed via `usePlayer()`: `playQueue(tracks, startIndex?)`, `toggle()`,
  `next()`, `prev()`, `seek(seconds)`.

`PlayerTrack = { id; title; artistName }`. Convert feed/album data with
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
4. On success: `audio.src = url`, `audio.play()`. `.then` → `status: "playing"`;
   `.catch` (autoplay blocked / interrupted) → `status: "idle"`, `isPlaying: false`
   (ready-but-paused, never stuck on "loading").

A `cancelled` flag guards every state write so a fast `next()`/`prev()` can't let a stale
signed URL win the race.

## Media-element event listeners

A separate `useEffect` (dep `[next]`) attaches/detaches listeners with 1:1 symmetry:
`timeupdate`→currentTime, `loadedmetadata`→duration (guarded finite), `play`→playing,
`pause`→`isPlaying:false`, `ended`→`setIsPlaying(false)` then `next()`, `error`→`status:error`.

## Action semantics

- `next()` clamps at the end of the queue (no-op on the last track).
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

## Gotchas

- jsdom doesn't implement `HTMLMediaElement.play/pause/load` — tests stub them (see
  [testing.md](testing.md)); `audio.paused` stays `true` in jsdom.
- The player is server-action-adjacent but fully client-side; never import `@/lib/storage/*`
  modules (they read the R2 secret) into it — only call the `getTrackStreamUrl` action.
