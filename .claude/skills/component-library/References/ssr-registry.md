# Reference: styled-components SSR registry

Files: `src/lib/registry.tsx`, `src/app/layout.tsx`, `next.config.ts`, `src/app/globals.css`.

## Why it exists

With the App Router, styled-components generates CSS while React renders on the server, but
nothing puts that CSS in the HTML by default. Without the registry the first paint is
unstyled and then "pops" on hydration (FOUC). `registry.tsx` is the pattern from the Next.js
styled-components docs.

## How it works

`StyledComponentsRegistry` is a `'use client'` component wrapping all `<body>` children in
the root layout.

- **Server render:** a `ServerStyleSheet` is created once per request (`useState(() => new
  ServerStyleSheet())`). Children render inside `<StyleSheetManager sheet={sheet.instance}>`,
  so every styled-component writes its rules into that sheet. `useServerInsertedHTML` flushes
  the collected `<style>` elements into the streamed HTML and then calls
  `instance.clearTag()` so the next streamed chunk doesn't repeat them.
- **Client:** `typeof window !== 'undefined'` short-circuits — no `StyleSheetManager`, the
  browser runtime injects styles normally.
- **Both:** children are wrapped in `<ThemeProvider theme={theme}>`. This is the **only**
  `ThemeProvider` in the app; every styled-component in the tree gets `theme` from here.

`next.config.ts` sets `compiler: { styledComponents: true }` — the SWC transform that gives
stable, SSR-matching class names (prevents server/client class mismatch warnings) and
readable display names in dev.

## `globals.css`

A tiny reset (`box-sizing`, zero margins) plus `html, body` background/text/font set as
**literal values** (`#282723`, `#d1ccc1`, the `'dico-mono'` stack). They duplicate the theme on
purpose: they apply before any styled-component CSS loads, so there's no white flash. Keep
them in sync with `theme.colors.bg` / `.text`.

## The exception: `not-found.tsx`

`src/app/not-found.tsx` renders under the root layout but uses **inline `style={{…}}`**
rather than components — it's an async server component and is deliberately independent of
the styled-components tree. Don't "fix" it by importing components unless you move the
styled bits into a client module.

## Gotchas

- Need a theme in a test? There's no registry in Vitest — use `renderWithTheme` (see
  [styling-conventions.md](styling-conventions.md)).
- Don't add a second `ThemeProvider` lower in the tree; it would shadow the root one.
- The registry is a client component, but its `children` can still be server components
  (they're passed through as already-rendered RSC payload).
