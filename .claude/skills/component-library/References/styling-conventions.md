# Reference: Styling conventions

## 1. `'use client'` on every styled module

Every file that calls `styled.*` / `css` / `keyframes` / `createGlobalStyle` starts with
`'use client'`: components in `src/components/*`, page-level `*.styles.ts` files,
`ThemeModeProvider.tsx`. (`field/hoverStyles.ts` and `field/fieldStyles.ts` only export
`css` fragments and are imported solely by client modules, so they carry no directive.)

Pages are async **Server Components** (they call `createClient()`, `getSessionUser()`,
`notFound()`, `redirect()`). They must not define styled-components. Instead:

```
src/app/(app)/feed/
  page.tsx               // server: data + layout, imports from ./feed-page.styles
  feed-page.styles.ts    // 'use client'; export const Page = styled.div`…`
```

Existing examples: `src/app/page.styles.ts`, `src/app/screen.styles.ts`,
`src/app/(app)/feed/feed-page.styles.ts`, `albums/[id]/album-page.styles.ts`,
`admin/admin.styles.ts`, `artists/artists.styles.ts`, `artists/[id]/artist-detail.styles.ts`,
`dashboard/dashboard.styles.ts`. Import as named exports (`import { Page } from …`) or a
namespace (`import * as S from './page.styles'`) — both are used. A server page may render a
client effect component directly (`/login` renders `<SignInGlitch>`, the album page renders
`<CatalogId>`) — rendering is fine, *defining* styles is not.

