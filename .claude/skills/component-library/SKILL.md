---
name: component-library
description: Use when building or restyling any UI in Human Services — adding a component under `src/components/`, writing a `*.styles.ts` file, using theme tokens (`tokens.ts`: `palette`/`paletteAmber`/`effects`; `theme.ts`: `theme`/`amberTheme`, `theme.mode`, `theme.effects`), `withAlpha`/`rgbTriplet` (`color.ts`), day/night mode (`ThemeModeProvider`, `useThemeMode`, the `hs-theme` cookie), the hover/sweep system (`hoverStyles`, `SweepIcon`, `--hover-progress`), the SSR registry (`registry.tsx`, `layout.tsx`, `CRTTexture` mount), `/style-guide`, `globals.css`, `renderWithTheme` (incl. `{ dark: true }`), or toasts (`ToastProvider`/`useToast`/`useOptionalToast`, `--toast-offset`). Also when a styled-component errors inside a Server Component, styles flash unstyled on first load, a night-mode user sees a gray flash, text vanishes in forced-colors mode, a `$`-prefixed prop warning appears, or "useToast must be used within a ToastProvider" is thrown.
---

# Component Library + Theme

The design system every page is assembled from: ~25 styled-components primitives plus a
handful of effect components in `src/components/`, **two themes** (gray "day" and amber
"night") built from raw tokens, and the SSR registry that makes styled-components render
correctly under the Next.js App Router. **styled-components only** — no Tailwind, no CSS
Modules (project rule, see `CLAUDE.md`). The visual direction (gray + orange day, amber CRT
night, square corners, Dico Mono body, Arial display headings, pixel/scanline effects) came
from a designer's pass and is authoritative — extend it, don't re-decide it.

## The one thing to understand first

**Every styled-component lives in a `'use client'` module, and Server Components only
import them.** styled-components needs React context (the theme), which Server Components
can't use. So the pattern is: an async server `page.tsx` does the data work and imports its
styled pieces from a sibling `*.styles.ts` file that starts with `'use client'`. Defining a
`styled.x` inline in a server page breaks at request time (this happened once — commit
`2810abf`). The registry then collects the styles generated during SSR and injects them into
the HTML `<head>`, so the first paint is styled — in whichever mode the `hs-theme` cookie
says, because the root layout reads that cookie on the server.

## Pieces

| Concern | Where |
|---|---|
| Raw values: `palette` (day), `paletteAmber` (night), `effects` (ink/vignette/particle/panel/shadow per mode), space, type, radii (all `0` except `pill`), motion, breakpoints, zIndex | `src/lib/theme/tokens.ts` |
| Semantic themes `theme` (`mode: 'light'`) + `amberTheme` (`mode: 'dark'`), `theme.effects`, `AppTheme` / `SpaceKey` types | `src/lib/theme/theme.ts` |
| `hexToRgb` / `rgbTriplet` / `withAlpha` — the only sanctioned way to get translucent or canvas colors from a token | `src/lib/theme/color.ts` |
| `DefaultTheme` augmentation (typed `theme` in every template) | `src/lib/theme/styled.d.ts` |
| Fonts: Dico Mono via Adobe Fonts kit (`TYPEKIT_KIT_URL`) for `fonts.mono`; `fonts.display` is `Arial, Helvetica, sans-serif` | `src/lib/theme/fonts.ts`, `tokens.ts` |
| Day/night switch: `ThemeModeProvider` (styled `ThemeProvider` + `GlobalTheme` global style), `useThemeMode()` → `{ dark, toggle }`, View Transition "roll" | `src/lib/theme/ThemeModeProvider.tsx` |
| Night-mode preference cookie `hs-theme=night\|day` (`THEME_COOKIE`, `isDarkCookieValue`, `readThemeCookie`, `themeCookieString`) | `src/lib/theme/mode-cookie.ts` |
| SSR style registry; mounts `ThemeModeProvider` with `initialDark` | `src/lib/registry.tsx` |
| Root layout: reads the cookie with `cookies()`, Adobe Fonts `<link>`, registry around `<body>` children, mounts `<CRTTexture />` once | `src/app/layout.tsx` |
| Global reset, `@property --hover-progress`, pre-hydration day bg/text literals | `src/app/globals.css` |
| Hover/sweep mixins `textSweepStyles`, `textHoverState`, `iconSweepStyles` (+ forced-colors fallback) | `src/components/field/hoverStyles.ts` |
| `SweepIcon` (two-layer clipped SVG that reveals accent on hover), `PlaybackIcon`, `PlaybackButton`, `PixelWaveform` | `src/components/Player/` |
| `CRTTexture` (scanlines/vignette/tracking band), `GlitchArt` (image tears), `SignInGlitch` (SVG displacement bursts), `PixelAccordion` (collapse + pixel particles), `CatalogId` / `CatalogLine` (`HS###` / `HSS###` stamps) | `src/components/CRTTexture/`, `GlitchArt/`, `Login/`, `Feed/`, `CatalogId/` |
| SWC styled-components transform | `next.config.ts` (`compiler.styledComponents`) |
| Component barrel | `src/components/index.ts` |
| Shared input styles (`Input`/`Textarea`/`Select`) | `src/components/field/fieldStyles.ts` |
| Full-height centered shell for standalone screens | `src/app/screen.styles.ts` (`Screen`) |
| Live catalog of the primitives (dev only) | `src/app/style-guide/page.tsx` (404s in production via `layout.tsx`) |
| Toasts: `ToastProvider` mounted once in `AppShell`; `--toast-offset` (set on its Wrapper: 4rem, 6rem at ≤`sm` where the player bar wraps to two rows) lifts them above the player bar; any page under `(app)` can call `useToast()`, so don't add another provider; components that may render outside it (feed rows in tests/reuse) use `useOptionalToast()` → `null` | `src/components/AppShell/AppShell.tsx`, `src/components/Toast/` |
| Day/night toggle button in the nav (`useThemeMode`, `PlayButton` + `SweepIcon` sun/moon, `aria-pressed`) | `src/components/AppShell/AppShell.tsx` |
| Test render helper — `renderWithTheme(ui)` (day) / `renderWithTheme(ui, { dark: true })` (night) | `src/test/renderWithTheme.tsx` |

