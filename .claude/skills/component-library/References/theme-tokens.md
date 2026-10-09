# Reference: Theme tokens

Files: `src/lib/theme/tokens.ts`, `src/lib/theme/theme.ts`, `src/lib/theme/styled.d.ts`,
`src/lib/theme/fonts.ts`. Test: `src/lib/theme/theme.test.ts`.

## Two layers

1. **`tokens.ts`** — raw values, each exported `as const`. Nothing reads `palette` directly
   except `theme.ts`.
2. **`theme.ts`** — the object handed to `ThemeProvider`. It renames palette entries to
   **semantic** names (`bgBase` → `colors.bg`) and passes every other scale through unchanged.
   `export type AppTheme = typeof theme` and `SpaceKey = keyof AppTheme['space']`.

`styled.d.ts` augments `styled-components`' `DefaultTheme` with `AppTheme`, so
`${({ theme }) => theme.colors.accent}` is fully typed everywhere and a typo is a compile error.

## Scales

| Key | Values |
|---|---|
| `colors` | `bg #282723`, `surface #32312c`, `raised #3c3a35`, `text #d1ccc1`, `muted #9a958b`, `faint #85817a`, `border #4a4842`, `accent #eb4601`, `accentDim #c93c01`, `success #3fb950`, `error #f85149`, `warning #d29922`, `info #58a6ff` |
| `space` | `none 0`, `xs .25rem`, `sm .5rem`, `md 1rem`, `lg 1.5rem`, `xl 2.5rem`, `xxl 4rem` |
| `fontSizes` | `xs .75`, `sm .875`, `md 1`, `lg 1.25`, `xl 1.5`, `2xl 2`, `3xl 3` (rem), `4xl clamp(2.5rem, 8vw, 5rem)` |
| `fonts` | `mono` = `'dico-mono'` + monospace fallbacks; `display` = the same `'dico-mono'` stack (kept as a separate token so headings can diverge later) |
| `fontWeights` | `regular 400`, `medium 500`, `semibold 600`, `bold 700` — Dico Mono only ships 400 and 700, so `medium` renders as 400 and `semibold` as 700 |
| `radii` | `none`, `sm 2px`, `md 4px`, `lg 8px`, `pill 999px` |
| `motion` | `fast 120ms`, `base 160ms`, `slow 240ms`, `ease cubic-bezier(0.4,0,0.2,1)` |
| `breakpoints` | `sm 480px`, `md 768px`, `lg 1024px`, `xl 1280px` (strings, used in `max-width` queries) |
| `zIndex` | `base 0`, `dropdown 100`, `sticky 200`, `modal 1000`, `toast 1100` |

Surface ladder for depth: `bg` (page) → `surface` (cards, panels, alerts) → `raised` (toasts,
placeholder tiles). `accent` (red-orange) is the single hero color: primary buttons, focus rings,
hover states, links.

## Brand colors

`bg #282723`, `text #d1ccc1`, and `accent #eb4601` come from the brand palette. The
other neutrals (`surface`, `raised`, `border`, `muted`, `faint`) and `accentDim` are
derived from them, in the same warm hue, to keep the depth ladder. Status colors
(`success`/`error`/`warning`/`info`) are unchanged.

Contrast on `bg`: `text` 9.3:1, `muted` 5.0:1, `faint` 3.9:1, `accent` 3.85:1. So `accent`
passes WCAG AA for large or bold text and UI parts (focus rings, borders, icons), but **not**
for small body text. Keep small accent-colored text bold or large. Primary buttons put
`bg`-colored text on `accent` (3.85:1); the `accentDim` hover is lower (2.9:1).

## Fonts

The font comes from an Adobe Fonts (Typekit) kit, not `next/font`. `fonts.ts` exports
`TYPEKIT_KIT_URL`, and `src/app/layout.tsx` renders a `preconnect` plus a
`<link rel="stylesheet">` for it in `<head>`. The kit defines the `'dico-mono'` family that
`fonts.mono` and `fonts.display` name directly (no CSS variables). Faces: Regular, Italic,
Bold, Bold Italic.

The kit also has `'dico-mono-script'`. It was tried for headings and rejected, so don't use it.

Today the whole UI is Dico Mono. `display` is used for headings (`Heading`, page `h1`/`h2`s,
the `AppShell` brand name, big initials placeholders), and `mono` for everything else. They
resolve to the same font. Headings stand out through weight and size, not a different face.
Pick the token by role anyway, so swapping a heading font later is a one-line change.

## Adding or changing a token

- New raw value → `tokens.ts`; if it's a color, also map it to a semantic name in `theme.ts`.
- `theme.test.ts` pins a few values (accent, bg, error, `space.md`, `motion.base`, the
  `dico-mono` family on both `mono` and `display`). Update it if you intentionally change those.
- The style guide's Color block iterates `theme.colors`, so a new color shows up there
  automatically.
- `globals.css` hard-codes `#282723` / `#d1ccc1` and the `'dico-mono'` stack (see [ssr-registry.md](ssr-registry.md));
  change them there too if `bg`/`text` change.
- One-off pixel values (e.g. `padding: 0.55rem 0.75rem` in `fieldStyles`) are accepted
  inside components; reach for a token for anything reused across files.
