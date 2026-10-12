# Reference: Effects catalog

Files: `src/components/CRTTexture/CRTTexture.tsx`, `src/components/GlitchArt/GlitchArt.tsx`,
`src/components/Login/SignInGlitch.tsx`, `src/components/Feed/PixelAccordion.tsx`,
`src/components/Player/{PlaybackButton,PixelWaveform,SweepIcon,PlaybackIcon}.tsx`,
`src/components/Player/audioMeter.ts`, `src/components/field/hoverStyles.ts`,
`src/lib/theme/{ThemeModeProvider.tsx,color.ts,tokens.ts}`, `src/app/globals.css`.

Each entry: what it draws, how it's timed, where it sits, and what it does when it
can't run. Line numbers are as of 2026-10-11 on `feat/playback-vector-icons`.

## CRTTexture — full-viewport scanlines, pulse, vignette, tracking sweep

- **Mount**: once, in `src/app/layout.tsx` inside `StyledComponentsRegistry` after
  `{children}`, so it has the theme and overlays every route (login included).
- **Layers**: a `position: fixed; inset: 0; pointer-events: none` canvas at
  `z-index: theme.zIndex.toast + 1` (1101 — above toasts and modals, deliberately), plus a
  `DistortionBand` div with the same z-index, hidden by default, with a vertical
  `mask-image` gradient and `backdrop-filter: url("#crt-<id>") blur(0.1px)`. The filter
  is an inline `<svg width=0 height=0>` with `feTurbulence` (`fractalNoise`,
  `baseFrequency 0.008 0.08`) feeding `feDisplacementMap`; the effect sets its `scale`
  attribute per frame.
- **Paint** (`paint(now)`): clear; base fill `rgba(ink, 0.014 + pulse·0.012)` where
  `pulse = 0.5 + 0.5·sin(t·0.8)`; one stroked path of bent scanlines every 4 px, alpha
  `0.055` (dark) / `0.024` (light) + pulse; then, while a sweep is live, a translucent
  band gradient, three wobbling lines, a dashed "tracking noise" row, and the band div is
  shown and translated to the sweep's `y`; finally the vignette gradient
  (`withAlpha(vignette, 0)` → `0.055`, rebuilt on resize).
- **Sweep timing**: first pass 2–5 s after mount, lasts 5.5–8 s, next one 4–11 s after it
  ends; random direction, thickness 8–28 px, strength 0.02–0.035, envelope `sin(π·progress)`.
- **Frame rate**: `tick` requests every frame but paints only when
  `now - last >= 1000/fps - 1`, with `fps = sweep ? 60 : 24` (lines 131–137).
- **DPR**: `Math.min(devicePixelRatio, 1.5)`; `ctx.setTransform(ratio, …)` on resize.
- **Reduced motion**: `time = 0`, no sweeps are scheduled, and `resume()` paints one
  frame without starting the loop. Re-checked via `reduced.addEventListener('change', resume)`.
- **Hidden tab**: `resume()` runs on `visibilitychange`; it cancels the frame, hides the
  band, and returns early when `document.hidden`, else restarts with a fresh sweep timer.
- **Cleanup**: cancels rAF, hides band, removes `resize`/`visibilitychange`/`change` listeners.
- **Deps**: `[dark, inkHex, vignetteHex]` — a theme toggle re-runs the whole effect.
- **Colors**: `theme.effects.ink` via `rgbTriplet` (canvas supplies its own alpha),
  `theme.effects.vignette` via `withAlpha`. Light: gray ink `#646464`; dark: amber accent.
- **Safari**: `backdrop-filter: url()` is ignored, so only the canvas half of the sweep shows.

## GlitchArt — horizontal tears over an image (kept, not on the album page)

- `<Frame>` (`span`, `overflow: hidden`) wrapping an `<img>` and an absolutely positioned
  overlay canvas. `onMouseEnter`/`onMouseLeave` flip a `hovered` state; the effect runs
  only while hovered.
- Draws with `ctx.drawImage(img, …)` — a cover-fit copy plus four random 2–8 px slices
  offset ±6 px — and never calls `getImageData`, so it works on tainted (no-CORS) images.
  Throttled to one paint per 90 ms; full tears for the first 450 ms, then ~35 % of paints.
