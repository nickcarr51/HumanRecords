# Reference: The releases model

Files: `supabase/migrations/20260929120000_create_releases.sql`,
`supabase/migrations/20260929120100_publish_release.sql`, `supabase/seed.sql`,
`src/lib/services/releases.ts` (`publishRelease`),
`src/lib/supabase/{feed,feed-search,albums,catalog-selects,artist-names}.ts`. Tests:
`releases-schema.data.test.ts`, `publish-release.data.test.ts`,
`releases-publish.parity.data.test.ts`, `feed.data.test.ts`,
`albums.data.test.ts`, `artist-names.test.ts`, `feed-drizzle.parity.data.test.ts`,
`albums.drizzle.data.test.ts`, `artist-names.drizzle.test.ts`.

## Schema (`…120000_create_releases.sql`)

- `release_kind` enum: `'single' | 'album'`.
- `releases (id, kind, track_id, album_id, created_at)` (later migration `20261010120000` adds `pinned`, `sort_at`, `archived_at`; see below):
  - `track_id` / `album_id` are each `unique` and `on delete cascade` — one release per
    track/album; deleting the track or album deletes its release.
  - Check `releases_kind_matches_target`: single ⇒ `track_id` set, `album_id` null; album ⇒
    the reverse.
  - `releases_created_at_idx` on `created_at desc` (the feed's sort). **Stale:** the feed now sorts by `releases_feed_order_idx` (pinned, sort_at, id).
  - RLS on; one `select` policy for `authenticated using (true)` (**stale:** it now hides archived rows from non-label-members). **No insert/update/delete
    policies** — the only way to write is a Drizzle service (`asSystem`; publishing is
    `publishRelease`, which replaced the definer function `publish_release` in slice 4) or the
    service role.
- `position integer not null` on `track_albums`, `track_artists`, `album_artists`.
  Backfilled with `row_number()` by track title / artist name (tie-break on id) before
  `set not null`.
- `artists_name_ci_key`: unique index on `lower(trim(name))`. Artist names are unique
  ignoring case + surrounding spaces. This is what lets `publishRelease` (like
  `publish_release` before it) use `on conflict` to reuse an existing artist. **Hosted pre-check** before pushing: duplicates
  would fail the migration.
- Backfill: every album → album release; every track with no `track_albums` row → single
  release; `created_at` copied from the catalog row so order is unchanged.
- `current_user_role()` — `sql`, `stable`, `security definer`, `search_path = public`,
  returns `role` for `auth.uid()` only. Executable by `authenticated` only. Needed because
  `users.role` is hidden from `authenticated` by a column grant (`20260916140001`).

**Gotcha:** the feed reads *only* `releases`. A track or album inserted by hand (SQL editor,
tests, future scripts) without a `releases` row does not appear on `/feed`.

## v1 additions (`20261010120000`, `20261010120100`)

- `pinned boolean default false`, `sort_at timestamptz not null`, `archived_at timestamptz` on
  `releases`; `archived_at` on `tracks`. Feed order is `pinned desc, sort_at desc, id desc`;
  `created_at` stays the real upload date (locked by `keep_created_at`).
- Publishing omits `sort_at` (`publishRelease`, like `publish_release` before it) and the `releases_default_sort_at` trigger
  fills it from `created_at`, so a new release lands at the top of the unpinned group. Pin to stay
  above later uploads.
- The `moveRelease` service (label members, `src/lib/services/releases.ts`; was the
  `move_release` SQL function until slice 3) swaps `sort_at` with the neighbour in the same pinned
  group. Details: [[content-lifecycle]] `References/ordering.md`.
- Archived releases are hidden from the feed and album page; label members still read the rows.
  Stream/download signing checks only `tracks.archived_at`, so archiving an album release alone
  leaves its live tracks signable by id (known gap, now closed by `archiveRelease`, which
  archives the album's live tracks too and flags them `archived_with_release`). Details: [[content-lifecycle]] `References/archive-and-restore.md`.
- `catalog_number` (`20261011170000`): new rows in `albums` and `tracks` receive it automatically
  from a `generated always as identity` column (permanent, never reused; `keep_catalog_number`
  raises on any change). `publishRelease`, `addAlbumTrack` and the upload/publish code pass
  nothing for it and must never try to. Details: [[catalog-schema]].

## `publishRelease(viewer, release: ReleasePayload)` → release id (`src/lib/services/releases.ts`)

Slice 4 replaced the SQL function `publish_release(payload jsonb)` (`…120100_publish_release.sql`,
unused by the app until the final cleanup drops it) with this Drizzle service: for every payload
the upload form can send, the same checks, the same messages and the same rows, and catalog numbers
come out the same. The database work is batched (below), so when one request breaks two rules at
once the one reported can differ from the SQL function's; nothing is saved either way. Titles and
names are trimmed with JavaScript's standard `.trim()`. The service takes the typed `ReleasePayload`; the
`publishRelease` action has already refused any other shape with "Invalid release."
(`releaseShapeValid`: `kind` is `single` or `album`; `album`, if present, passes `albumValid`;
each track is an object with a string `title` and refs passing `artistRefsValid`; plus the
audio-key checks). So the SQL function's shape-only errors ("Release kind is required.", "Tracks
must be a list.", "artists must be a list", the `22P02` for a bad kind or artist id) have no
service counterpart. Everything after step 1 runs in one `asSystem` transaction — any error rolls
back every insert.

1. `authorize(viewer, "releases.publish")`: not a label member → `FORBIDDEN`.
2. `kind` picks `publishSingle` or `publishAlbum`. Single ⇒ exactly 1 track and **no `album` key
   at all**; album ⇒ ≥ 2 tracks and a non-blank `album.title`. → `INVALID`.
3. `checkTracks`, before any write, in track order (`n` = 1-based index for messages): non-blank
   `title` ("Track n needs a title."), at least one artist ref ("Track n needs at least one
   artist.").
4. `resolveArtists` turns every track's refs, then the album's, into artist ids (below).
5. `insertTracks`: insert `tracks` one at a time, in order, so their HSS numbers follow track
   order (`title` trimmed, `audio_url = audioKey`), then every `track_artists` row in one insert
   (`position` = order within the track).
6. Album only: insert `albums(title)`, its `album_artists` (may be none), `track_albums` with
   positions = array order; then `insertRelease` inserts `releases('album')`. Single:
   `releases('single', track_ids[1])`.
7. Return the release id.

`resolveArtists` (internal; replaced `resolve_artist_refs`): every picked `{id}` is checked in one
query (any missing → `INVALID` "Unknown artist."); each distinct `{newName}` (trimmed) goes
through `artistIdByName`: `insert … on conflict do nothing` (the `artists_name_ci_key` target) +
`select` by `lower(trim(name))` — so an existing name in any case is reused and the same new name
twice yields one row. Each list's ids are de-duplicated preserving first occurrence. The lists go
in track order with the album's list last, so when the same new name is typed in two cases the
first track's spelling is saved, as `publish_release` / `update_release` did.

SQL-function-only refusals (the actions make them unreachable, so the service has none): "Track n
has no audio file." (the action accepts only verified `tracks/<uuid>.mp3` keys) and "Artist name
is empty." (the action refuses a blank new name).

## Payload (`src/lib/admin/types.ts`)

```ts
type ArtistRef = { id: string } | { newName: string };
type ReleasePayload = {
  kind: "single" | "album";
  album?: { title: string; artists: ArtistRef[] };        // album only; artists may be []
  tracks: Array<{ title: string; audioKey: string; artists: ArtistRef[] }>; // order = position
};
```

Built client-side by `buildPayload` (`upload-reducer.ts`), which omits `album` for a single.

## Error → UI message (`src/lib/admin/actions.ts` `publishRelease`)

| Error (SQLSTATE before slice 4) | Raised when | UI shows |
|---|---|---|
| `FORBIDDEN` (`42501`) | caller isn't a label member | "Only label members can do this." |
| `INVALID` (`22023`) | a rule violation (counts, blank album or track title, no artists, unknown artist) | the message verbatim (e.g. "Track 2 needs a title.") |
| anything else (`DatabaseError`, e.g. `23…`) | constraint, outage | "Couldn't publish. Nothing was saved — try again." (logged) |

A malformed shape never reaches the service: the action returns "Invalid release." first (before
slice 4 a bad kind or artist id reached the SQL function and came back as `22P02`, the generic
message).

## How the read side uses it

The feed reads through Drizzle as the signed-in user (`asUser`, [[db-access]]); the album page
is one supabase-js read. Details in
[[timeline-player]] `References/feed-and-album-data.md`.

- `getFeed` (`feed.ts`): `tx.query.releases.findMany` nesting `track` and `album` (with
  `albumArtists` and `trackAlbums` → `track`), filtered `archived_at is null` (plus `searchMatches`
  from `feed-search.ts` when `q` is set), ordered `pinned desc, sort_at desc, id desc`, with
  `limit`/`offset`, and a `count()` with the same filter in the same transaction
  (`total`/`totalPages`, `hasMore = page < totalPages`). `toFeedItem` maps single → `kind:"track"`,
  album → `kind:"album"`; a release whose target is null is skipped.
- `getAlbum` (`albums.ts`): one supabase-js read of `albums` embedding `releases`,
  `album_artists` and `track_albums` → `tracks` (back from Drizzle in slice 2), without
  `track_art_url`; tracks ordered by `track_albums.position`.
- `byPosition` (`artist-names.ts`) sorts link rows by `position` in JS (PostgREST can't order an
  embed by a column of the link table in that select shape; the Drizzle reads reuse it).
  `artistNamesOf` uses it for the Drizzle rows (and `namesFrom` for the supabase-js embeds,
  `getAlbum`'s included), so every artist list is in credit order.
- **"Various Artists"**: `albumArtistLabel(names)` returns `"Various Artists"` when an album
  has no `album_artists` rows. Display-only (used by `AlbumRow` and the album page); nothing
  is stored.

## Gotchas

- Tracks/albums inserted by hand (SQL editor) don't appear on `/feed` without a matching
  `releases` row — `getFeed` reads `releases`, not `tracks`/`albums`.
- Prod deploy order is automatic: `deploy.yml` applies migrations to prod (after the Approve
  click) and only then triggers the Vercel deploy, so the new `getFeed` always finds the
  `releases` table. Never push migrations by hand ([[release-ops]]).
