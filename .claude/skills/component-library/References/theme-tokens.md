# Reference: Theme tokens

Files: `src/lib/theme/tokens.ts`, `src/lib/theme/theme.ts`, `src/lib/theme/color.ts`,
`src/lib/theme/styled.d.ts`, `src/lib/theme/fonts.ts`. Tests: `src/lib/theme/theme.test.ts`,
`src/lib/theme/color.test.ts`. The mode switch itself is in [theme-mode.md](theme-mode.md).

## Two layers (the rule)

1. **`tokens.ts`** — raw values, each exported `as const`. **Raw hex literals live here and
   only here.** Nothing reads `palette` / `paletteAmber` / `effects` directly except `theme.ts`.
2. **`theme.ts`** — the objects handed to `ThemeProvider`. Two of them:
   - `theme` — day mode. `mode: 'light'`, `colors` renamed from `palette` to **semantic**
     names (`bgBase` → `colors.bg`), `effects: effects.light`, every other scale passed
     through unchanged.
   - `amberTheme` — night mode. `{ ...theme, mode: 'dark', colors: <paletteAmber mapped the
     same way>, effects: effects.dark }`. Same keys, same non-color scales (literally the same
     objects — `amberTheme.space === theme.space`).

   `AppTheme` is `Omit<typeof theme, 'colors' | 'mode' | 'effects'> & { mode: 'light' | 'dark';
   colors: Record<key, string>; effects: Record<key, string> }` — widened so both themes
   type-check against it (so `theme.colors.accent` is `string`, not a hex literal type).
   `SpaceKey = keyof AppTheme['space']`.

Components read **only** `theme.*` — `${({ theme }) => theme.colors.accent}` — and when they
need a translucent or canvas-friendly version of a token they call the helpers in `color.ts`
(below). Never concatenate alpha onto a hex (`${theme.colors.accent}22`): it silently breaks
if a token is ever a 3-digit hex, `currentColor`, or an rgb() string, and it hides the intent.

`styled.d.ts` augments `styled-components`' `DefaultTheme` with `AppTheme`, so
`${({ theme }) => theme.colors.accent}` is fully typed everywhere and a typo is a compile error.

## Scales

| Key | Values |
|---|---|
| `mode` | `'light'` on `theme`, `'dark'` on `amberTheme`. Branch on it (`theme.mode === 'dark' ? … : …`), never on a color value. |
| `colors` — day (`palette`) | `bg #e8e8e8`, `surface #e8e8e8`, `raised #f2f2f2`, `text #111111`, `muted #484848`, `faint #626262`, `border #111111`, `accent #ff6b1b`, `accentDim #e85b0d`, `success #111111`, `error #a33800`, `warning #a33800`, `info #484848` |
| `colors` — night (`paletteAmber`) | `bg #15110b`, `surface #15110b`, `raised #241b0d`, `text #ffd18a`, `muted #d0a86c`, `faint #ba945a`, `border #8b6635`, `accent #ffb642`, `accentDim #e59b2c`, `success #ffd18a`, `error #ffb642`, `warning #ffb642`, `info #d0a86c` |
| `effects` | Ambient-effect inks that aren't UI colors: `ink` (CRT scanlines/tracking), `vignette`, `particle` (pixel particles). Day: `ink #646464`, `vignette #505050`, `particle #b8b8b8`. Night: `ink` and `particle` = `paletteAmber.accent`, `vignette #505050`. Read as `theme.effects.ink` etc. (`CRTTexture`, `PixelAccordion`). |
| `space` | `none 0`, `xs .25rem`, `sm .5rem`, `md 1rem`, `lg 1.5rem`, `xl 2.5rem`, `xxl 4rem` |
| `fontSizes` | `xs .75`, `sm .875`, `md 1`, `lg 1.25`, `xl 1.5`, `2xl 2`, `3xl 3` (rem), `4xl clamp(2.5rem, 8vw, 5rem)` |
| `fonts` | `mono` = `'dico-mono', 'Courier New', ui-monospace, monospace`; `display` = `Arial, Helvetica, sans-serif` |
| `fontWeights` | `regular 400`, `medium 500`, `semibold 600`, `bold 700` — Dico Mono only ships 400 and 700, so on `mono` text `medium` renders as 400 and `semibold` as 700 (Arial has the full range) |
| `radii` | `none 0`, `sm 0`, `md 0`, `lg 0`, `pill 999px` — **everything is square** except the round controls (`PlayButton`, `IconButton`, spinner dot). Keep using the tokens so a future radius change is one edit. |
| `motion` | `fast 120ms`, `base 160ms`, `slow 240ms`, `ease cubic-bezier(0.4,0,0.2,1)` |
| `breakpoints` | `sm 480px`, `md 768px`, `lg 1024px`, `xl 1280px` (strings, used in `max-width` queries) |
| `zIndex` | `base 0`, `dropdown 100`, `sticky 200`, `modal 1000`, `toast 1100` (`CRTTexture` sits at `toast + 1`, pointer-events none) |

Surface ladder for depth: `bg` (page) → `surface` (cards, panels, the player bar) → `raised`
(toasts, placeholder tiles). In both modes `bg` and `surface` are currently the same hex —
depth comes from `border` lines and `raised`, not from fills. `accent` is the single hero
color: primary buttons, focus rings, hover sweeps, the glow halos and particle inks in night
mode.

