# Reference: Artists data layer (`src/lib/supabase/artists.ts`)

Follows the data-function convention: `SupabaseClient<Database>` is the first argument; the
caller creates the client ([[catalog-schema]] `References/clients-and-types.md`).

## Types

```ts
ArtistListItem = { id, name, photoUrl: string | null, trackCount: number }
ArtistsPage    = { artists: ArtistListItem[], total, page, pageSize }
ArtistTrack    = { id, title, trackArtUrl: string | null, albumTitle: string | null }
ArtistDetail   = { id, name, bio: string | null, photoUrl: string | null, tracks: ArtistTrack[] }
```

## `getArtists(supabase, { query?, page?, pageSize? })` → `ArtistsPage`

- Defaults: `page = 1`, `pageSize = DEFAULT_PAGE_SIZE (12)`; both clamped to ≥ 1.
- `query` is trimmed and capped at `MAX_QUERY_LENGTH (100)` chars (bounds scan cost).
- One query:
  ```ts
  supabase.from('artists')
    .select('id, name, profile_photo_url, track_artists(count)', { count: 'exact' })
    .order('name', { ascending: true })
    .range(from, from + pageSize - 1)
  ```
  plus `.ilike('name', `%${escapeLike(query)}%`)` when a query is present.
- `count: 'exact'` gives `total` across all matches (not just the page) for the pager.
- `track_artists(count)` is an aggregate embed → `[{ count }]`; mapped to `trackCount`
  (0 if missing). Cast via `as unknown as` because the generated types don't model it.
- Throws on Supabase error (the route's `error.tsx` catches it).

## `escapeLike(value)`

Backslash-escapes `\`, `%`, `_` so user input is matched literally in `LIKE`/`ILIKE`
(backslash is Postgres' default escape). Without it, searching `%` matches every artist.
**Also imported by `src/lib/admin/actions.ts` (`searchArtists`)** — changing it affects the
admin upload combobox.

## `getArtist(supabase, id)` → `ArtistDetail | null`

1. Non-UUID `id` → `null` (would otherwise raise "invalid input syntax for type uuid" → 500).
2. `artists.select('id, name, bio, profile_photo_url').eq('id', id).maybeSingle()` → `null`
   if missing.
3. Second query: `track_artists.select('track:tracks(id, title, track_art_url,
   track_albums(albums(title)))').eq('artist_id', id)` — uses the `track_artists(artist_id)`
   index.
4. Maps each row; `albumTitle` = the **first** album the track is on, or `null`. Null embeds
   are filtered out. Sorted by `title.localeCompare`.

## Tests

- `src/lib/supabase/artists.data.test.ts` (needs local Supabase): ordering + total +
  `trackCount`; paging; LIKE wildcards matched literally; detail with tracks / null when
  missing; null for a malformed id. Uses a `ZZ-<timestamp>-` name prefix so seeded artists
  don't interfere, and deletes created artists in `afterEach`.
- `src/lib/supabase/artists.test.ts`: artist RLS read, `user_id` uniqueness, anon blocked
  (schema-level; see [[catalog-schema]]).
