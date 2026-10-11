# Reference: Feed + album data layer

Files: `src/lib/supabase/feed.ts`, `src/lib/supabase/albums.ts`,
`src/lib/supabase/artist-names.ts`. Tests: `feed.data.test.ts`, `albums.data.test.ts`,
`artist-names.test.ts`.

Both functions follow the project convention: they take a `SupabaseClient<Database>` as the
**first argument** (dependency injection), never calling the cookie-based `createClient()`
themselves. That makes them unit-testable against local Supabase and reusable by server
components. See [[catalog-schema]] for the underlying tables and RLS, and [[admin-upload]]
for the `releases` table and `position` columns this reads.

## `getFeed(supabase, { page?, pageSize?, q? })` → `FeedPage`

Returns the timeline (pinned first, then newest `sort_at`; archived hidden) as a discriminated union on `kind`:

- `{ kind: "album", id, title, albumArtUrl, artistNames[], createdAt, tracks: FeedTrack[] }`
- `{ kind: "track", id, title, trackArtUrl, artistNames[], createdAt }`

`FeedTrack = { id, title, artistNames[] }`. `FeedPage = { items, page, pageSize, hasMore, total, totalPages }`.
`createdAt` is the **release's** `created_at` (the real upload date, which never changes; position in the feed comes from `sort_at`).

How it works:

1. **One query on `releases`** (`RELEASE_SELECT`), embedding the target via its foreign key:
   `track:tracks(id, title, track_art_url, archived_at, track_artists(position, artists(name)))` for a
   single, and `album:albums(id, title, album_art_url, album_artists(position,
   artists(name)), track_albums(position, tracks(id, title, archived_at, track_artists(position,
   artists(name)))))` for an album. Only things with a `releases` row appear — an album's
   tracks are never their own feed row because they have no release of their own. A single whose track is archived is dropped in `toFeedItem`, and so is an album with zero live tracks (all archived, or none); the feed never returns an empty album.
2. `.is("archived_at", null)` (label members can read archived rows via RLS, so the filter is
   explicit), then ordered `pinned desc, sort_at desc, id desc` (id breaks ties so pages are
   stable). `RELEASE_SELECT` includes `pinned, sort_at` because PostgREST orders an RPC result
   (`search_feed`, chained later) only by projected columns.
3. **Pagination in SQL**: `.range(from, from + pageSize - 1)` with `from = (page-1)*pageSize`, and
   `count: 'exact'` → `total`/`totalPages`; `hasMore = page < totalPages`. A page past the end makes
   PostgREST fail with `PGRST103`; `getFeed` then runs a count-only query on the same source and
   returns `items: []` with the real `total`/`totalPages` so the page can redirect to the last page.
4. `toFeedItem` maps `kind:"single"` → a `"track"` item and `kind:"album"` → an `"album"`
   item. A release whose embedded target is null (hidden/removed) is skipped (so a page can
   have fewer than `pageSize` items). Archived album tracks (`archived_at` set) are dropped. Dropping an item (empty album, archived single) makes that page come back short, so admin actions must keep data consistent: archiving an album's last live track must archive the release too.
5. Album tracks are sorted by `track_albums.position` with `byPosition`; every artist list
   is in credit order via `namesFrom`.

An uncredited track yields `artistNames: []` (never a crash); the UI shows
"Unknown Artist".

**Search (`q`)**: `q` is trimmed; blank = the plain feed. Otherwise the source is the `search_feed`
RPC (see [[catalog-schema]]) instead of the `releases` table, with the same select, archived filter,
order and range applied by one shared function (`releaseQuery` + the chain in `getFeed`), so search
and the plain feed can never disagree on order.

`pageSize` defaults to `feedPageSize()`: the optional `FEED_PAGE_SIZE` env var if it is a positive
integer, else `DEFAULT_PAGE_SIZE` (20). Unset in develop/prod; set small locally to test paging
(`src/lib/supabase/feed-page-size.test.ts`).

## `getReleaseFeedPage` / `getFeedAfterRelease`

- `ReleaseRef` = `{ kind: "album", albumId } | { kind: "single", trackId }` (the same ids a
  `FeedItem` carries: an album item's `id` is the album id, a single's is its track id).
- `getReleaseFeedPage(supabase, ref, pageSize?)` → the main-feed page (1-based) a release is
  on (looked up by `album_id` or `track_id`), or `null` if archived/missing. Counts live releases ordered ahead of it with `or()`:
  pinned ones first, then `sort_at.gt`, then the `id.gt` tie-break; `sort_at` is wrapped in double
  quotes because its `:` and `+` are reserved in PostgREST `or()` syntax. Page =
  `floor(ahead / pageSize) + 1`.
- `getFeedAfterRelease(supabase, ref, pageSize?)` → `FeedAfterRelease` (`{ items, page, hasMore }`)
  `| null`: the items after the release on its main-feed page (never the search), or the whole next
  page when it was the last item. Used by `continueAfterRelease` for the album-page queue and for a
  search queue that ran out (a search queue continues into the main feed after its last release;
  the view stays on the search).
- Tests: `feed-query.data.test.ts` (search through `getFeed`), `feed-after-release.data.test.ts`
  (album and single position and continuation, archived → null). For local paging, set `FEED_PAGE_SIZE=2`.

## `getAlbum(supabase, id)` → `AlbumDetail | null`

- Guards the id against a UUID regex and returns `null` for a non-UUID (a malformed id would
  otherwise make Postgres raise "invalid input syntax for type uuid" → a 500/leak).
- `.maybeSingle()`; returns `null` for a missing album **and for an archived one** (it embeds
  `releases(archived_at)`), even for label members. A missing release is also `null` (RLS hides an archived release from listeners, so the embed comes back empty; every album has a release). Archived tracks are skipped from `tracks`.
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
