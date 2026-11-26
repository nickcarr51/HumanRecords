# Reference: SQL functions + trigger

All are `security definer` with `set search_path = public` (pinning the search path is what
makes a definer function safe from search-path hijacking), except `resolve_artist_refs`,
which is invoker but only reachable from inside `publish_release`, and the plain trigger
functions at the end. One of those, `keep_catalog_number`, pins `search_path = ''` (the stricter
Supabase-linter form) while every older function uses `= public`. Both pin the path, so the
inconsistency is acceptable; don't churn old migrations to align them, and either form is fine
for new functions as long as `''` functions schema-qualify every reference. Slice 4's migration
`20261119120000` dropped the functions slices 1–3 replaced; see "Dropped in slice 4" at the end.

## `handle_new_user()` → trigger

- Migrations: `20260915004137_create_users.sql`, redefined in `20261002120000_…`. Trigger
  `on_auth_user_created` — `after insert on auth.users`.
- Inserts `public.users (id, name, role)`: `name` from `raw_user_meta_data ->> 'name'`, `role`
  from `raw_app_meta_data ->> 'role'` (default `'listener'`). **Never** reads role from
  `user_metadata` (landmine resolved 2026-10-02).
- Companion trigger `on_auth_user_app_metadata_role_changed` →
  `sync_user_role_from_app_metadata()`: after update of `raw_app_meta_data`, only when
  `app_metadata.role` is non-null and changed. Needed because GoTrue's admin `createUser`
  applies `app_metadata` in a later UPDATE. Changing `app_metadata.role` via the admin API
  therefore overrides `public.users.role`; `changeUserRole` (like `admin_set_user_role` before it) doesn't
  touch `app_metadata`, so it can go stale (nothing reads it after creation).
- Fed by `admin.createUser` (`app_metadata: { role }`, `user_metadata: { name }`) from the
  seed, `test-helpers` and `createUser` in `/admin/users`.

## `increment_play_count(p_track_id uuid)` → void

- Migration: `20260915005111_create_albums_and_tracks.sql`; grants hardened in
  `20260915013116_…` (revoked from `public` and `anon`).
- The only way to change `play_count` (no update policy on `tracks`).
- Call: `supabase.rpc('increment_play_count', { p_track_id })`. Never called by app code; the final
  cleanup drops it ([[db-access]] `References/slices.md`).

## `current_user_role()` → `user_role`

- Migration: `20260929120000_create_releases.sql`. `stable`.
- Returns the caller's own role (`where id = auth.uid()`), `null` if no row / signed out.
- Exists because `users.role` is hidden by column grants. Executable by `authenticated` only.
- App wrappers: `getCurrentRole()` in `src/lib/auth/role.ts` (supabase-js RPC, [[auth]]) and
  `getViewer()` in `src/lib/services/viewer.ts` (the same function, selected through Drizzle's
  `asUser`, [[db-access]]).

## `resolve_artist_refs(refs jsonb)` → `uuid[]`

- Migration: `20260929120100_publish_release.sql`. **Not callable via the API** (execute
  revoked from `public`, `anon`, `authenticated`).
- Input: JSON array of `{ "id": uuid }` or `{ "newName": text }`. Output: artist ids in input
  order, de-duplicated.
- `newName` → `insert … on conflict ((lower(trim(name)))) do nothing`, then select by
  case-insensitive name — so an existing artist is reused, never duplicated.
- Raises `22023` for unknown id / empty name / malformed ref.
- Unused by the app since slice 4 (the services' internal `resolveArtists` does the same for
  the refs the actions let through, checking picked ids in one query; a malformed ref is refused in the action, [[db-access]]);
  dropped in the final cleanup.

## `publish_release(payload jsonb)` → `uuid` (release id)

