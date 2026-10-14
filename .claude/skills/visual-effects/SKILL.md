---
name: visual-effects
description: Use when adding, tuning, or debugging an ambient visual effect in Human Services — the CRT scanline/tracking canvas (`CRTTexture` in the root layout), image tears (`GlitchArt`), the sign-in glitch (`SignInGlitch`), pixel particles on feed accordions (`PixelAccordion`) and play buttons (`PlaybackButton`), the dot waveform (`PixelWaveform`), the stored-peaks audio readers (`src/components/Player/peaks.ts`: `usePeaks` / `usePeakReaders` / `levelAt` / `shimmer`, tuning constants `LEVEL_GAIN` / `WAVE_GAIN` / `WAVE_MIX`; `audioMeter.ts`: `useAudioMeter` / `useAudioWaveform`), hover sweeps (`SweepIcon`, `src/components/field/hoverStyles.ts`, `--hover-progress`), the `theme.effects.*` tokens and `withAlpha` / `rgbTriplet`, or the day/night View Transition roll. Also when a canvas keeps drawing after unmount, a background tab burns CPU, an effect ignores `prefers-reduced-motion`, links vanish in Windows High Contrast, a test logs "getContext not implemented", the waveform is flat while audio plays (the track has no `peaks/<id>.bin`; Analyze all on its release page), or a new page wants an effect.
---

# Visual Effects (ambient layer)

The "old display" feel layered over the gray/amber UI: a full-viewport CRT layer, pixel
particles that react to the music, horizontal tears on the sign-in screen, and sweep
hovers on text and icons. Built on `feat/playback-vector-icons` (2026-10-11). Every
effect is decoration: the app must read, play, and navigate identically with all of it
switched off (reduced motion, Safari, jsdom).

## The one thing to understand first

**Effects live in refs and canvases, never in React state.** Each one is a `useEffect`
that grabs a `2d` context, runs its own `requestAnimationFrame` (or timer) loop with
`let` locals, and returns a cleanup that cancels the loop, removes listeners, and removes
anything it appended to `document.body`. Nothing calls `setState` per frame; audio-driven
effects pull the level from a function (`useAudioMeter()`) instead of subscribing to a
value. If an effect re-renders React on every frame it is wrong, whatever it looks like.

## Pieces

| Concern | Where |
|---|---|
| Full-viewport scanlines + vignette + pulse (CSS, painted once) and the tracking sweep (one `element.animate()` on a fixed div); no render loop; mounted once in the root layout inside the styled registry | `src/components/CRTTexture/CRTTexture.tsx` (+ `.test.tsx`), `src/app/layout.tsx` |
| Horizontal image tears on hover (`<img>` + overlay canvas, never reads pixels) | `src/components/GlitchArt/GlitchArt.tsx` |
| Randomized tear bursts around the logo/heading/form on `/` and `/login` | `src/components/Login/SignInGlitch.tsx` (+ `.test.tsx`), `src/app/page.tsx`, `src/app/login/page.tsx` |
| Album-row expand/collapse with body-level particle canvas; `inert` + unmount when closed | `src/components/Feed/PixelAccordion.tsx` (+ `.test.tsx`), used by `Feed/AlbumRow.tsx` |
| Play/pause button with level-driven particles and accent bloom | `src/components/Player/PlaybackButton.tsx` (feed rows, album tracks, `PlayerBar`) |
| 30 fps dot waveform next to the Playing/Paused label | `src/components/Player/PixelWaveform.tsx` (+ `.test.tsx`) |
| Single AudioContext/Analyser; `useAudioMeter()` → level, `useAudioWaveform()` → samples | `src/components/Player/audioMeter.ts`; provided by `PlayerProvider.tsx` |
| Two-layer clip-path icon that fills with accent on parent hover | `src/components/Player/SweepIcon.tsx` (`PlaybackIcon`, `DownloadButton`, `PlayerBar`, `AlbumRow`) |
| `iconSweepStyles` / `textSweepStyles` / `textHoverState`; `--hover-progress` driver | `src/components/field/hoverStyles.ts`; `@property` in `src/app/globals.css` |
| Global hover glow (`button svg, a svg` drop-shadow reads `--hover-progress`), `::selection`, View Transition roll keyframes | `GlobalTheme` in `src/lib/theme/ThemeModeProvider.tsx` |
| Effect colors (`ink`, `vignette`, `particle`) per mode | `effects` in `src/lib/theme/tokens.ts` → `theme.effects` in `theme.ts` |
| `hexToRgb` / `rgbTriplet` / `withAlpha` | `src/lib/theme/color.ts` (+ `.test.ts`) |

None of the effect components are barrel-exported from `src/components/index.ts`; import
them from their folder paths (`@/components/Player/PlaybackButton`, etc.).

## Checklist for a new effect

Apply all of it before merge; each line is something an existing effect already does.

