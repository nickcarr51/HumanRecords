# Reference: Artist pages + UI

Both pages are async Server Components inside `src/app/(app)/` (so they get the session guard,
`AppShell`, and the persistent player). All styled pieces live in sibling `'use client'`
`*.styles.ts` files ([[component-library]] `References/styling-conventions.md`).

## `/artists` — `src/app/(app)/artists/page.tsx`

URL is the state: `?q=<search>&page=<n>`.

1. `await searchParams` (a Promise in Next 15). `query = q.trim()`; `page` parsed with
   `Number`, floored, clamped ≥ 1, default 1 for junk.
2. `getArtists(supabase, { query, page })`; `totalPages = max(1, ceil(total / pageSize))`.
3. **Out-of-range page** (`total > 0 && page > totalPages`) → `redirect` to the last real page,
   preserving `q` (omits `page` when it's 1). Prevents an empty list with "page 9 of 3".
4. Renders `Header` (title + `SearchInput`), a scrolling `List` of `ArtistCard`s, and `Foot`
   with `Pagination`.
5. Empty states: `No artists match "<q>".` or `No artists yet.`

Layout (`artists.styles.ts`): fixed-height page filling `Main` — header pinned, list scrolls,
pager pinned to the bottom.

## `SearchInput` (client)

- Uncontrolled `<Input type="search">` seeded with `defaultValue={initialQuery}`.
- Each keystroke resets a 250 ms timer; on fire it rebuilds the query string from the current
  `searchParams`, sets/deletes `q`, **deletes `page`** (new search → page 1), and
  `router.replace(...)` (no history entry per keystroke). The server page re-renders with the
  new params.
- Clears the timer on unmount.

## `Pagination` (client)

- `pageHref(query, page)` — exported pure helper: `/artists`, `/artists?q=x`,
  `/artists?q=x&page=3` (never `page=1`).
- Renders `null` when `totalPages <= 1`; otherwise `‹ prev` · `page N of M` · `next ›`, using
  `next/link` styled locally. Empty `<span />`s keep the three-column layout when prev/next
  are absent.

## `ArtistCard` (`src/components/ArtistCard/ArtistCard.tsx`)

`{ id, name, photoUrl, trackCount }` → a `next/link` row to `/artists/{id}`: photo or initials
tile, name (accent on hover), "N track(s)". Re-exports `initials` from `@/lib/initials`.

## `/artists/[id]` — `src/app/(app)/artists/[id]/page.tsx`

`await params` → `getArtist` → `notFound()` if null (signed-in users then land on `/feed` via
the global not-found bounce). Renders a back link (`‹ all artists`), an identity panel (photo or
`initials` tile, name, track count, optional bio), and a track list (title, album title or
`—`, and a decorative `⌁` play slot — **not** wired to the player). Responsive two-column →
stacked at `breakpoints.md`.

`initials` is imported from `@/lib/initials`, not from `ArtistCard`, because a server component
can't call a function exported from a `'use client'` module.

## Tests

- `Pagination.test.tsx` — `pageHref` omits `page=1` and keeps `q`; renders position + links,
  no prev on page 1; null for one page.
- `SearchInput.test.tsx` — fake timers; typing pushes a debounced `q` and drops `page`.
- `ArtistCard.test.tsx` — initials; link + pluralized count; initials tile without a photo.
- `src/lib/initials.test.ts` — first two words, uppercased, whitespace-tolerant.
- No page-level render tests.