- DPR cap 2. Bails on reduced motion. No `document.hidden` guard (hover-only, short-lived).
- **Where**: `Thumb = styled(GlitchArt)` in `src/components/ArtistCard/ArtistCard.tsx`
  (retired `/artists` route, see [[artists-read]]). `Art = styled(GlitchArt)` in
  `src/app/(app)/albums/[id]/album-page.styles.ts` is exported but **not rendered**:
  `page.tsx` lines 42–45 explain that `album_art_url` holds an R2 key that isn't signed
  yet, so `<Art>` would be a blank square. `Head` is single-column until image upload
  ships; restore `grid-template-columns: 96px 1fr` with `<Art>` then.
- Hover-only means no touch or keyboard equivalent.

## SignInGlitch — randomized tear bursts on `/` and `/login`

- Wraps children in a `<div ref={content}>` and renders an inline SVG filter:
  `feTurbulence` → `feComponentTransfer` (discrete R table turns noise into horizontal
  bands, B fixed at 0.5) → `feDisplacementMap` (`xChannelSelector R`, `yChannelSelector B`),
  so displacement is horizontal only.
- **Timing**: `schedule(initial)` sets a timeout of 6–14 s (first) or 18–35 s (later); a
  `burst` picks 2–5 `tear` steps 35–90 ms apart, each setting `scale` 1–9, a sub-pixel
  `translateX`/`skewX` and a new noise seed, then clears the filter/transform and schedules again.
- **Guards**: `schedule` and `burst` return if `document.hidden` or reduced motion;
  `visibilitychange` and the media-query `change` call `resume()` = clear + reschedule.
  Cleanup clears both timers and resets the styles, so `vi.getTimerCount()` is 0 after unmount.
- Applies `style.filter` to the wrapper only, so inputs keep focus and value through a burst.
- **Where**: `src/app/page.tsx` (logo and heading each wrapped) and
  `src/app/login/page.tsx` (the form block). Both routes are forced to the amber theme by
  `ThemeModeProvider` (`entrance` paths).

## PixelAccordion — expand/collapse with falling/bursting pixels

- `Panel` is a CSS grid whose `grid-template-rows` goes `0fr` ↔ `1fr` over 420 ms
  (`cubic-bezier(0.22, 1, 0.36, 1)`) with an opacity fade; `Clip` has `min-height: 0;
  overflow: hidden`. Reduced motion: `transition: none`.
- **Children mount only while open or ≤ 450 ms after close** (`CLOSE_MS`, matching the
  transition). Under reduced motion they unmount immediately. Reason in the source:
  collapsed rows would otherwise each subscribe to the player and re-render during playback.