- Migration: `20260929120100_publish_release.sql`. The single catalog write path until slice 4,
  when the `publishRelease` service (`src/lib/services/releases.ts`, same checks, messages and rows
  for every payload shape the action lets through, [[db-access]]) replaced it. It never reports
  "Track n has no audio file." or "Artist name is empty.", which only this function can raise
  (the action refuses those payloads). Unused by the app; dropped in the final cleanup.
  `publish-release.data.test.ts` and the parity test `releases-publish.parity.data.test.ts` still
  call it.
- Gate: `current_user_role() is distinct from 'label_member'` → raise `42501`.
- Validates shape (single = exactly 1 track and no album; album ≥ 2 tracks + title; each
  track has title, `audioKey`, ≥1 artist) → raise `22023` with a human message.
- Inserts tracks + `track_artists` (positions), then for albums: `albums`, `album_artists`,
  `track_albums` (positions), and finally the `releases` row. One implicit transaction — any
  raise rolls back everything.
- Full contract, payload shape, and SQLSTATE → UI mapping: [[admin-upload]]
  (`References/releases-model.md`).

## Triggers `releases_default_sort_at()`, `keep_created_at()`, `keep_catalog_number()` and `track_in_one_place()`

- Migration `20261010120000`. `releases_default_sort_at` (before insert on `releases`): sets
  `sort_at := created_at` when null. `keep_created_at` (before update of `created_at` on `releases`,
  `tracks`, `albums`): **silently resets** `created_at` to the old value — the update succeeds, the
  column just doesn't move. Plain invoker triggers, not callable via the API.
- Migration `20261011170000`. `keep_catalog_number()` — `plpgsql`, `set search_path = ''`, no
  `security definer`. Triggers `albums_keep_catalog_number` / `tracks_keep_catalog_number`:
  `before update of catalog_number … for each row`. If `new.catalog_number is distinct from
  old.catalog_number` it **raises** `'Catalog numbers cannot be changed'` (no `errcode`, so
  SQLSTATE `P0001`) and the whole statement fails — the opposite choice from `keep_created_at`,
  because a renumber should be loud, not quietly ignored. Note the belt-and-braces: Postgres already
  refuses `set catalog_number = <value>` on an always-identity column (`428C9`) before any trigger
  runs; the trigger's job is `set catalog_number = default`, which would otherwise pull a fresh
  sequence value. Setting the column to its current value passes. No grants (not an RPC).
  `session_replication_role = replica` (restores) disables it, like every ordinary trigger.
  Test: `src/lib/supabase/catalog-numbers.data.test.ts`.
- Migration `20261115120000_track_one_place.sql`. `track_in_one_place()` — `plpgsql`,
  `set search_path = public`, no `security definer`; execute revoked from `public`, `anon` and
  `authenticated` (not an RPC). Triggers `track_albums_one_place` (on `track_albums`) and
  `releases_one_place` (on `releases`), both `before insert or update of track_id … for each row`.
  On `track_albums` it refuses a track that is some release's single track; on `releases` it
  refuses a `track_id` that is already on an album. Either way it raises `23505` "A track can
  belong to only one release.". Together with the unique index `track_albums_track_id_key` (a
  track on at most one album) it keeps every track on at most one release
  (`tables-and-relations.md`). An integrity trigger: it stays in SQL permanently, like
  `keep_created_at`. Test: `src/lib/supabase/track-one-place.data.test.ts`.

## Release admin functions (edit, add track)