1. **Reduced motion.** Read `window.matchMedia('(prefers-reduced-motion: reduce)')`. Either
   paint one static frame (`PixelWaveform`; `CRTTexture` keeps its static CSS layer and
   schedules no sweeps) or bail entirely (`GlitchArt`,
   `PixelAccordion` particles, `PlaybackButton`, `SignInGlitch`). Long-lived effects
   `addEventListener('change', …)` on the media query and re-check; CSS transitions get
   `@media (prefers-reduced-motion: reduce) { transition: none }`.
2. **Hidden tab.** Check `document.hidden` (stop the loop, or read `0`/`null` from the
   meter) and listen for `visibilitychange` to resume. Timer-driven effects must not
   fire while hidden (`SignInGlitch.schedule`, `CRTTexture.restart`). CSS animations get
   `animation-play-state: paused` via a data attribute while hidden (`CRTTexture`).
3. **DPR + cleanup.** `Math.min(devicePixelRatio || 1, 1.5)` for full-screen canvases,
   `2` for small ones; size `canvas.width/height` by that ratio and `ctx.scale`/`setTransform`.
   The effect's return cancels the rAF, clears the canvas, removes every listener, and
   `remove()`s any body-level element (`PixelAccordion`).
4. **Throttle, or better, don't loop.** Prefer CSS/Web Animations on `transform`/`opacity`
   (compositor-only, no repaint — `CRTTexture` pulse and sweep) over a canvas loop. Where a
   loop is unavoidable, idle low (`PixelWaveform` 30 fps, `GlitchArt` ~11 fps) and run 60 fps
   only while something is visibly moving (particles in flight). Stop requesting frames when nothing is left to draw
   (`PixelAccordion` removes its canvas once `pixels.length === 0`).
5. **Theme colors only.** `theme.colors.*`, `theme.effects.*`, and `withAlpha(hex, a)` /
   `rgbTriplet(hex)` for canvas `rgba(...)` or where the alpha is a CSS variable. No hex
   literals in components, no `${hex}22` suffix tricks. Canvas effects read the theme once
   via `useTheme()` and put the strings in the effect's dependency array so a day/night
   toggle re-initialises the loop; CSS-driven effects just read `theme` in the template.
6. **No audio graph.** Anything that reacts to sound calls `useAudioMeter()` /
   `useAudioWaveform()` and handles `null` (outside `PlayerProvider`, or the track has no
   stored peaks). Never `new AudioContext()`, `createMediaElementSource`, or set
   `crossOrigin` on the `<audio>` anywhere: Web Audio was removed 2026-10 because routing
   the element through an `AudioContext` silenced iOS background playback.
7. **Hidden content is gone.** Collapsed rows are unmounted or `inert` + `aria-hidden`
   (`PixelAccordion`); a hidden row must not stay subscribed to `usePlayer`.
8. **Degrade silently.** Text tricks (`color: transparent` + `background-clip: text`)
   carry a `@media (forced-colors: active)` fallback or links vanish in Windows High
   Contrast. SVG `filter: url(#…)` on `backdrop-filter` and clip-path transforms are
   unsupported or flaky in Safari; the effect must look fine when they do nothing.
9. **Test it in jsdom.** Stub `getContext`, `requestAnimationFrame`, `matchMedia` (and
   fake timers for timer effects); assert on draw calls, the body-level element being
   removed on unmount, and the reduced-motion bail. Recipe below; full examples in
   [testing.md](References/testing.md).

## Reading the audio signal

There is no live analysis. Each track's loudness is precomputed at upload time into
`peaks/<id>.bin` in R2 (one byte per 20 ms, `PEAKS_PER_SECOND = 50`; see [[media-storage]]
and [[admin-upload]]). `PlayerProvider` keeps the `<audio>` a plain element on every device
(no `crossOrigin`, no `AudioContext`), calls `usePeaks(currentTrack?.id)` to fetch the
current track's bytes (deferred while `document.hidden`, keyed by track), and builds the
readers with `usePeakReaders(audioRef, peaks)` (`src/components/Player/peaks.ts`).
Two contexts are provided to the tree (`audioMeter.ts` now holds only these and their hooks):

- `useAudioMeter()` → `readLevel(): number` (0..1). `levelAt(peaks, audio.currentTime)`
  (loudest of the slice and its neighbours) × `LEVEL_GAIN`, clamped to 1. `0` while paused.
  `currentTime` is read per frame, so it is continuous (unlike the ~4 Hz `timeupdate`).
- `useAudioWaveform()` → `readWaveform(): Uint8Array | null` (256 time-domain bytes, 128 =
  silence). Synthetic: `shimmer(rms * WAVE_GAIN)` sums three sines (`WAVE_MIX`: cycles and
  weights summing to 1) with fresh random phases per call. `null` while paused.

Tuning constants for the designer (Erik) live at the top of `peaks.ts`: `LEVEL_GAIN = 4`
(particle energy; matches the old live meter), `WAVE_GAIN = 3` and `WAVE_MIX` (dot shimmer).

