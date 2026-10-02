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
| `colors` | `bg #14141a`, `surface #1c1c24`, `raised #24242e`, `text #f5f0e6`, `muted #a3a3a3`, `faint #6b6b73`, `border #2e2e38`, `accent #ffd000`, `accentDim #b39400`, `success #3fb950`, `error #f85149`, `warning #d29922`, `info #58a6ff` |
| `space` | `none 0`, `xs .25rem`, `sm .5rem`, `md 1rem`, `lg 1.5rem`, `xl 2.5rem`, `xxl 4rem` |
| `fontSizes` | `xs .75`, `sm .875`, `md 1`, `lg 1.25`, `xl 1.5`, `2xl 2`, `3xl 3` (rem), `4xl clamp(2.5rem, 8vw, 5rem)` |
| `fonts` | `mono` = `var(--font-mono)` + fallbacks; `display` = `var(--font-display)` + fallbacks |
| `fontWeights` | `regular 400`, `medium 500`, `semibold 600`, `bold 700` |
| `radii` | `none`, `sm 2px`, `md 4px`, `lg 8px`, `pill 999px` |
| `motion` | `fast 120ms`, `base 160ms`, `slow 240ms`, `ease cubic-bezier(0.4,0,0.2,1)` |
| `breakpoints` | `sm 480px`, `md 768px`, `lg 1024px`, `xl 1280px` (strings, used in `max-width` queries) |
| `zIndex` | `base 0`, `dropdown 100`, `sticky 200`, `modal 1000`, `toast 1100` |

Surface ladder for depth: `bg` (page) → `surface` (cards, panels, alerts) → `raised` (toasts,
placeholder tiles). `accent` (yellow) is the single hero color: primary buttons, focus rings,
hover states, links.

## Fonts

`fonts.ts` loads both families with `next/font/google` (weights 400–700, `display: swap`) and
exposes them as CSS variables. `src/app/layout.tsx` puts `plexMono.variable` and
`spaceGrotesk.variable` on `<html>`, which is what makes `var(--font-mono)` /
`var(--font-display)` resolve. Voice: **display** (Space Grotesk) for headings and prose;
**mono** (Plex Mono) for labels, buttons, metadata, and anything "system".

## Adding or changing a token

- New raw value → `tokens.ts`; if it's a color, also map it to a semantic name in `theme.ts`.
- `theme.test.ts` pins a few values (accent, bg, error, `space.md`, `motion.base`, mono
  font var). Update it if you intentionally change those.
- The style guide's Color block iterates `theme.colors`, so a new color shows up there
  automatically.
- `globals.css` hard-codes `#14141a` / `#f5f0e6` (see [ssr-registry.md](ssr-registry.md));
  change them there too if `bg`/`text` change.
- One-off pixel values (e.g. `padding: 0.55rem 0.75rem` in `fieldStyles`) are accepted
  inside components; reach for a token for anything reused across files.