Migrations `20261010140200` (`add_album_track`) and `20261010140300` (`update_release`). Both
are definer with `search_path = public`, revoked from `public`/`anon` and granted to
`authenticated`. Each checks `current_user_role()` first (`42501`), then locks the `releases` row
`for update` before other reads/writes. Rule violations are `22023` with the UI message; missing
rows `P0002`. Since slice 4 both are **unused by the app**: `saveRelease` and `addAlbumTrack`
call the `updateRelease` and `addAlbumTrack` services in `src/lib/services/releases.ts` (same
checks and messages for every payload shape the actions let through, except the SQL-only "Track
has no audio file." and "Artist name is empty.", which the actions make unreachable; [[db-access]]). They stay in the DB until the final cleanup. Tests:
`src/lib/supabase/{add-track-replace-audio,update-release}.data.test.ts` (fixtures in
`release-admin-fixtures.ts`) and the parity test `releases-publish.parity.data.test.ts`. The
other functions from those migrations (archive/restore, replace, `release_for_track`) were
dropped in slice 4.

| Function | Returns | Errors (besides `42501` / `P0002`) |
|---|---|---|
| `add_album_track(p_release_id uuid, payload jsonb)` | uuid (new track id) | `22023` not an album, album archived, missing title / `audioKey` / artists; from `resolve_artist_refs`: "Unknown artist.", "Artist name is empty.", "artists must be a list". A malformed artist `{id}` raises raw `22P02`, so callers must pre-validate UUIDs |
| `update_release(p_release_id uuid, payload jsonb)` | void | `22023` release archived, `tracks` not a list, single given `album`, blank album/track title, track without artist, stale draft; plus the same `resolve_artist_refs` `22023` messages as `add_album_track`. A malformed artist `{id}` or track id raises raw `22P02`, so callers must pre-validate UUIDs |

- `add_album_track` payload `{ title, audioKey, artists: [{id}|{newName}] }`; the position is
  `max(position) + 1` over every track on the album (live or removed), so it lands last. Key format
  and object existence are checked in the server action, not here. The new track's
  `catalog_number` comes from the identity sequence — neither this function nor `publish_release`
  names the column (see `tables-and-relations.md` "Catalog numbers").
- `update_release` payload `{ album?: { title, artists }, tracks: [{ id, title, artists }] }`. `tracks`
  must list exactly the release's live tracks (else `22023` "This release changed since you opened it.
  Reload the page."); array order becomes positions 1..n, removed (archived) tracks keep their
  relative order after the live ones. Artists go through `resolve_artist_refs`, so a "new" name that
  exists in another case reuses the artist.
- **Positions:** `track_albums` has no unique `(album_id, position)`. Every writer of positions
  locks the release row first (`addAlbumTrack`, `updateRelease`, like the SQL functions), so don't
  write them without it.

## Dropped in slice 4 (migration `20261119120000`)

The app stopped calling each in the slice named; the services keep the same checks, order and
messages, except that `replaceTrackAudio` has no blank-key check (the action accepts only a
verified `tracks/<uuid>.mp3` key) ([[db-access]] `References/running-queries.md`).

| Function | Created in | Replaced by |
|---|---|---|
| `search_feed(q)` | `20261010120200` | `searchMatches` in `src/lib/supabase/feed-search.ts` (slice 1) |
| `admin_list_users()` | `20261002120100`, `banned_until` added in `20261010120500` | `listUsers` (slice 1) |
| `admin_set_user_role(target, new_role)` | `20261002120100` | `changeUserRole` (slice 2) |
| `admin_delete_artist(target)` | `20261010130000` | `removeArtist` (slice 2) |
| `move_release(target, direction)` | `20261010120100` | `moveRelease` (slice 3; the algorithm: [[content-lifecycle]] `References/ordering.md`) |
| `archive_release`, `restore_release`, `release_for_track` (internal) | `20261010140000` | `archiveRelease`, `restoreRelease`, the internal `lockReleaseForTrack` (slice 3) |
| `archive_track`, `restore_track` | `20261010140100` | `archiveTrack`, `restoreTrack` (slice 3) |
| `replace_track_audio` | `20261010140200` | `replaceTrackAudio` (slice 3) |

## Writing a new function

New SQL functions are limited to the kinds in [[db-access]] `References/data-access-rule.md`.
Follow the template in [rls-model.md](rls-model.md) ("Adding a new write path"). Use
`errcode = '22023'` (invalid parameter) for validation and `'42501'` (insufficient
privilege) for authorization so the app can map them. Regenerate types afterwards — new
functions appear under `Database['public']['Functions']` and type `supabase.rpc(...)`.