## References

- [theme-tokens.md](References/theme-tokens.md) — both palettes, `effects`, every other
  scale, how `theme.ts` maps them, fonts, the color helpers, and when to add a token vs.
  hard-code.
- [theme-mode.md](References/theme-mode.md) — `ThemeModeProvider` / `useThemeMode`, the
  `hs-theme` cookie and why it isn't `localStorage`, the entrance-page rule, `GlobalTheme`,
  and the View Transition roll.
- [ssr-registry.md](References/ssr-registry.md) — how `registry.tsx` works on server vs.
  client, the cookie → `initialDark` hand-off, `CRTTexture` in the layout, the SWC compiler
  flag, `globals.css`, and the not-found exception.
- [component-catalog.md](References/component-catalog.md) — each component, its props and
  transient props, the effect components, and which feature owns the composite ones.
- [styling-conventions.md](References/styling-conventions.md) — `'use client'` + `*.styles.ts`,
  `$` transient props, the two-layer color rule, `theme.mode` branching, the hover/sweep
  system, forced-colors, folder/barrel layout, a11y/motion defaults, responsive pattern, and
  the canvas/rAF/matchMedia test recipe.

## Depends on

Nothing — this is foundational. Feature skills that build on it:
[[timeline-player]], [[admin-upload]], [[auth]] (login screen), [[artists-read]].
The canvas / SVG-filter / Web Audio *mechanics* behind `CRTTexture`, `GlitchArt`,
`SignInGlitch`, `PixelAccordion`, `PlaybackButton` and `PixelWaveform` (frame budgets,
visibility + reduced-motion handling, analyser wiring) are the [[visual-effects]] skill;
this skill only says what those components are, where they mount, and how they get their
colors.

## Known gaps (as of 2026-10-11)

- `/style-guide` predates the design pass: its copy still says "Dark theme" / "headings use
  Dico Mono too", its Color grid imports the day `theme` statically (components on the page
  do follow the cookie's mode via the root provider, the swatches don't), and it shows none
  of the effect components or the hover/sweep system.
- The effect/catalog components (`CatalogId`, `CatalogLine`, `SweepIcon`, `PlaybackButton`,
  `PlaybackIcon`, `PixelWaveform`, `PixelAccordion`, `CRTTexture`, `GlitchArt`,
  `SignInGlitch`) are **not** barrel-exported — import from their folder paths.
- Status tones fold into the monochrome palette: in day `success` = `text`, `error` =
  `warning` = `#a33800`, `info` = `muted`; in night `error` = `warning` = `accent`. A
  `Tag $tone="success"` is visually the default tag.
- `Modal`'s overlay still hard-codes `rgba(0, 0, 0, 0.6)` (predates `withAlpha`).
- `GlitchArt` is wired into the album page's `Art` styled component but not rendered there
  until image upload ships (`album_art_url` holds an unsigned R2 key); `ArtistCard` does
  render it when a photo URL exists.
- `Link` is a styled `<a>`, not `next/link`; in-app navigation uses `styled(Link)` from
  `next/link` locally (see `AppShell`, `Pagination`), or renders `<Link as={NextLink} href=…>`
  for a themed in-app link (see `ArtistsTable`, `UsersTable`, the album page). A bare
  `next/link` renders browser-default blue — never ship one unstyled.
- `Modal` has Escape + overlay-close but no focus trap.
- The day/night toggle lives only in `AppShell`'s nav; `/` and `/login*` are always amber
  and have no toggle.

A code guide (reading order through the theme → mode provider → registry → components →
effects) is in `Walkthrough/walkthrough.md` (gitignored).
