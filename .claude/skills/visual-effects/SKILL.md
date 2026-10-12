---
name: visual-effects
description: Use when adding, tuning, or debugging an ambient visual effect in Human Services — the CRT scanline/tracking canvas (`CRTTexture` in the root layout), image tears (`GlitchArt`), the sign-in glitch (`SignInGlitch`), pixel particles on feed accordions (`PixelAccordion`) and play buttons (`PlaybackButton`), the dot waveform (`PixelWaveform`), the audio analyser (`src/components/Player/audioMeter.ts`: `useAudioMeter` / `useAudioWaveform`), hover sweeps (`SweepIcon`, `src/components/field/hoverStyles.ts`, `--hover-progress`), the `theme.effects.*` tokens and `withAlpha` / `rgbTriplet`, or the day/night View Transition roll. Also when a canvas keeps drawing after unmount, a background tab burns CPU, an effect ignores `prefers-reduced-motion`, links vanish in Windows High Contrast, a test logs "getContext not implemented", playback breaks after a `crossOrigin` / Web Audio / R2 CORS change, or a new page wants an effect.
---

# Visual Effects (ambient layer)

The "old display" feel layered over the gray/amber UI: a full-viewport CRT canvas, pixel
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
| Full-viewport scanlines + pulse + vignette + tracking sweep; mounted once in the root layout inside the styled registry | `src/components/CRTTexture/CRTTexture.tsx`, `src/app/layout.tsx` |
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
   paint one static frame (`CRTTexture`, `PixelWaveform`) or bail entirely (`GlitchArt`,
   `PixelAccordion` particles, `PlaybackButton`, `SignInGlitch`). Long-lived effects
   `addEventListener('change', …)` on the media query and re-check; CSS transitions get
   `@media (prefers-reduced-motion: reduce) { transition: none }`.
2. **Hidden tab.** Check `document.hidden` (stop the loop, or read `0`/`null` from the
   meter) and listen for `visibilitychange` to resume. Timer-driven effects must not
   fire while hidden (`SignInGlitch.schedule`).
3. **DPR + cleanup.** `Math.min(devicePixelRatio || 1, 1.5)` for full-screen canvases,
   `2` for small ones; size `canvas.width/height` by that ratio and `ctx.scale`/`setTransform`.
   The effect's return cancels the rAF, clears the canvas, removes every listener, and
   `remove()`s any body-level element (`PixelAccordion`).
4. **Throttle.** Idle loops run low (`CRTTexture` 24 fps, `PixelWaveform` 30 fps,
   `GlitchArt` ~11 fps); 60 fps only while something is visibly moving (the CRT sweep,
   particles in flight). Stop requesting frames when nothing is left to draw
   (`PixelAccordion` removes its canvas once `pixels.length === 0`).
5. **Theme colors only.** `theme.colors.*`, `theme.effects.*`, and `withAlpha(hex, a)` /
   `rgbTriplet(hex)` for canvas `rgba(...)`. No hex literals in components, no
   `${hex}22` suffix tricks. Read the theme once via `useTheme()` and put the strings in
   the effect's dependency array so a day/night toggle re-initialises the loop.
6. **One audio graph.** Anything that reacts to sound calls `useAudioMeter()` /
   `useAudioWaveform()` and handles `null` (outside `PlayerProvider`, or before the
   first play gesture). Never `new AudioContext()` or `createMediaElementSource` anywhere
   else; the element only allows one source node.
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

`PlayerProvider` owns the app's one `<audio>` element (`crossOrigin="anonymous"` set in an
effect, **desktop only** — see below) and calls `useAudioMeterSource(audioRef)` once. Its `enable()` runs inside `playQueue` and `play`
(user gestures) and lazily creates a single `AudioContext` + `AnalyserNode`
(`fftSize 256`) via `createMediaElementSource`, wired source → analyser → destination,
then `context.resume()`s. Two contexts are provided to the tree:

- `useAudioMeter()` → `readLevel(): number` (0..1). Returns `0` when the context isn't
  running or the element is paused; smooths once per frame (8 ms cache) so several
  buttons reading per frame share one RMS pass.
- `useAudioWaveform()` → `readWaveform(): Uint8Array | null` (time-domain bytes, 128 = silence).
  The array is the analyser's shared buffer; read it, don't keep it.

Both hooks return `null` outside `PlayerProvider` **and on touch devices** (`isTouchDevice()`
in `audioMeter.ts`): routing the element through an `AudioContext` stops iOS background
playback, so phones/tablets get no analyser, no `crossOrigin`, and effects must treat a `null`
reader as "draw the idle state once, don't loop" (`PixelWaveform`) or "don't mount a loop"
(`PlaybackButton`). The context closes when the provider unmounts. **Because the element is `crossOrigin="anonymous"`, every R2 bucket must allow
`GET`/`HEAD` from its site origin (`infra/r2/cors.*.json`, see [[media-storage]]); without
that rule playback fails entirely, not just the meter.**

## Performance budget

`CRTTexture` is the only always-on, full-viewport effect, so it sets the floor. Each
paint clears the viewport, fills the pulse, strokes a scanline every 4 px with a segment
every 32 px, and fills the vignette — at DPR ≤ 1.5. The first version painted that at a
flat 60 fps (`1000 / 60`), on every page, forever: roughly 2.5× the idle work of today's
loop, competing with the feed render, the audio-driven canvases, and the backdrop-filter
band on the compositor. Scanlines drift at 0.35 rad/s, so 24 fps is indistinguishable;
the loop now idles at **24 fps** and switches to **60 fps only while `sweep` is non-null**
(a tracking pass lasting 5.5–8 s every ~10–20 s), because a band crossing at 24 fps
visibly steps. The same shape applies to any new effect: cheap idle, brief bursts.

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
  contexts; `PlaybackButton`/`PixelWaveform` sit in its rows and bar.
- [[media-storage]] — R2 CORS `GET`/`HEAD` per bucket, required by `crossOrigin="anonymous"`.

## Known gaps (as of 2026-10-11)

- **Safari**: `backdrop-filter: url(#filter)` is unsupported, so the CRT tracking band
  shows only the canvas part; the `SweepIcon` clip-path `<rect>` `transform: scaleX(var(--hover-progress))`
  may not animate (icon snaps or stays unfilled). Both degrade silently; no workaround shipped.
- **No audio-reactive effects on phones/tablets** (by design, 2026-10-11): Web Audio
  silenced iOS background playback, so touch devices skip the analyser. Waveform shows idle
  dots, play buttons have no particles. Planned fix: precompute the waveform at upload time
  and drive visuals from `currentTime` (see [[timeline-player]]).
- **`GlitchArt` is hover-only** — no touch/focus equivalent, so phones never see the tears.
- **`GlitchArt` is not rendered on the album page**: `album_art_url` holds an unsigned R2
  key, so `<Art>` would be a blank square. `Art`/`ArtPlaceholder` in
  `src/app/(app)/albums/[id]/album-page.styles.ts` and the single-column `Head` wait for
  the image-upload pass. It still renders in `ArtistCard` on the retired `/artists` route.
- `PlaybackButton` and `PixelWaveform` keep their rAF loop while the tab is hidden (they
  read `0`/`null` instead); browsers throttle background rAF, so it's cheap, but a full
  pause/resume like `CRTTexture` would be cleaner.