- When closed the panel is `inert` and `aria-hidden` (asserted in `FeedList.test.tsx`).
- **Particles**: on every open/close transition (tracked with a `previous` ref), the effect
  creates a `<canvas>` with `position: fixed; inset: 0; pointer-events: none; z-index:
  theme.zIndex.sticky` (200), appends it to `document.body` (escapes the feed's scroll/clip),
  and emits 4 pixels every 40 ms for 420 ms from the panel's bottom edge
  (`getBoundingClientRect`). Open: pixels drift to the bottom of the viewport; close: they
  burst upward under gravity. Each pixel is a 2–3 px `fillRect` snapped to a 2 px grid,
  alpha `(1 - age)^1.2 · 0.7`, color `theme.effects.particle`. The loop keeps requesting
  frames only while `elapsed < 420 || pixels.length`, then removes the canvas; cleanup also
  cancels and removes it.
- `start` is set on the first rendered frame (not at effect time) so a busy main thread
  can't skip the emission window — the test drives `draw(performance.now() + 2000)` and
  still expects 4 `fillRect`s.
- DPR cap 2. Reduced motion: no canvas at all.
- **Where**: `src/components/Feed/AlbumRow.tsx` wraps `AlbumTracks` in it; the chevron is
  a `styled(SweepIcon)` that rotates 180°.

## PlaybackButton — level-driven particles and accent bloom

- `Shell` (`isolation: isolate`) holds `ActiveButton` (= feed `PlayButton` with accent
  color/border, inset glow `withAlpha(accent, 0.086)` and an svg `drop-shadow` when
  `$active`) and, only while `active`, a 130 × 130 px `Particles` canvas centred on the
  2.25 rem button (`top/left: -47px`) with a radial `mask-image` so pixels fade out past
  the ring. `Shell::before` is the bloom: a radial gradient of `withAlpha(accent, 0.13 → 0)`
  fading in over 320 ms.
- Effect runs when `active && readLevel && !reducedMotion`. Each frame: `energy =
  document.hidden ? 0 : readLevel()`; if `energy > 0.03`, `emission += delta · energy · 20`;
  while `emission ≥ 1` and fewer than 35 pixels, spawn one on a 19 px ring with speed
  `12 + energy·32` and a slight upward bias; pixels live 0.5–1 s, drawn as 2 × 2
  `fillRect` in `theme.colors.accent` with alpha `(1 - age/life) · 0.5`.
- DPR cap 2 (`layer.width = layer.height = 130·ratio`). Runs at rAF rate — justified
  because it exists only for the one playing button. Cleanup cancels and clears.
- **Where**: `Feed/SingleTrackRow.tsx`, `Feed/AlbumTracks.tsx`, `Player/PlayerBar.tsx`,
  `Feed/AlbumRow.tsx`; `active` is `activePlaying` from `usePlayButton` (this row is the
  current track and it is playing).

## PixelWaveform — 30 fps dot waveform

- 24 px-tall canvas, 96 px wide on desktop; ≤ `breakpoints.md` it flexes to the row width via a `ResizeObserver` (guarded for jsdom) and draws `width / 3` columns, next to a text label
  (`Playing`/`Paused`/`Loading`/`Error`).
- 32 columns, 3 px apart; each column's peak is the max `|sample - 128| / 128` over its
  slice of `readWaveform()`, quantised to 3 px steps up to ±10 px, drawn as 2 × 2 dots.
  Paused or no meter: flat single dots in `theme.colors.faint` at alpha 0.35; playing:
  `theme.colors.accent` at 0.85.
- Paints at most every `1000/30` ms; requests another frame only while `playing &&
  !reduced`. `document.hidden` → samples `null` (flat line), loop continues.
- DPR cap 2. `draw(performance.now())` runs synchronously once on mount so the static
  frame exists even when rAF never fires (jsdom, reduced motion).
- **Where**: `PlayerBar.tsx` line 147.

## audioMeter.ts — the single analyser

- `useAudioMeterSource(audioRef)` (called once in `PlayerProvider`, line 85) returns
  `{ enable, readLevel, readWaveform }`.
- `enable()` (invoked at the top of `playQueue` and `play`, lines 249 and 260 — both user
  gestures) does nothing unless `audio.crossOrigin === 'anonymous'` and `AudioContext`
  exists; otherwise it creates the context + analyser (`fftSize 256`) +
  `createMediaElementSource` once, wires source → analyser → destination, and
  `resume()`s. Failures are swallowed so unsupported browsers keep working controls.
- `readLevel()` returns 0 unless the context is `running` and the element isn't paused;
  caches for 8 ms; RMS of time-domain bytes × 4, clamped to 1, smoothed by 0.25 per read.
- `readWaveform()` returns the analyser's own `Uint8Array` (or `null`), refilled on each call.
- Unmount: disconnect source and analyser, close the context, drop the ref.
- Provided via `AudioMeterContext` / `AudioWaveformContext` (PlayerProvider lines
  418–420); the hooks `useAudioMeter` / `useAudioWaveform` return `null` without a provider.
- `<audio ref preload="metadata" crossOrigin="anonymous" />` (line 425) is the reason the
  R2 buckets allow `GET`/`HEAD` from each site origin (`infra/r2/README.md`): a CORS-mode
  media request the bucket hasn't allowed is refused by the browser, so playback itself
  fails, not only the meter.
- Once connected, the element's output goes through the `AudioContext`, and iOS suspends
  that context when Safari goes to the background → silence while the element still reports
  playing. This is why touch devices never connect (see `isTouchDevice`). Separately, iOS
  lock-screen playback has never worked on this app even without Web Audio; see
  [[timeline-player]] Known deferrals.

## Sweep hovers — `--hover-progress`, `SweepIcon`, `hoverStyles.ts`

- `src/app/globals.css` registers `@property --hover-progress { syntax: '<number>';
  inherits: true; initial-value: 0 }` so the custom property can be transitioned.
- `iconSweepStyles` (on `circularControlStyles` → feed `PlayButton`/`AlbumLink`, and the
  `PlayerBar` controls): `--hover-progress: 0` with a 480 ms ease transition (light mode:
  200 ms `steps(6, end)`); `:hover:not(:disabled), :focus-visible` → `1` + accent border;
  light mode adds a 1 px-per-4 px scanline `repeating-linear-gradient` background and the
  `trackingEcho` keyframes on the svg. Reduced motion: no transition, no animation.
- `SweepIcon` renders its children twice: a plain `<g>` and a second `<g>` colored
  `theme.colors.accent` clipped by a `<clipPath>` whose `<rect>` has
  `transform: scaleX(var(--hover-progress, 0)); transform-origin: 0 0`. The parent's
  hover drives the property; the accent copy wipes in left to right. `PlaybackIcon`,
  `DownloadButton`, `PlayerBar` prev/next, and `AlbumRow`'s chevron and open link use it.
  Safari may not apply the transform inside the clip path.
- `GlobalTheme` adds `button svg, a svg { filter: drop-shadow(0 0 3px rgba(accent,
  calc(0.08|0 + var(--hover-progress) · 0.14))) }`, so the glow strengthens with the same
  property app-wide, and `body` carries a faint accent `text-shadow` in dark mode.
- `textSweepStyles` (`Link`, `AppShell` nav links, `Pagination`, `ArtistCard`): a two-stop
  `linear-gradient(accent 45%, text 55%)` sized 240 % and clipped to text with
  `color: transparent`; hover slides `background-position` from `100% 0` to `0% 0`
  (`textHoverState`, which also exports for custom targets). Light mode uses a hard 50/50
  stop and stepped transitions. **`@media (forced-colors: active) { color: LinkText;
  background-image: none; filter: none }` is required** — without it the transparent text
  is invisible in Windows High Contrast. Already present (lines 64–68); keep it when editing.
- `trackingEcho(accent, text)` builds its keyframes from theme colors through `withAlpha`;
  styled-components hashes keyframes by content, so the per-render call reuses one name.

## Day/night roll — View Transition on toggle

- `ThemeModeProvider.toggle()` (lines 86–101): if `document.startViewTransition` is
  missing or reduced motion is on, update immediately. Otherwise set
  `html[data-theme-reveal]` to `night` or `day`, then
  `document.startViewTransition(() => flushSync(update))`; `transition.ready.catch(() => {})`
  swallows the "skipped" rejection.
- `GlobalTheme` turns off the default crossfade (`::view-transition-old/new(root)
  { animation: none }`), stacks new above old, and rolls the new root in with
  `clip-path: inset(...)` — `night-roll` 1300 ms from the top, `day-roll` 1100 ms from the
  bottom, both `cubic-bezier(0.22, 1, 0.36, 1)`. Reduced motion: `animation: none !important`.
- The CRT canvas, text and icons are part of the snapshot, so the roll reveals the real
  themed page. The toggle button lives in `AppShell` (`useThemeMode`). Everything else
  about modes (cookie, `entrance` routes, `amberTheme`) is [[component-library]] territory.

## Color helpers and tokens

- `src/lib/theme/color.ts`: `hexToRgb('#rgb' | '#rrggbb')`, `rgbTriplet(hex)` → `'r, g, b'`
  for canvas strings that add their own alpha, `withAlpha(hex, 0..1)` → `rgba(...)`.
  Non-hex input passes through unchanged, so a token that is already `rgba` is safe.
- `tokens.ts` `effects.light = { ink: '#646464', vignette: '#505050', particle: '#b8b8b8' }`,
  `effects.dark = { ink: accent, vignette: '#505050', particle: accent, panel: raised, shadow: '#000000' }` (plus `panel: '#dcdcdc'`, `shadow: '#111111'` in light); exposed as
  `theme.effects` (typed in `AppTheme`). Add a new effect color here, per mode, rather
  than in a component.
