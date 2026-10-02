# Reference: Styling conventions

## 1. `'use client'` on every styled module

Every file that calls `styled.*` / `css` / `keyframes` starts with `'use client'`:
components in `src/components/*`, and page-level `*.styles.ts` files.

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
namespace (`import * as S from './page.styles'`) — both are used.

A server-safe helper must not live in a `'use client'` module if a server component calls it
(client-module exports can't be invoked on the server). That's why `initials` lives in
`src/lib/initials.ts` and `ArtistCard` re-exports it.

## 2. Transient `$` props

Any prop that only drives styling is `$`-prefixed (`$gap`, `$tone`, `$invalid`, `$level`) so
it never reaches the DOM (no React unknown-prop warnings). Real HTML attributes stay
un-prefixed. Type them on the generic: `styled.div<{ $gap?: SpaceKey }>`.

## 3. Always read from `theme`

Colors, spacing, fonts, radii, motion, z-index, and breakpoints come from
`${({ theme }) => theme.x.y}` — never a hex or font-family literal in a component (the one
sanctioned exception is `globals.css`; see [ssr-registry.md](ssr-registry.md)).

## 4. Folder + barrel layout

```
src/components/<Name>/
  <Name>.tsx       // the component(s)
  <Name>.test.tsx  // optional, colocated
  index.ts         // export * from './<Name>'
```

Then add `export * from './<Name>'` to `src/components/index.ts`. The barrel test
(`src/components/index.test.ts`) asserts the core primitives are exported — add new
primitives to its list. Feature-specific subcomponents can live in a feature folder
(`Feed/`, `Upload/`) with a shared `*.styles.ts` there.

## 5. Accessibility + motion defaults

Match what the primitives already do:
- `&:focus-visible { outline: 2px solid accent; outline-offset: 2px }` on anything
  interactive (inputs use an accent border + 1px box-shadow instead).
- `&:disabled { opacity: 0.5; cursor: not-allowed }`.
- Wrap every `transition`/`animation` with `@media (prefers-reduced-motion: reduce)`.
- Decorative glyphs/tiles get `aria-hidden`; error text gets `role="alert"`.

## 6. Responsive

Desktop-first `max-width` queries with theme breakpoints:

```ts
@media (max-width: ${({ theme }) => theme.breakpoints.sm}) { … }
```

`sm` (480px) is the "phone" cut used by `PlayerBar`, upload form, album/admin pages.

## 7. Full-height layout inside the app

`AppShell` is `height: 100dvh; overflow: hidden` with `Main` as `flex: 1; min-height: 0`.
A page inside `(app)` should fill `Main` and scroll its own list region (see
`feed-page.styles.ts`): `flex: 1; min-height: 0; overflow-y: auto` on the scroller.
Standalone screens outside the shell (`/`, `/login`) use `Screen` from
`src/app/screen.styles.ts`.

## 8. Testing

Use `renderWithTheme(ui)` from `@/test/renderWithTheme` — it wraps in the real
`ThemeProvider`. Plain `render()` crashes on `theme.colors` being undefined. Vitest runs in
jsdom with `@testing-library/jest-dom` matchers (`vitest.setup.ts`). Test behavior
(clicks, disabled state, ARIA), not CSS values.
