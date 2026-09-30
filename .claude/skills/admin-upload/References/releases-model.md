# Reference: The releases model

Files: `supabase/migrations/20260929120000_create_releases.sql`,
`supabase/migrations/20260929120100_publish_release.sql`, `supabase/seed.sql`,
`src/lib/supabase/{feed,albums,artist-names}.ts`. Tests:
`releases-schema.data.test.ts`, `publish-release.data.test.ts`, `feed.data.test.ts`,
`albums.data.test.ts`, `artist-names.test.ts`.

## Schema (`…120000_create_releases.sql`)

- `release_kind` enum: `'single' | 'album'`.
- `releases (id, kind, track_id, album_id, created_at)`:
  - `track_id` / `album_id` are each `unique` and `on delete cascade` — one release per
    track/album; deleting the track or album deletes its release.
  - Check `releases_kind_matches_target`: single ⇒ `track_id` set, `album_id` null; album ⇒
    the reverse.
  - `releases_created_at_idx` on `created_at desc` (the feed's sort).
  - RLS on; one `select` policy for `authenticated using (true)`. **No insert/update/delete
    policies** — the only way to write is `publish_release` (security definer) or the
    service role.
- `position integer not null` on `track_albums`, `track_artists`, `album_artists`.
  Backfilled with `row_number()` by track title / artist name (tie-break on id) before
  `set not null`.
- `artists_name_ci_key`: unique index on `lower(trim(name))`. Artist names are unique
  ignoring case + surrounding spaces. This is what lets `publish_release` use
  `on conflict` to reuse an existing artist. **Hosted pre-check** before pushing: duplicates
  would fail the migration.
- Backfill: every album → album release; every track with no `track_albums` row → single
  release; `created_at` copied from the catalog row so order is unchanged.
- `current_user_role()` — `sql`, `stable`, `security definer`, `search_path = public`,
  returns `role` for `auth.uid()` only. Executable by `authenticated` only. Needed because
  `users.role` is hidden from `authenticated` by a column grant (`20260916140001`).

**Gotcha:** the feed reads *only* `releases`. A track or album inserted by hand (SQL editor,
tests, future scripts) without a `releases` row does not appear on `/feed`.

## `publish_release(payload jsonb) returns uuid` (`…120100_publish_release.sql`)

`plpgsql`, `security definer`, `set search_path = public`; executable by `authenticated`
(revoked from `public`/`anon`). Runs in the caller's transaction — any `raise` rolls back
every insert.

1. `current_user_role() is distinct from 'label_member'` → raise `42501`.
2. Shape: `kind` present (a bad enum value fails the cast with `22P02`); `tracks` is an
   array; single ⇒ exactly 1 track and **no `album` key at all** (`album: null` is
   rejected); album ⇒ ≥ 2 tracks and a non-blank `album.title`. → `22023`.
3. For each track, in array order (`v_n` = 1-based index for messages): non-blank `title`,
   non-blank `audioKey`, `resolve_artist_refs(artists)` yields ≥ 1 id. Insert `tracks`
   (`title` trimmed, `audio_url = audioKey`), then `track_artists` with
   `position = ordinality` via `unnest(ids) with ordinality`.
4. Album only: insert `albums(title)`, resolve album artists (may be empty), insert
   `album_artists` + `track_albums` with positions = array order; insert `releases('album')`.
   Single: insert `releases('single', track_ids[1])`.
5. Return the release id.

`resolve_artist_refs(refs jsonb) returns uuid[]` — internal helper (execute revoked from
`public`, `anon`, `authenticated`; it runs as owner because the definer function calls it).
For each ref: `{id}` must exist (`22023 'Unknown artist.'`; a non-UUID id → `22P02`);
`{newName}` is trimmed, blank → `22023`, then
`insert … on conflict ((lower(trim(name)))) do nothing` + `select` by `lower(trim(name))` —
so an existing name in any case is reused and the same new name twice yields one row.
Ids are de-duplicated preserving first occurrence.

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

## SQLSTATE → UI message (`src/lib/admin/actions.ts` `publishRelease`)

| SQLSTATE | Raised when | UI shows |
|---|---|---|
| `42501` | caller isn't a label member | "Only label members can do this." |
| `22023` | any shape/field violation | the exception text verbatim (e.g. "Track 2 needs a title.") |
| anything else (incl. `22P02`, `23…`) | bad UUID/enum cast, constraint, outage | "Couldn't publish. Nothing was saved — try again." (logged) |

## How the read side uses it

- `getFeed` (`feed.ts`): one `releases` select embedding `track:tracks(...)` and
  `album:albums(... album_artists, track_albums(position, tracks(...)))`, ordered
  `created_at desc, id desc`, `.range(from, from + pageSize)` — one extra row decides
  `hasMore`. `toFeedItem` maps single → `kind:"track"`, album → `kind:"album"`; a release
  whose embedded target is null is skipped. Public `FeedItem`/`FeedPage` shapes unchanged.
- `getAlbum` (`albums.ts`): same embeds from `albums`; tracks ordered by
  `track_albums.position`.
- `byPosition` (`artist-names.ts`) sorts link rows by `position` in JS — PostgREST can't
  order an embed by a column of the link table in this select shape. `namesFrom` uses it,
  so every artist list is in credit order.
- **"Various Artists"**: `albumArtistLabel(names)` returns `"Various Artists"` when an album
  has no `album_artists` rows. Display-only (used by `AlbumRow` and the album page); nothing
  is stored.
