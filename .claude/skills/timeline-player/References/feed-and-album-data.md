# Reference: Feed + album data layer

Files: `src/lib/supabase/feed.ts`, `src/lib/supabase/feed-search.ts`, `src/lib/supabase/albums.ts`,
`src/lib/supabase/catalog-selects.ts`, `src/lib/supabase/artist-names.ts`. Tests:
`feed.data.test.ts`, `feed-query.data.test.ts`, `feed-after-release.data.test.ts`,
`albums.data.test.ts`, `artist-names.test.ts`, `catalog-numbers.data.test.ts`, and from the Drizzle
move `feed-drizzle.parity.data.test.ts`, `feed-row-cap.data.test.ts`,
`albums.drizzle.data.test.ts`, `artist-names.drizzle.test.ts`, and
`album-request.test.ts` (the album request doesn't ask for `track_art_url`).

Both functions follow the project convention: they take a `SupabaseClient<Database>` as the
**first argument** (dependency injection), never calling the cookie-based `createClient()`
themselves. That makes them testable against local Supabase and reusable by server components.
Since Drizzle slice 1 (2026-10) `getFeed` uses that client only to verify the session
(`getClaims(supabase)`); its queries run through Drizzle with `asUser`, as the signed-in user, so
the same RLS policies apply ([[db-access]]). Since slice 2 (2026-10-28) `getAlbum` verifies the
session the same way and then reads with that supabase-js client. A signed-out client gets
`DomainError("UNAUTHENTICATED")` instead of empty results (the middleware and the `(app)` layout
normally redirect first). Any database error comes back as a safe `DomainError` or
`DatabaseError`, never with the SQL text. See [[catalog-schema]] for the underlying tables and RLS
(including `catalog_number` and its `keep_catalog_number` trigger), and [[admin-upload]] for the
`releases` table and `position` columns this reads.

## Shapes (all carry a required `catalogNumber`)

```ts
FeedTrack  = { id; catalogNumber: number; title; artistNames: string[] }
FeedItem   = { kind: "album"; catalogNumber: number; id; title; albumArtUrl; artistNames; createdAt; tracks: FeedTrack[] }
           | { kind: "track"; catalogNumber: number; id; title; trackArtUrl; artistNames; createdAt }
FeedPage   = { items; page; pageSize; hasMore; total; totalPages }
AlbumDetail = { id; catalogNumber: number; title; albumArtUrl; artistNames; tracks: FeedTrack[] }
```

`catalogNumber` is **required** (not optional) on `FeedTrack`, both `FeedItem` branches and
`AlbumDetail`: `tracks.catalog_number` / `albums.catalog_number` are assigned by the database
on insert and never null, so there is nothing to default. The UI renders it as `HS###`
(album) / `HSS###` (track) through `CatalogId` (`src/components/CatalogId/CatalogId.tsx`,
which renders nothing for a missing/invalid number) and `CatalogLine` (the row line: id,
`ISSUED yyyy.mm.dd` from `createdAt` in **UTC**, `TRACK nn / NN` or `TRACKS NN`; everything
after the id is hidden at `<= theme.breakpoints.sm`). Any test fixture building a `FeedItem`
or `FeedTrack` must include `catalogNumber` or TypeScript rejects it. `toPlayerTrack` copies
it onto `PlayerTrack.catalogNumber?` for the player bar.

`createdAt` is the **release's** `created_at` (the real upload date, which never changes; position in the feed comes from `sort_at`).

## `getFeed(supabase, { page?, pageSize?, q? })` → `FeedPage`

Returns the timeline (pinned first, then newest `sort_at`; archived hidden) as the `FeedItem`
discriminated union above.

How it works (one transaction through `asUser`):

1. **The filter**: `archived_at is null` (`isNull(releases.archivedAt)`; label members can read
   archived rows through RLS, so the filter is explicit), plus `searchMatches(tx, q)` when `q` is
   not blank (below).
2. **The rows query**: `tx.query.releases.findMany` with that filter, ordered
   `pinned desc, sort_at desc, id desc` (id breaks ties so pages are stable),
   `limit: Math.min(pageSize, MAX_ROWS)` and `offset: (page-1)*pageSize`, and the nested rows in
   `RELEASE_WITH`: `track` (`TRACK_WITH`: id, `catalogNumber`, title, `trackArtUrl`, `archivedAt`,
   `trackArtists` → `artist.name` with `position`) for a single, and `album` (id,
   `catalogNumber`, title, `albumArtUrl`, `albumArtists`, `trackAlbums` with `position` → `track`
   as `TRACK_WITH`) for an album. `createdAt` is selected with `pgrstTs`, so it is exactly the
   string supabase-js returned before. Only things with a `releases` row appear — an album's
   tracks are never their own feed row because they have no release of their own.
3. **The count query**: `select count(*)` from `releases` with the same filter → `total`,
   `totalPages = max(1, ceil(total / pageSize))`, `hasMore = page < totalPages`. Both queries are
   sent at once in the same transaction. A page past the end simply comes back with `items: []`
   and the real totals, so the page can redirect to the last page. `MAX_ROWS` (1000, the cap
   PostgREST put on every supabase-js read) only matters for an unusual `FEED_PAGE_SIZE`; the
   count stays exact.
4. `toFeedItem` maps `kind:"single"` → a `"track"` item and `kind:"album"` → an `"album"` item
   (the Drizzle rows are already camelCase). A single whose track is archived is dropped, and so
   is an album with zero live tracks (all archived, or none); the feed never returns an empty
   album. A release whose target is null (hidden/removed) is skipped. So a page can have fewer
   than `pageSize` items, and admin actions must keep data consistent: archiving an album's last
   live track must archive the release too.
5. Album tracks are sorted by `track_albums.position` with `byPosition`; every artist list is in
   credit order via `artistNamesOf`.

An uncredited track yields `artistNames: []` (never a crash); the UI shows
"Unknown Artist".

**Search (`q`)**: `q` is trimmed; blank = the plain feed. Otherwise `searchMatches(tx, q)`
(`feed-search.ts`) is added to the same filter, so search and the plain feed share one filter
(for the rows and the count) and one order, so they can never disagree. It matches,
case-insensitively, track titles, album titles and credited artist names: a single through its
live track (title or track artist); an album through its title, an album artist, or any live
track. Archived tracks never match.
`%`, `_` and `\` in `q` are literal (`escapeLike`). It is a translation of the `search_feed` SQL
function, which still exists but has no app callers ([[catalog-schema]] `References/functions.md`);
`feed-drizzle.parity.data.test.ts` proves both match the same releases in the same order.

`pageSize` defaults to `feedPageSize()`: the optional `FEED_PAGE_SIZE` env var if it is a positive
integer, else `DEFAULT_PAGE_SIZE` (20). Unset in develop/prod; set small locally to test paging
(`src/lib/supabase/feed-page-size.test.ts`).

Input hardening in `getFeed` (the server action calls it with user input): `page` is floored and
falls back to 1 unless it is finite and within `MAX_PAGE` (100 000; Postgres rejects an
exponent-notation offset: page `1e22` would send `2e+23`, not a valid integer); `q` is trimmed
then capped at `MAX_QUERY_LENGTH` (200); a non-string `q` is treated as blank.

## `getReleaseFeedPage` / `getFeedAfterRelease`

- `ReleaseRef` = `{ kind: "album", albumId } | { kind: "single", trackId }` (the same ids a
  `FeedItem` carries: an album item's `id` is the album id, a single's is its track id).
- `getReleaseFeedPage(supabase, ref, pageSize?)` → the main-feed page (1-based) a release is
  on (looked up by `album_id` or `track_id`), or `null` if archived/missing. It reads one table
  (`releases`), so under the rule it stays on supabase-js. Counts live releases ordered ahead of
  it with `or()`: pinned ones first, then `sort_at.gt`, then the `id.gt` tie-break; `sort_at` is
  wrapped in double quotes because its `:` and `+` are reserved in PostgREST `or()` syntax. Page =
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
- Then `await getClaims(supabase)`: signed out → `DomainError("UNAUTHENTICATED")`, as `getFeed`
  does (without it RLS would return no rows and the page would say "not found").
- Then one supabase-js read (slice 2 put it back as it was before slice 1): `albums` by id with
  `id, catalog_number, title, album_art_url`, `releases ( archived_at )`,
  `album_artists ( position, artists ( name ) )` and `track_albums ( position, tracks ( id,
  catalog_number, title, archived_at, track_artists ( position, artists ( name ) ) ) )`, then
  `.maybeSingle()`. It doesn't ask for `track_art_url` (`album-request.test.ts` checks this). A
  query error is thrown as supabase-js returns it.
  Returns `null` for a missing album **and for an archived one**, even for label members. No
  visible release is also `null` (RLS hides an archived release from listeners, so `releases`
  comes back empty; every album has a release). Archived tracks are skipped from `tracks`.
- Artist names go through `namesFrom` (`artist-names.ts`), the same rules as the feed's
  `artistNamesOf`; tracks sorted by `track_albums.position` (`byPosition`), so the album page and
  the feed's expanded album row always agree.
- `albumArtUrl` is returned but **not rendered** by the album page yet (it is an unsigned R2
  key; see routing-and-auth.md).

## Downloaded state (`src/lib/supabase/downloads.ts`)

Both pages show which tracks the user already downloaded:

- Feed: `getMyDownloadedTrackIds(supabase, feedTrackIds(items))`; album page: the album's track ids.
  `feedTrackIds` flattens singles and album tracks in feed order.
- Uses the **user (cookie) client**: `downloads` RLS is owner-only, so no `user_id` filter. Queries in
  chunks of 100 ids (PostgREST URL length) and **fails soft** to `[]` (logs; buttons just show the plain download glyph).
- The page wraps its list in `<DownloadsProvider initialIds={...}>`; rows render `DownloadButton`. The provider
  unions the server ids with local marks, so new `initialIds` (e.g. `?page=2`, which doesn't remount) apply without losing clicks.
- Album page also exports `generateMetadata` and uses `cache(loadAlbum)`, so the title and the page share one
  `getAlbum` query per request. Feed title is `Feed`.

## `catalog-selects.ts` and `artist-names.ts`

- `ARTIST_NAMES` (`position` → `artist.name`), `TRACK_WITH` (the track columns plus
  `trackArtists`), `DbTrack` (what a `TRACK_WITH` read returns) and `toFeedTrack(t)` (takes a
  `DbTrack`) — the Drizzle `columns`/`with` shapes `getFeed` uses.
  The feed's album tracks use `TRACK_WITH`, so they also fetch `trackArtUrl`, which the feed
  doesn't show for them.
- `ArtistLink = { position?: number | null; artist: { name: string } | null }` — a Drizzle link
  row (singular `artist`). `artistNamesOf(links)` — `byPosition` → names → drop nulls →
  de-dupe.
- `byPosition(rows)` — non-mutating sort by `position`. Done in JS because PostgREST embeds can't
  be ordered by a link-table column in that select shape; the Drizzle reads reuse it for the same
  rule.
- `ArtistNameRel` and `namesFrom(rel)` — the same rules for a supabase-js
  `… ( position, artists ( name ) )` embed. `getAlbum` and `getTrackDownloadUrl`
  (`src/lib/storage/actions.ts`), both supabase-js, use them, bridged with `as unknown`.
- `albumArtistLabel(names)` — joins names, or `"Various Artists"` when an album has no album
  artists. Display-only (used by `AlbumRow` and the album page); nothing is stored.
