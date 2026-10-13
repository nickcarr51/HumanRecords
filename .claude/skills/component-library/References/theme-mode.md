# Reference: Day / night mode

Files: `src/lib/theme/ThemeModeProvider.tsx`, `src/lib/theme/mode-cookie.ts`,
`src/lib/registry.tsx`, `src/app/layout.tsx`, `src/components/AppShell/AppShell.tsx` (the
toggle). Tests: `src/lib/theme/ThemeModeProvider.test.tsx`, `src/lib/theme/mode-cookie.test.ts`.

## What it is

Two full themes — gray **day** (`theme`, `mode: 'light'`) and amber **night** (`amberTheme`,
`mode: 'dark'`), see [theme-tokens.md](theme-tokens.md) — and one provider that decides
which one every styled-component sees:

```tsx
<ThemeMode.Provider value={{ dark, toggle }}>
  <ThemeProvider theme={dark ? amberTheme : theme}>
    <GlobalTheme />
    {children}
  </ThemeProvider>
</ThemeMode.Provider>
```

`ThemeModeProvider` is the **only** styled `ThemeProvider` in the app (mounted by
`registry.tsx`, see [ssr-registry.md](ssr-registry.md)). Don't add another.

## `useThemeMode()`

`const { dark, toggle } = useThemeMode()` — `dark` is a boolean, `toggle` flips it. The
context default is `{ dark: false, toggle: noop }`, so the hook never throws (a component
rendered under a bare `ThemeProvider` in a test just sees day). Only `AppShell`'s nav button
calls it today (`PlayButton` + `SweepIcon` sun/moon, `aria-pressed={dark}`, `aria-label`
"Switch to night/day mode"). Inside styled templates don't use the hook — read `theme.mode`.

## How `dark` is decided

```ts
const savedDark = useSyncExternalStore(subscribe, snapshot, () => initialDark);
const entrance = pathname === '/' || pathname === '/login' || pathname?.startsWith('/login/');
const dark = Boolean(entrance) || savedDark;
```

- **Entrance pages are always amber.** `/`, `/login` and anything under `/login/` render
  night regardless of the saved preference; leaving them restores whatever the cookie says
  (`ThemeModeProvider.test.tsx` covers this). The preference is not overwritten by visiting
  them. There's no toggle there because `AppShell` isn't mounted on those routes.
- Everywhere else, `savedDark` is the **cookie**. `snapshot()` reads `document.cookie`
  through `readThemeCookie`; if that throws or the cookie is absent it falls back to an
  in-memory `sessionDark` (so a blocked-cookie browser still toggles for the session). The
  server snapshot is the `initialDark` prop.
- Changes are broadcast with a window event (`humanrecords-theme-change`) that
  `useSyncExternalStore` subscribes to, so every provider instance re-reads the cookie.

## The cookie (`mode-cookie.ts`)

| Export | |
|---|---|
| `THEME_COOKIE` | `'hs-theme'` |
| `ThemeCookieValue` | `'night' \| 'day'` — only `'night'` means dark (`isDarkCookieValue`) |
| `readThemeCookie(cookieString)` | `true` / `false` / `null` (unset) from a `document.cookie`-style string |
| `themeCookieString(dark)` | `hs-theme=night; path=/; max-age=31536000; samesite=lax` — a year, site-wide, lax |

**Why a cookie and not `localStorage` — and why night users get no gray flash.** The root
layout is a server component: `src/app/layout.tsx` does
`isDarkCookieValue((await cookies()).get(THEME_COOKIE)?.value)` and passes the result as
`initialDark` → `StyledComponentsRegistry` → `ThemeModeProvider`. The provider's server
snapshot is that prop, so the SSR HTML is rendered with `amberTheme` and the registry flushes
`GlobalTheme`'s amber `html, body { background; color }` rules into that same HTML. The first
paint is already amber and hydration agrees with it (`useSyncExternalStore` returns
`initialDark` on the server and the cookie on the client — the same value). A `localStorage`
preference can only be read after JavaScript runs, which would mean a gray server render
followed by a switch — the flash this design avoids. **There is no `localStorage` in this
system; don't add one.** The only literals that paint before any styled CSS are the day
colors in `globals.css`, and the inlined amber rules override them in the same document.

## `GlobalTheme`

Besides `html, body` background/color/`color-scheme`, `GlobalTheme` sets the themed
`accent-color` (native checkboxes/range inputs), `-webkit-tap-highlight-color`
(`withAlpha(accent, 0.15)`), a global `:focus-visible` ring (`2px solid accent`, offset 2px,
via `:where(a, button, input, select, textarea, [tabindex])`), and `caret-color` on text
inputs. Components should not re-declare focus rings; they inherit this one.

