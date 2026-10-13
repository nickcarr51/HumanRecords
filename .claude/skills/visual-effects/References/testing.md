# Reference: Testing effects in jsdom

Files: `src/components/Feed/PixelAccordion.test.tsx`, `src/components/Player/PixelWaveform.test.tsx`,
`src/components/Player/PlayerBar.test.tsx`, `src/components/Login/SignInGlitch.test.tsx`,
`src/lib/theme/ThemeModeProvider.test.tsx`, `src/lib/theme/color.test.ts`, `src/test/renderWithTheme.tsx`.

jsdom implements neither `<canvas>` drawing nor `requestAnimationFrame` timing, and its
`window.matchMedia` is undefined. Every effect guards for that (`if (!window.matchMedia)
return`, `getContext` → `null` → return), so an untouched effect in a test simply does
nothing. To test the effect itself, stub the three and drive frames by hand.

## The recipe

```ts
import { afterEach, expect, it, vi } from 'vitest';
import { renderWithTheme } from '@/test/renderWithTheme';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('draws and cleans up', () => {
  // 1. Media query. Long-lived effects call addEventListener on it; include the methods.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  // 2. rAF: capture the callback so the test decides when a frame happens.
  let draw: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { draw = cb; return 1; });
  const cancel = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancel);
  // 3. Canvas: a plain object with the methods the effect calls.
  const fillRect = vi.fn();
  const ctx = { scale: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(), fillRect, fillStyle: '', globalAlpha: 1 };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);

  const view = renderWithTheme(<MyEffect />);
  draw!(performance.now() + 2000);           // one frame, 2 s "later"
  expect(fillRect).toHaveBeenCalled();
  expect(ctx.globalAlpha).toBe(1);           // effect restores state after drawing
  view.unmount();
  expect(cancel).toHaveBeenCalled();
});
```

Use `renderWithTheme` for anything that reads `useTheme()` (all canvas effects do);
`SignInGlitch` has no theme dependency and uses plain `render`.

## What the existing tests assert

- **`PixelAccordion.test.tsx`** — rerender `open={false}` → `open` creates a canvas in
  `document.body`; a frame delivered 2 s late still emits exactly 4 `fillRect`s (emission
  starts on the first frame, not at effect time); `globalAlpha` is back to 1; unmount
  removes the canvas and calls `cancelAnimationFrame`. Second test: `matches: true` →
  no canvas at all.
- **`PixelWaveform.test.tsx`** — provides the waveform through
  `<AudioWaveformContext.Provider value={sample}>` with
  `sample = vi.fn(() => new Uint8Array(256).fill(255))`; with `playing` the synchronous
  first `draw` samples once and draws more than 32 dots; rerendering `playing={false}`
  draws exactly 32 flat dots and never samples. (rAF is stubbed to a no-op `() => 1`, so
  only the synchronous first paint runs.)
- **`CRTTexture.test.tsx`** — no canvas: stubs `matchMedia` (a getter for `matches`) and
  `Element.prototype.animate` (returns `{ cancel, onfinish }`), fake `setTimeout`. Asserts a
  sweep is animated after the 2–5 s delay with `translateY` keyframes and ≥ 5.5 s duration,
  `onfinish` hides the band and a second sweep follows; none under reduced motion; none while
  `document.hidden` (redefined with a configurable getter) and a restart on
  `visibilitychange`; hiding mid-sweep calls `cancel`; unmount cancels and stops the timer.
- **`PlayerBar.test.tsx`** — doesn't care about effects:
  `vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)` in
  `beforeEach` makes `PlaybackButton`/`PixelWaveform` bail silently and keeps jsdom's
  "not implemented" console noise out of the run.
- **`SignInGlitch.test.tsx`** — `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`
  plus `vi.spyOn(Math, 'random').mockReturnValue(0.5)` makes the schedule deterministic
  (first burst at 10 000 ms, next 26 250 ms after the burst clears); focuses an input,
  advances through a burst, and checks `style.filter` contains the filter id while the
  input keeps focus and value; after the burst `filter`/`transform` are `''`; after
  `unmount()`, `vi.getTimerCount()` is 0. Second test stubs `matchMedia` to `matches: true`
  and expects no timers. `afterEach` adds `vi.useRealTimers()`.
- **`ThemeModeProvider.test.tsx`** — installs
  `document.startViewTransition` with `Object.defineProperty(document, 'startViewTransition',
  { configurable: true, writable: true, value: vi.fn(update => { update(); return { ready:
  Promise.resolve() }; }) })`, stubs `matchMedia` to `matches: false`, clicks the toggle,
  and asserts the transition ran once and `document.documentElement.dataset.themeReveal`
  is `'night'`. `afterEach` restores or deletes the property.
- **`color.test.ts`** — `hexToRgb`, `rgbTriplet`, `withAlpha` including 3-digit hex,
  alpha clamping, and non-hex pass-through.

## Patterns to copy

- **Drive time, don't wait for it.** Pass explicit timestamps to the captured rAF callback
  (`draw(performance.now() + 2000)`) or use fake timers; never `await` real delays.
- **Audio without audio.** Wrap the component in `AudioMeterContext.Provider` /
  `AudioWaveformContext.Provider` from `src/components/Player/audioMeter.ts` with a
  `vi.fn()` that returns a level or a `Uint8Array`; don't try to construct an
  `AudioContext` (jsdom has none, and `enable()` returns early without one).
- **Body-level elements.** Query `document.body.querySelector('canvas')` and assert it is
  gone after `unmount()`.
- **Reduced motion.** One test per effect with `matchMedia` → `matches: true` proving no
  canvas / no timers / no transition.
- **Mocks leak.** `vi.restoreAllMocks(); vi.unstubAllGlobals()` in `afterEach` is not
  optional; a leaked `requestAnimationFrame` stub makes unrelated tests hang or pass vacuously.
- **Don't test pixels.** Assert on call counts, arguments, and state (`globalAlpha` reset,
  canvas removed), not on visual output.
