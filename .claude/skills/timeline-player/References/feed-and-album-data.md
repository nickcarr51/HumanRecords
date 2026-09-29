# Reference: Feed + album data layer

Files: `src/lib/supabase/feed.ts`, `src/lib/supabase/albums.ts`,
`src/lib/supabase/artist-names.ts`. Tests: `feed.data.test.ts`, `albums.data.test.ts`.

Both functions follow the project convention: they take a `SupabaseClient<Database>` as the
**first argument** (dependency injection), never calling the cookie-based `createClient()`
themselves. That makes them unit-testable against local Supabase and reusable by server
components. See [[catalog-schema]] for the underlying tables and RLS.

## `getFeed(supabase, { page?, pageSize? })` → `FeedPage`

Returns a chronological (newest-first) **merge** of two kinds of `FeedItem` (a discriminated
union on `kind`):

- `{ kind: "album", id, title, albumArtUrl, artistNames[], createdAt, tracks: FeedTrack[] }`
- `{ kind: "track", id, title, trackArtUrl, artistNames[], createdAt }`

`FeedTrack = { id, title, artistNames[] }`. `FeedPage = { items, page, pageSize, hasMore }`.

How it works:

1. Two queries in `Promise.all`: recent `albums` (embedding their tracks via `track_albums`
   and artist names via `album_artists → artists`), and recent `tracks` (embedding
   `track_albums(album_id)` and `track_artists → artists`).
2. **Standalone rule:** a track is a feed "track" item only if its embedded `track_albums`
   array is empty (i.e. it belongs to no album). Album tracks appear only nested under their
   album, never as their own feed row.
3. Merge both lists, sort by `createdAt` descending (plain ISO-string compare — the column
   is a non-null ISO-8601 UTC timestamp, so `localeCompare` is unnecessary), then slice the
   page window. `hasMore` = there was at least one item past the window.

Artist names are flattened + de-duped by `namesFrom()` from `artist-names.ts` (shared with
`getAlbum`). An uncredited track yields `artistNames: []` (never a crash); the UI shows
"Unknown Artist".

### Known limitation (deferred to the releases model)

Each source is over-fetched to `page * pageSize + 1` and standalone tracks are filtered
**after** that DB limit. At real catalog volume, if album tracks dominate the newest rows a
genuine standalone single ranked past the limit could be missed and `hasMore` could be off.
Harmless at demo scale (3 tracks). The fix is the planned **releases** model
([[humanrecords-releases-model]]): one `release = single | album` table queried in one go,
which also gives album tracks a real `position` order. Until then, album track order is
**not** consistent between the feed's expanded album row and the album page.

## `getAlbum(supabase, id)` → `AlbumDetail | null`

- Guards the id against a UUID regex and returns `null` for a non-UUID (a malformed id would
  otherwise make Postgres raise "invalid input syntax for type uuid" → a 500/leak).
- `.maybeSingle()`; returns `null` for a missing album.
- Embeds tracks (via `track_albums → tracks → track_artists → artists`) and album artists;
  currently sorts tracks by title (a placeholder order — see the releases note above).
- `AlbumDetail = { id, title, albumArtUrl, artistNames[], tracks: FeedTrack[] }`.

## `artist-names.ts`

`type ArtistNameRel = Array<{ artists: { name: string } | null }> | null` and
`namesFrom(rel): string[]` (map → filter falsy → de-dupe via `Set`). Shared by `feed.ts` and
`albums.ts` so the PostgREST-embed flattening lives in one place. The `as unknown as
ArtistNameRel` casts at the call sites bridge PostgREST's loose embed typing.