## Palette intent

- **Day** is a flat gray (`#e8e8e8`) with near-black ink and one orange (`#ff6b1b`). Status
  colors fold into that monochrome: `success` is `text`, `error` and `warning` share a burnt
  orange, `info` is `muted`. Don't expect a green/red/yellow trio.
- **Night** is an "amber CRT": near-black warm `bg`, amber text, brighter amber `accent`.
  `success` = `text`, `error`/`warning` = `accent`, `info` = `muted`. The night `effects.ink`
  and `effects.particle` are the accent so scanlines and particles glow.
- `GlobalTheme` adds a faint accent `text-shadow` to body text and an accent `drop-shadow`
  to icons in night mode only (see [theme-mode.md](theme-mode.md)); components don't need
  to add their own glow for ordinary text.

Contrast (WCAG): day `text` on `bg` ≈ 15:1, `muted` ≈ 7.5:1, `faint` ≈ 5:1,
`accent #ff6b1b` on `#e8e8e8` ≈ 2.3:1 — so in day mode **accent is for UI parts (borders,
focus rings, icons, sweeps) and large/bold text, never small body copy**. The primary
`Button` deliberately puts `text` (near-black) on `accent` in day mode (≈ 6.6:1) and `bg` on
`accent` in night mode (`theme.mode` branch in `Button.tsx`). Night `text #ffd18a` on
`#15110b` ≈ 13:1, `accent #ffb642` ≈ 11:1.

## Color helpers (`src/lib/theme/color.ts`)

| Function | Use |
|---|---|
| `withAlpha(hex, alpha)` | `'#ff6b1b', 0.2` → `'rgba(255, 107, 27, 0.2)'`. Alpha is clamped to 0..1. Non-hex input (`'currentColor'`) is returned untouched. **This is how you get a 20 %-alpha accent in a styled-component:** `box-shadow: 0 0 6px ${({ theme }) => withAlpha(theme.colors.accent, 0.2)}`. |
| `rgbTriplet(hex)` | `'#646464'` → `'100, 100, 100'`, for canvas / CSS contexts that supply their own alpha per frame: `` ctx.fillStyle = `rgba(${ink}, ${0.014 + pulse * 0.012})` `` (`CRTTexture`), or inside a `calc()`-driven `rgba(` in `GlobalTheme`. |
| `hexToRgb(hex)` | `[r, g, b]` or `null`; the primitive the other two build on. Accepts `#rgb` and `#rrggbb`. |

Users today: `hoverStyles.ts`, `PlaybackButton.tsx`, `CRTTexture.tsx`, `ThemeModeProvider.tsx`.

## Fonts

Body/UI font is **Dico Mono** from an Adobe Fonts (Typekit) kit, not `next/font`. `fonts.ts`
exports `TYPEKIT_KIT_URL`, and `src/app/layout.tsx` renders a `preconnect` plus a
`<link rel="stylesheet">` for it in `<head>`. The kit defines the `'dico-mono'` family that
`fonts.mono` names directly (no CSS variables). Faces: Regular, Italic, Bold, Bold Italic.

**Display headings are not Dico Mono.** `fonts.display` is `Arial, Helvetica, sans-serif`
— a system font, nothing to load. It's used by `Heading` (tight `-0.045em` tracking, line
height 1.1), the album page `Title`, the `AppShell` brand name, `ArtistCard`'s name and
initials tile. `fonts.mono` is everything else (body `Text`, labels, buttons, inputs,
catalog stamps). Pick the token by role; don't name a family in a component.

The kit also has `'dico-mono-script'`. It was tried for headings and rejected, so don't use it.

## Adding or changing a token

- **New day color** → add to `palette` in `tokens.ts`, map it to a semantic name in `theme`
  (`theme.ts`). **New night color → add the same key to `paletteAmber`** and map it in
  `amberTheme`. Both palettes must have identical keys — `amberTheme: AppTheme` is typed
  from `theme`, so a key missing from one side is a compile error.
- New effect ink → `effects.light` **and** `effects.dark` in `tokens.ts`; read it as
  `theme.effects.<name>`. Don't put effect inks in `colors`.
- `theme.test.ts` pins a few values (day `accent`/`bg`/`error`, `space.md`, `motion.base`,
  `dico-mono` on `mono`, `Arial` on `display`, night `accent`/`bg`, `amberTheme.effects.ink
  === amberTheme.colors.accent`, day `effects.ink`). Update it if you intentionally change those.
- The style guide's Color block iterates the **day** `theme.colors` only (see Known gaps).
- `globals.css` hard-codes the **day** `#e8e8e8` / `#111111` and the `'dico-mono'` stack
  (see [ssr-registry.md](ssr-registry.md)); change them there too if day `bg`/`text` change.
  Night users never see those literals because the server renders `amberTheme`'s
  `GlobalTheme` into the same HTML ([theme-mode.md](theme-mode.md)).
- One-off pixel values (e.g. `padding: 0.55rem 0.75rem` in `fieldStyles`, the 2.25rem round
  controls, `130px` particle canvases) are accepted inside components; reach for a token for
  anything reused across files. One-off **colors** are not accepted — derive them with
  `withAlpha`/`rgbTriplet` from a token, or add a token.
