---
name: component-library
description: Use when building or restyling any UI in Human Services — adding a component under `src/components/`, writing a `*.styles.ts` file, using theme tokens (`src/lib/theme/tokens.ts`, `theme.ts`, `fonts.ts`), touching the styled-components SSR registry (`src/lib/registry.tsx`, `src/app/layout.tsx`), the `/style-guide` page, `globals.css`, or `renderWithTheme` in tests. Also when a styled-component errors inside a Server Component, styles flash unstyled on first load, or a `$`-prefixed prop warning appears.
---

# Component Library + Theme

The design system every page is assembled from: ~25 styled-components primitives in
`src/components/`, one dark theme built from raw tokens, and the SSR registry that makes
styled-components render correctly under the Next.js App Router. **styled-components only**
— no Tailwind, no CSS Modules (project rule, see `CLAUDE.md`).

## The one thing to understand first

**Every styled-component lives in a `'use client'` module, and Server Components only
import them.** styled-components needs React context (the theme), which Server Components
can't use. So the pattern is: an async server `page.tsx` does the data work and imports its
styled pieces from a sibling `*.styles.ts` file that starts with `'use client'`. Defining a
`styled.x` inline in a server page breaks at request time (this happened once — commit
`2810abf`). The registry then collects the styles generated during SSR and injects them into
the HTML `<head>`, so the first paint is styled.

## Pieces

| Concern | Where |
|---|---|
| Raw values (palette, space, type, radii, motion, breakpoints, zIndex) | `src/lib/theme/tokens.ts` |
| Semantic theme object + `AppTheme` / `SpaceKey` types | `src/lib/theme/theme.ts` |
| `DefaultTheme` augmentation (typed `theme` in every template) | `src/lib/theme/styled.d.ts` |
| Fonts (`--font-mono` IBM Plex Mono, `--font-display` Space Grotesk) | `src/lib/theme/fonts.ts` |
| SSR style registry + `ThemeProvider` | `src/lib/registry.tsx` |
| Root layout: font variables on `<html>`, registry around `<body>` children | `src/app/layout.tsx` |
| Global reset + pre-hydration bg/text colors | `src/app/globals.css` |
| SWC styled-components transform | `next.config.ts` (`compiler.styledComponents`) |
| Component barrel | `src/components/index.ts` |
| Shared input styles (`Input`/`Textarea`/`Select`) | `src/components/field/fieldStyles.ts` |
| Full-height centered shell for standalone screens | `src/app/screen.styles.ts` (`Screen`) |
| Live catalog of every component (dev only) | `src/app/style-guide/page.tsx` (404s in production via `layout.tsx`) |
| Test render helper | `src/test/renderWithTheme.tsx` |

## References

- [theme-tokens.md](References/theme-tokens.md) — every token scale, how `theme.ts` maps the
  palette to semantic color names, fonts, and when to add a token vs. hard-code.
- [ssr-registry.md](References/ssr-registry.md) — how `registry.tsx` works on server vs.
  client, the SWC compiler flag, `globals.css` duplication, and the not-found exception.
- [component-catalog.md](References/component-catalog.md) — each component, its props and
  transient props, and which feature owns the composite ones (Player, Feed, Upload, AppShell).
- [styling-conventions.md](References/styling-conventions.md) — `'use client'` + `*.styles.ts`,
  `$` transient props, folder/barrel layout, a11y defaults, responsive pattern, and testing.

## Depends on

Nothing — this is foundational. Feature skills that build on it:
[[timeline-player]], [[admin-upload]], [[auth]] (login screen), [[artists-read]].

## Known gaps (as of 2026-10-02)

- One theme only (dark). No light mode, no theme switching.
- `Link` is a styled `<a>`, not `next/link`; in-app navigation uses `styled(Link)` from
  `next/link` locally (see `AppShell`, `Pagination`). Use the right one — see the catalog.
- `Modal` has Escape + overlay-close but no focus trap.
- Player icons/artwork are placeholders pending a design pass.

A code guide (reading order through the theme → registry → components) is in
`Walkthrough/walkthrough.md` (gitignored).