A `createGlobalStyle` rendered inside the `ThemeProvider`, so it re-renders with the mode:

- `html, body { background: theme.colors.bg; color: theme.colors.text; color-scheme: theme.mode }`
  — the themed replacement for what `globals.css` can only hard-code. `color-scheme` makes
  native form controls, scrollbars and the search-cancel button follow the mode.
- `body { text-shadow }` — a faint accent glow (`withAlpha(accent, 0.12)`) in night mode,
  `none` in day; `button, input, select, textarea, a { text-shadow: inherit }` so controls
  glow too.
- `button svg, a svg { overflow: visible; filter: drop-shadow(0 0 3px rgba(<accent triplet>,
  calc(<0.08 in night, 0 in day> + var(--hover-progress, 0) * 0.14))) }` — the icon glow that
  the hover system drives (see the hover section in
  [styling-conventions.md](styling-conventions.md)). Uses `rgbTriplet` because the alpha is a
  `calc()`.
- `::selection { background: accent; color: bg }` — this **moved here from `globals.css`**;
  don't re-add it there.
- The View Transition rules below.

## The toggle and the View Transition "roll"

`toggle()`:

1. Computes `nextDark = !dark`; `update()` sets `sessionDark`, writes the cookie
   (`document.cookie = themeCookieString(nextDark)`, in a try/catch), and dispatches the
   change event.
2. If `document.startViewTransition` is missing **or** `prefers-reduced-motion: reduce`
   matches → just `update()`.
3. Otherwise sets `html[data-theme-reveal="night" | "day"]` and calls
   `document.startViewTransition(() => flushSync(update))`. `flushSync` makes React commit the
   new theme inside the transition's DOM-update callback so the "new" snapshot is the new
   mode. `transition.ready.catch(() => {})` swallows the rejection when the browser skips the
   animation (the update still ran).

The animation in `GlobalTheme`: the old and new root snapshots stack (`old` z-index 1, `new`
z-index 2, both `animation: none; mix-blend-mode: normal` so the real page — text, icons,
the CRT canvas — is what's revealed, not a cross-fade). `night-roll` clips the new page from
`inset(0 0 100% 0)` to `inset(0)` over 1300ms (night rolls **down** from the top);
`day-roll` goes `inset(100% 0 0 0)` → `inset(0)` over 1100ms (day rolls **up** from the
bottom). `::view-transition-group(root)` is given the 1300ms duration. Reduced motion
forces `animation: none !important`.

`data-theme-reveal` is never cleared; the next toggle overwrites it. Tests stub
`document.startViewTransition` with a function that calls the update and returns
`{ ready: Promise.resolve() }` and then assert `document.documentElement.dataset.themeReveal`.

## Writing mode-aware styles

- Most components need nothing: both themes share keys, so `theme.colors.text` is right in
  both. Only branch when the *relationship* changes — `Button` primary text is `text` on
  `accent` in day but `bg` on `accent` in night; `Tag $tone="accent"` does the same;
  `hoverStyles` swaps a smooth glow (night) for a stepped "tracking" echo (day);
  `CRTTexture` draws scanlines stronger in night.
- Pattern inside a template: `${({ theme }) => theme.mode === 'dark' ? css`…` : css`…`}` or
  `${({ theme }) => theme.mode === 'light' && css`…`}`. Both branches still read tokens.
- Effects pick their inks from `theme.effects.*`, never from `colors`.
- In a component body, `useTheme()` from styled-components gives the current theme object
  (`PixelAccordion`, `PlaybackButton`, `SweepIcon` do this to feed canvas /
  inline-style colors).

## Testing

- `renderWithTheme(ui)` renders day; `renderWithTheme(ui, { dark: true })` renders under
  `amberTheme`. Neither mounts `ThemeModeProvider`, so `useThemeMode()` returns the inert
  default — fine for components that only *read* `theme.mode`.
- To test the provider itself (`ThemeModeProvider.test.tsx`): mock `next/navigation`'s
  `usePathname` with a hoisted mutable `{ pathname }`, set `document.cookie =
  'hs-theme=night; path=/'` before rendering, clear it with `max-age=0` in `afterEach`, use
  `renderToString(<ThemeModeProvider initialDark>…)` from `react-dom/server` to assert the
  server render is already dark, and stub `matchMedia` + `document.startViewTransition` for
  the roll.