Both hooks return `null` outside `PlayerProvider` **and for a track with no peaks** (never
analyzed, fetch failed, still loading). Effects treat a `null` reader as "draw the idle state
once, don't loop" (`PixelWaveform`) or "don't mount a loop" (`PlaybackButton`). Same on every
device now: phones animate too. Fix a flat waveform by running **Analyze all** on the
track's `/admin/releases/[id]` page. R2 CORS `GET` is still needed, but only for the peaks
`fetch`, not for playback.

## Performance budget

`CRTTexture` is the only always-on, full-viewport effect, so it sets the floor — and the
floor is now **zero per-frame work**. Its first version painted a full-viewport canvas at
60 fps; the review cut that to 24 fps idle / 60 fps during sweeps; measured on 2026-10-11
that still cost Energy Impact 31.0 (+12.1 Graphics and Media) on an *idle* localhost tab
against 7.7 (+4.5) for develop *streaming audio*. The reason: the scanlines bent by under a
pixel and the wash pulsed, so every frame repainted ~3 M pixels. On 2026-10-13 it became
CSS gradients painted once, an `opacity` pulse, and one Web Animation per sweep (all
compositor-only). The rule for every effect follows from that: **anything that runs at rest
must be `transform`/`opacity` on the compositor or nothing at all**; canvas loops are for
things that are visibly moving (particles, the waveform while playing) and stop when they
aren't. A music site stays open for an hour with audio running — at-rest cost is paid for
the whole hour.

## Testing

jsdom has no canvas or rAF, so every effect test starts the same way:

```ts
vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
let draw: FrameRequestCallback | undefined;
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { draw = cb; return 1; });
vi.stubGlobal('cancelAnimationFrame', vi.fn());
const ctx = { scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '', globalAlpha: 1 };
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
// render with renderWithTheme, then drive a frame: draw!(performance.now() + 2000)
```

Tests that don't care about the effect mock `getContext` to `null` so the effect bails
(`PlayerBar.test.tsx`). Timer effects use `vi.useFakeTimers({ toFake: ['setTimeout',
'clearTimeout'] })` and assert `vi.getTimerCount()` is `0` after unmount
(`SignInGlitch.test.tsx`). Always `vi.restoreAllMocks(); vi.unstubAllGlobals()` in `afterEach`.

## References

- [effects-catalog.md](References/effects-catalog.md) — each effect's drawing model,
  timing, z-index, colors, what it does under reduced motion / hidden tab / Safari, and
  where it's mounted (including why `GlitchArt` is kept but not rendered).
- [testing.md](References/testing.md) — the full jsdom recipe: canvas/rAF/matchMedia stubs,
  driving frames with `performance.now`, audio contexts, fake timers + focus, the View
  Transition stub, and what each existing test asserts.

## Depends on

- [[component-library]] — the theme (`theme`/`amberTheme`, `theme.mode`), tokens
  (`effects`, `zIndex`), `renderWithTheme`, and where shared styles like `hoverStyles.ts`
  live (`src/components/field/`). The day/night switch itself (`ThemeModeProvider`,
  cookie, `useThemeMode`) is theme-system work; this skill only covers its roll effect.
- [[timeline-player]] — `PlayerProvider` hosts the `<audio>` element and the meter
  contexts (fed from stored peaks); `PlaybackButton`/`PixelWaveform` sit in its rows and bar.
- [[media-storage]] — the `peaks/<id>.bin` key and R2 CORS `GET` per bucket (needed by the peaks `fetch`).

## Known gaps (as of 2026-10-11)

- **Safari**: `backdrop-filter: url(#filter)` is unsupported, so the CRT tracking band
  shows only its glow and dashed line, no page wobble; the `SweepIcon` clip-path `<rect>` `transform: scaleX(var(--hover-progress))`
  may not animate (icon snaps or stays unfilled). Both degrade silently; no workaround shipped.
- **Audio-reactive effects need stored peaks.** Tracks uploaded before the stored-peaks
  change (2026-10) show idle dots and no particles until **Analyze all** runs on their
  release page. A failed peaks upload at publish time leaves the same state. Phones and
  tablets are no longer special-cased (`isTouchDevice` and the Web Audio meter were removed
  2026-10). iOS lock-screen playback is a separate, older gap; see [[timeline-player]].
- **`GlitchArt` is hover-only** — no touch/focus equivalent, so phones never see the tears.
- **`GlitchArt` is not rendered on the album page**: `album_art_url` holds an unsigned R2
  key, so `<Art>` would be a blank square. `Art`/`ArtPlaceholder` in
  `src/app/(app)/albums/[id]/album-page.styles.ts` and the single-column `Head` wait for
  the image-upload pass. It still renders in `ArtistCard` on the retired `/artists` route.
- The CRT scanlines no longer drift (CSS, painted once) and the three wobble lines beside
  the sweep are gone — the cost of the 2026-10-13 rewrite; restoring either means a canvas.
