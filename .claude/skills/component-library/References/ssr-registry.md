# Reference: styled-components SSR registry

Files: `src/lib/registry.tsx`, `src/app/layout.tsx`, `src/lib/theme/ThemeModeProvider.tsx`,
`next.config.ts`, `src/app/globals.css`.

## Why it exists

With the App Router, styled-components generates CSS while React renders on the server, but
nothing puts that CSS in the HTML by default. Without the registry the first paint is
unstyled and then "pops" on hydration (FOUC). `registry.tsx` is the pattern from the Next.js
styled-components docs, plus one project twist: it also mounts the theme-mode provider with
the server-read cookie so the first paint is in the right **mode**, not just styled.

## How it works

`StyledComponentsRegistry({ children, initialDark = false })` is a `'use client'` component
wrapping all `<body>` children in the root layout.

- **Server render:** a `ServerStyleSheet` is created once per request (`useState(() => new
  ServerStyleSheet())`). Children render inside `<StyleSheetManager sheet={sheet.instance}>`,
  so every styled-component writes its rules into that sheet. `useServerInsertedHTML` flushes
  the collected `<style>` elements into the streamed HTML and then calls
  `instance.clearTag()` so the next streamed chunk doesn't repeat them.
- **Client:** `typeof window !== 'undefined'` short-circuits — no `StyleSheetManager`, the
  browser runtime injects styles normally.
- **Both:** children are wrapped in `<ThemeModeProvider initialDark={initialDark}>`. That
  provider owns the **only** styled `ThemeProvider` in the app (`theme` or `amberTheme`,
  see [theme-mode.md](theme-mode.md)) and renders the `GlobalTheme` global style, so every
  styled-component in the tree — and `html, body` — gets the current mode from here.

`next.config.ts` sets `compiler: { styledComponents: true }` — the SWC transform that gives
stable, SSR-matching class names (prevents server/client class mismatch warnings) and
readable display names in dev.

## The root layout

`src/app/layout.tsx` is an **async server component**:

```tsx
const initialDark = isDarkCookieValue((await cookies()).get(THEME_COOKIE)?.value);
…
<head>  {/* Adobe Fonts preconnect + kit stylesheet */}
<body>
  <StyledComponentsRegistry initialDark={initialDark}>
    {children}
    <CRTTexture />
  </StyledComponentsRegistry>
</body>
```

- The cookie read is what makes night mode flash-free: the HTML is rendered with
  `amberTheme` when `hs-theme=night`, and `GlobalTheme`'s amber `html, body` rules are in
  that HTML. Reading the preference on the client (e.g. `localStorage`) would render gray
  first. Keep this read in the layout; don't move it into a client effect.
- `<CRTTexture />` is mounted **once, here, inside the registry** (it's a styled client
  component and reads `theme.effects.*`, so it must be under the provider). It's a fixed,
  `pointer-events: none` canvas at `zIndex.toast + 1` covering every route, including `/`
  and `/login`. Don't mount it again in a page or shell; see
  [component-catalog.md](component-catalog.md) and the [[visual-effects]] skill.
- The Adobe Fonts kit `<link>` lives in `<head>` (see [theme-tokens.md](theme-tokens.md));
  `./globals.css` is imported here too.

## `globals.css`

A tiny reset (`box-sizing`, zero margins), `html, body { max-width: 100vw; overflow-x: hidden }`,
and background/text/font set as **literal values**: `#e8e8e8`, `#111111`, the `'dico-mono'`
stack. They duplicate the **day** theme on purpose: they apply before any styled-component CSS
loads, so there's no white flash. Keep them in sync with day `theme.colors.bg` / `.text`.
Night users are covered by the server-rendered `GlobalTheme`, not by this file.

It also registers the hover custom property:

```css
@property --hover-progress { syntax: '<number>'; inherits: true; initial-value: 0; }
```

Registering it is what lets `iconSweepStyles` **transition** `--hover-progress` (unregistered
custom properties can't animate) and lets `SweepIcon`'s clip rect and `GlobalTheme`'s icon
glow read it as a number. It lives in this static stylesheet (not in `GlobalTheme`) so it is
registered before any component CSS and independently of the mode provider; keep it here.

Things that **used to** be in `globals.css` and now belong to `GlobalTheme` in
`ThemeModeProvider.tsx`: `::selection` colors, `color-scheme`, any themed `html, body` rule.
Don't re-add them here; they'd be mode-blind.

## The exception: `not-found.tsx`

`src/app/not-found.tsx` renders under the root layout but uses **inline `style={{…}}`**
rather than components — it's an async server component and is deliberately independent of
the styled-components tree. Don't "fix" it by importing components unless you move the
styled bits into a client module.

## Gotchas

- Need a theme in a test? There's no registry in Vitest — use `renderWithTheme` (day) or
  `renderWithTheme(ui, { dark: true })` (night); see
  [styling-conventions.md](styling-conventions.md).
- Don't add a second `ThemeProvider` (or `ThemeModeProvider`) lower in the tree; it would
  shadow the root one and break the toggle.
- The registry is a client component, but its `children` can still be server components
  (they're passed through as already-rendered RSC payload).
- `CRTTexture` is a sibling *after* `{children}` inside the registry, so it paints above
  page content; its canvas ignores pointer events, so nothing underneath is blocked.