A server-safe helper must not live in a `'use client'` module if a server component calls it
(client-module exports can't be invoked on the server). That's why `initials` lives in
`src/lib/initials.ts` and `ArtistCard` re-exports it, and why `color.ts` / `mode-cookie.ts`
are plain modules (the root layout calls `isDarkCookieValue`).

## 2. Transient `$` props

Any prop that only drives styling is `$`-prefixed (`$gap`, `$tone`, `$invalid`, `$level`,
`$active`, `$open`, `$expanded`) so it never reaches the DOM (no React unknown-prop warnings).
Real HTML attributes stay un-prefixed. Type them on the generic: `styled.div<{ $gap?: SpaceKey }>`.
Function components that wrap a styled element expose plain props and map them
(`Button`'s `variant` → `$variant`, `PlaybackButton`'s `active` → `$active`).

## 3. Always read from `theme` — the two-layer color rule

Colors, spacing, fonts, radii, motion, z-index, and breakpoints come from
`${({ theme }) => theme.x.y}` — never a hex, `rgba()`, or font-family literal in a component.
Raw hex lives in `src/lib/theme/tokens.ts` only (the one sanctioned literal exception is
`globals.css`; see [ssr-registry.md](ssr-registry.md)).

When you need **alpha or a canvas color**, derive it from a token with
`src/lib/theme/color.ts`:

```ts
import { withAlpha, rgbTriplet } from '@/lib/theme/color';

// 20 % accent, in a styled template
box-shadow: inset 0 0 6px ${({ theme }) => withAlpha(theme.colors.accent, 0.2)};

// canvas / calc() alpha, where the alpha is computed per frame
const ink = rgbTriplet(theme.effects.ink);        // '100, 100, 100'
ctx.fillStyle = `rgba(${ink}, ${0.014 + pulse * 0.012})`;
```

Don't write `${theme.colors.accent}22` (hex-concat alpha) or `rgba(255, 107, 27, 0.2)`. The
first breaks on any non-6-digit token and hides intent; the second stops following the mode.
Ambient-effect colors come from `theme.effects.{ink,vignette,particle,panel,shadow}`, not `theme.colors`.

## 4. Branch on `theme.mode`, not on colors

Both themes share keys, so most styles need no branch. When the *relationship* between
colors differs by mode, branch on `theme.mode`:

```ts
color: ${({ theme }) => theme.mode === 'dark' ? theme.colors.bg : theme.colors.text};
${({ theme }) => theme.mode === 'light' && css`
  transition: --hover-progress 200ms steps(6, end);
`}
```

Current branches: `Button` primary text, `Tag` accent tone, `hoverStyles` (smooth glow in
night vs. stepped "tracking" echo in day), `CRTTexture` scanline strength, `GlobalTheme`
text/icon glow. Keep both branches reading tokens. In component bodies use `useTheme()` and
read `theme.mode` / `theme.effects` from it. See [theme-mode.md](theme-mode.md).

## 5. The hover / sweep system (`src/components/field/hoverStyles.ts`)

Hover is a shared vocabulary, not per-component improvisation. Three `css` mixins:

| Mixin | What it does | Used by |
|---|---|---|
| `textSweepStyles` | Paints the text with a two-stop gradient (`accent` → `text`) via `background-clip: text; color: transparent`, parked at `background-position: 100% 0`; on `:hover:not(:disabled), :focus-visible` it slides to `0% 0` so accent sweeps in left-to-right. Night: 480ms ease + accent `drop-shadow` glow; day: 200ms `steps(6)` + the `trackingEcho` keyframes (a 4-step offset drop-shadow "tracking" judder). Reduced motion: no transition/animation. | `Link`, `AppShell` `NavLink`/`SignOutButton`, `Pagination` `PageLink`, `ArtistCard` `Name` |
| `textHoverState` | Just the hovered state (position + glow/echo), for a parent that hovers a child: `&:hover .artist-name { ${textHoverState} }`. The child still needs `textSweepStyles` for the base. | `ArtistCard` `Row` |
| `iconSweepStyles` | For round icon buttons/links. Sets `--hover-progress: 0` and **transitions it to 1** on hover/focus (480ms ease night; 200ms `steps(6)` day), turns `border-color` accent, and in day adds a faint accent scanline `repeating-linear-gradient` background plus the `trackingEcho` on the inner `svg`. | `feed.styles` `circularControlStyles` (→ `PlayButton`, `AlbumLink`), `PlayerBar` `IconButton` |

**`--hover-progress`** is registered with `@property` in `globals.css` (`<number>`, inherits,
initial 0) — registration is what makes the custom property animatable. Because it inherits,
descendants read it: `SweepIcon` scales its clip rect by `var(--hover-progress)`, and
`GlobalTheme`'s `button svg, a svg` glow is `calc(base + var(--hover-progress) * 0.14)`. To
make a new control sweep, put `iconSweepStyles` on the *interactive element* and a
`SweepIcon` inside it — nothing else to wire.

**`SweepIcon` two-layer clip** (`src/components/Player/SweepIcon.tsx`): an 18×18 `<svg
viewBox="0 0 24 24" aria-hidden>` that renders its children **twice** — once as drawn, once
inside `<g clipPath>` colored `theme.colors.accent` (via `style.color`, so `currentColor`
fills/strokes turn accent). The clip is a `<rect>` with `transform: scaleX(var(--hover-progress, 0))`
from the left edge, so the accent copy is revealed as the parent's `--hover-progress` rises.
Pass `fill`/`stroke`/`strokeWidth` props as you would on an `<svg>`; they're forwarded to the
clipped copy too. Children must be plain SVG shapes without `id`s (they're duplicated). It
can be wrapped: `styled(SweepIcon)<{ $expanded: boolean }>` (the `AlbumRow` chevron).

**Keyframes from theme values:** `trackingEcho(accent, text)` builds a `keyframes` block per
call; styled-components hashes keyframes by content, so the same colors yield the same
animation name — safe to call inside an interpolation.

## 6. `forced-colors` is mandatory for clipped text

Any style that uses `color: transparent` + `background-clip: text` (that's `textSweepStyles`
and anything you build like it) **must** include

```css
@media (forced-colors: active) {
  color: LinkText;          /* or CanvasText / ButtonText as appropriate */
  background-image: none;
  filter: none;
}
```

Windows High Contrast strips author backgrounds, so without this the text is transparent on
nothing — invisible links. Put the fallback in the mixin, not in each consumer, so every
consumer inherits it (that's where `textSweepStyles` has it).

## 7. Folder + barrel layout

```
src/components/<Name>/
  <Name>.tsx       // the component(s)
  <Name>.test.tsx  // optional, colocated
  index.ts         // export * from './<Name>'
```

Then add `export * from './<Name>'` to `src/components/index.ts`. The barrel test
(`src/components/index.test.ts`) asserts the core primitives are exported — add new
primitives to its list. Feature-specific subcomponents can live in a feature folder
(`Feed/`, `Upload/`, `Player/`) with a shared `*.styles.ts` there. The effect and catalog
components (`CRTTexture/`, `GlitchArt/`, `CatalogId/`, `Login/SignInGlitch`,
`Feed/PixelAccordion`, `Player/{SweepIcon,PlaybackButton,PlaybackIcon,PixelWaveform}`) have
**no** `index.ts` / barrel entry on purpose — import them by path
(`@/components/Player/SweepIcon`) so the barrel stays the "primitives" list.

## 8. Accessibility + motion defaults

Match what the primitives already do:
- `&:focus-visible { outline: 2px solid accent; outline-offset: 2px }` on anything
  interactive (inputs use an accent border + 1px box-shadow instead). The sweep mixins also
  fire on `:focus-visible`, so keyboard users see the same hover.
- `&:disabled { opacity: 0.5; cursor: not-allowed }` (`PlayButton` uses 0.4). Hover mixins
  use `&:hover:not(:disabled)`.
- Wrap every `transition`/`animation` with `@media (prefers-reduced-motion: reduce)`; canvas
  and JS effects check `window.matchMedia('(prefers-reduced-motion: reduce)')` and skip or
  draw a static frame (conventions in [[visual-effects]]).
- Decorative glyphs/tiles/canvases get `aria-hidden="true"` (and SVGs `focusable="false"`);
  error text gets `role="alert"`; the day/night toggle uses `aria-pressed`; a collapsed
  `PixelAccordion` panel is `aria-hidden` + `inert`.
- Catalog stamps carry a spoken `aria-label` ("Album catalog HS001") because `HS001` alone
  is noise to a screen reader.

## 9. Responsive

Desktop-first `max-width` queries with theme breakpoints:

```ts
@media (max-width: ${({ theme }) => theme.breakpoints.sm}) { … }
```

`sm` (480px) is the "phone" cut used by `PlayerBar`, `Nav` (stacks), `CatalogLine` (hides
everything but the stamp), `PixelWaveform` (36px canvas), upload form, album/admin pages.

## 10. Full-height layout inside the app

`AppShell` is `height: 100dvh; overflow: hidden` with `Main` as `flex: 1; min-height: 0`.
A page inside `(app)` should fill `Main` and scroll its own list region (see
`feed-page.styles.ts`): `flex: 1; min-height: 0; overflow-y: auto` on the scroller.
Standalone screens outside the shell (`/`, `/login`) use `Screen` from
`src/app/screen.styles.ts`. Because `(app)` pages scroll internally, anything that must
escape that clip (the `PixelAccordion` particle canvas) is appended to `document.body`
as `position: fixed` rather than rendered in place.

## 11. Testing

Use `renderWithTheme(ui)` from `@/test/renderWithTheme` — it wraps in the real
`ThemeProvider` with the day `theme`. **`renderWithTheme(ui, { dark: true })`** wraps in
`amberTheme` instead; use it for anything that branches on `theme.mode` or reads
`theme.effects`. Other `RenderOptions` pass through. Plain `render()` crashes on
`theme.colors` being undefined. Vitest runs in jsdom with `@testing-library/jest-dom`
matchers (`vitest.setup.ts`). Test behavior (clicks, disabled state, ARIA), not CSS values.

**jsdom has no canvas, rAF is real-ish, and `matchMedia` is missing.** Components that draw
(`PlaybackButton`, `PixelWaveform`, `PixelAccordion`, `GlitchArt`) bail out
when `getContext` returns `null` or `window.matchMedia` is undefined, so the recipe is:

```ts
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// 1. Silence "getContext not implemented" when you don't care about drawing (PlayerBar.test):
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

// 2. Or drive the drawing by hand (PixelAccordion.test, PixelWaveform.test):
vi.stubGlobal('matchMedia', () => ({ matches: false }));            // not reduced motion
let draw: FrameRequestCallback | undefined;
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { draw = cb; return 1; });
vi.stubGlobal('cancelAnimationFrame', vi.fn());
const ctx = { scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '', globalAlpha: 1 };
vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
  .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
renderWithTheme(<PixelAccordion id="t" open>…</PixelAccordion>);
draw!(performance.now() + 2000);                                     // one frame
expect(ctx.fillRect).toHaveBeenCalledTimes(4);

// 3. Reduced motion → assert no canvas / no timers:
vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
```

Include `addEventListener`/`removeEventListener` on the `matchMedia` stub when the component
subscribes to the query (`CRTTexture`, `SignInGlitch`). Timer-driven effects
(`SignInGlitch`, `CRTTexture`) use `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` and
`vi.getTimerCount()` to prove cleanup. Audio readers are injected through
`AudioMeterContext` / `AudioWaveformContext` providers in tests (there is no `AudioContext` in
the app; the readers come from stored peaks). The provider-level recipes (cookie, `renderToString`, `startViewTransition`)
are in [theme-mode.md](theme-mode.md).
