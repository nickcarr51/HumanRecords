# Reference: Feed + album data layer

Files: `src/lib/supabase/feed.ts`, `src/lib/supabase/albums.ts`,
`src/lib/supabase/artist-names.ts`. Tests: `feed.data.test.ts`, `albums.data.test.ts`,
`artist-names.test.ts`.

Both functions follow the project convention: they take a `SupabaseClient<Database>` as the
**first argument** (dependency injection), never calling the cookie-based `createClient()`
themselves. That makes them unit-testable against local Supabase and reusable by server
components. See [[catalog-schema]] for the underlying tables and RLS, and [[admin-upload]]
for the `releases` table and `position` columns this reads.

## `getFeed(supabase, { page?, pageSize? })` → `FeedPage`

Returns the timeline newest-first as a discriminated union on `kind`:

- `{ kind: "album", id, title, albumArtUrl, artistNames[], createdAt, tracks: FeedTrack[] }`
- `{ kind: "track", id, title, trackArtUrl, artistNames[], createdAt }`

`FeedTrack = { id, title, artistNames[] }`. `FeedPage = { items, page, pageSize, hasMore }`.
`createdAt` is the **release's** `created_at` (publish time).

How it works:

1. **One query on `releases`** (`RELEASE_SELECT`), embedding the target via its foreign key:
   `track:tracks(id, title, track_art_url, track_artists(position, artists(name)))` for a
   single, and `album:albums(id, title, album_art_url, album_artists(position,
   artists(name)), track_albums(position, tracks(id, title, track_artists(position,
   artists(name)))))` for an album. Only things with a `releases` row appear — an album's
   tracks are never their own feed row because they have no release of their own.
2. Ordered `created_at desc, id desc` (id breaks ties so pages are stable).
3. **Pagination in SQL**: `.range(from, from + pageSize)` with `from = (page-1)*pageSize`.
   `range` is inclusive, so it fetches `pageSize + 1` rows; the first `pageSize` become the
   page and `hasMore = rows.length > pageSize`.
4. `toFeedItem` maps `kind:"single"` → a `"track"` item and `kind:"album"` → an `"album"`
   item. A release whose embedded target is null (hidden/removed) is skipped (so a page can
   have fewer than `pageSize` items).
5. Album tracks are sorted by `track_albums.position` with `byPosition`; every artist list
   is in credit order via `namesFrom`.

An uncredited track yields `artistNames: []` (never a crash); the UI shows
"Unknown Artist".

## `getAlbum(supabase, id)` → `AlbumDetail | null`

- Guards the id against a UUID regex and returns `null` for a non-UUID (a malformed id would
  otherwise make Postgres raise "invalid input syntax for type uuid" → a 500/leak).
- `.maybeSingle()`; returns `null` for a missing album.
- Same embeds as the feed's album branch; tracks sorted by `track_albums.position`, so the
  album page and the feed's expanded album row always agree.
- `AlbumDetail = { id, title, albumArtUrl, artistNames[], tracks: FeedTrack[] }`.

## `artist-names.ts`

- `ArtistNameRel = Array<{ position?: number | null; artists: { name: string } | null }> | null`
  — the shape of a `… ( position, artists ( name ) )` embed. The `as unknown as` casts at
  the call sites bridge PostgREST's loose embed typing.
- `byPosition(rows)` — non-mutating sort by `position`. Done in JS because the nested embeds
  can't be ordered by a link-table column in this select shape.
- `namesFrom(rel)` — `byPosition` → names → drop nulls → de-dupe.
- `albumArtistLabel(names)` — joins names, or `"Various Artists"` when an album has no album
  artists. Display-only (used by `AlbumRow` and the album page); nothing is stored.
