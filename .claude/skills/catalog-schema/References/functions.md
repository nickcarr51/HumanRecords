# Reference: SQL functions + trigger

All are `security definer` with `set search_path = public` (pinning the search path is what
makes a definer function safe from search-path hijacking), except `resolve_artist_refs`,
which is invoker but only reachable from inside `publish_release`.

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
  therefore overrides `public.users.role`; `admin_set_user_role` doesn't touch `app_metadata`,
  so it can go stale (nothing reads it after creation).
- Fed by `admin.createUser` (`app_metadata: { role }`, `user_metadata: { name }`) from the
  seed, `test-helpers`, `createUser` in `/admin/users`, and `scripts/invite-users.mts`.

## `admin_list_users()` → table

- Migration `20261002120100_create_invites.sql`. Definer, `stable`. Raises `42501` unless
  `current_user_role() = 'label_member'`.
- Returns `id, email, name, role, created_at, invite_token, invite_used_at, banned_until`, newest first.
  `banned_until` (from `auth.users`) was added in `20261010120500` (drop + recreate, since the return type changed; the deployed code ignores the extra column). Nothing renders it yet; the user-admin branch will.
  Generated types mark `name`/`invite_token`/`invite_used_at` non-null though they can be null.
- Grants: revoked from `public`/`anon`, granted to `authenticated`. Caller: [[invites]].

## `admin_set_user_role(target uuid, new_role user_role)` → void

- Same migration and grants. Errors: `42501` not a label member; `22023` target is the caller;
  `P0002` no such user. Updates `public.users.role` only.

## `increment_play_count(p_track_id uuid)` → void

- Migration: `20260915005111_create_albums_and_tracks.sql`; grants hardened in
  `20260915013116_…` (revoked from `public` and `anon`).
- The only way to change `play_count` (no update policy on `tracks`).
- Call: `supabase.rpc('increment_play_count', { p_track_id })`. Not yet called by app code.

## `current_user_role()` → `user_role`

- Migration: `20260929120000_create_releases.sql`. `stable`.
- Returns the caller's own role (`where id = auth.uid()`), `null` if no row / signed out.
- Exists because `users.role` is hidden by column grants. Executable by `authenticated` only.
- App wrapper: `getCurrentRole()` in `src/lib/auth/role.ts` ([[auth]]).

## `resolve_artist_refs(refs jsonb)` → `uuid[]`

- Migration: `20260929120100_publish_release.sql`. **Not callable via the API** (execute
  revoked from `public`, `anon`, `authenticated`).
- Input: JSON array of `{ "id": uuid }` or `{ "newName": text }`. Output: artist ids in input
  order, de-duplicated.
- `newName` → `insert … on conflict ((lower(trim(name)))) do nothing`, then select by
  case-insensitive name — so an existing artist is reused, never duplicated.
- Raises `22023` for unknown id / empty name / malformed ref.

## `publish_release(payload jsonb)` → `uuid` (release id)

- Migration: `20260929120100_publish_release.sql`. The single catalog write path.
- Gate: `current_user_role() is distinct from 'label_member'` → raise `42501`.
- Validates shape (single = exactly 1 track and no album; album ≥ 2 tracks + title; each
  track has title, `audioKey`, ≥1 artist) → raise `22023` with a human message.
- Inserts tracks + `track_artists` (positions), then for albums: `albums`, `album_artists`,
  `track_albums` (positions), and finally the `releases` row. One implicit transaction — any
  raise rolls back everything.
- Full contract, payload shape, and SQLSTATE → UI mapping: [[admin-upload]]
  (`References/releases-model.md`).

## `move_release(target uuid, direction text)` → void

- Migration `20261010120100_move_release.sql`. Definer, `search_path = public`; revoked from
  `public`/`anon`, granted to `authenticated`.
- Errors: `42501` not a label member; `22023` direction not `up`/`down`, or the release is archived;
  `P0002` no such release. Already at the edge of its pinned group: silent no-op.
- Locks the target and its neighbour (`for update`), finds the neighbour in the **same pinned group**
  (live only) by `(sort_at, id)`, then swaps their `sort_at`.
  Fast path: one indexed EXISTS looks for any other live row in the group sharing the target's or
  neighbour's `sort_at` (or the two tie with each other); if none, it is a plain swap writing only
  those 2 rows. Otherwise it first normalizes the whole pinned group (live rows): with rows
  numbered `i` in feed order, `v_i = min over j<=i of (s_j + j*1ms) - i*1ms`, writing only rows
  where `v_i <> s_i`. Values only move down, are strictly 1 ms+ apart, and keep feed order, so
  nothing collides and the neighbour stays adjacent; then it swaps. 1 ms because JS `Date` keeps
  only milliseconds. One click always moves exactly one spot.
- Two concurrent opposite moves can deadlock (`40P01`): callers should show a "try again" message.
- Caller: the future release-admin UI ([[content-lifecycle]], `References/ordering.md`).

## `admin_delete_artist(target uuid)` → void

- Migration `20261010130000_artists_admin_writes.sql`. Definer, `search_path = public`; revoked from
  `public`/`anon`, granted to `authenticated`.
- Errors: `42501` not a label member; `P0002` no such artist; `23503` the artist is still credited
  on a track or album (the `restrict` FKs from `20261010120400` — propagated unchanged, nothing deleted).
- Deletes the row and, if it had a `profile_photo_url`, inserts that key into `r2_cleanup_queue`
  (`reason='archived'`, `source_table='artists'`, `source_id=target`) in the same transaction.
- Caller: `/admin/artists` delete action ([[admin-upload]]). Create/edit use the `artists` RLS write
  policies instead (see `rls-model.md`).
- Tests: `src/lib/supabase/artists-admin-writes.data.test.ts`.

## `search_feed(q text)` → `setof releases`

- Migration `20261010120200_search_feed.sql`. `sql`, `stable`, **security invoker**; `authenticated` only.
- Case-insensitive substring match on track titles, album titles and credited artist names (an album
  also matches through its live tracks); `%`, `_` and `\` in `q` are escaped, so `100%` is literal.
  Excludes archived releases and archived tracks.
- **An empty `q` matches everything**, so callers skip the RPC for an empty query.
- Returns plain `releases` rows so the caller chains the same embedded select, order and `range` as
  `getFeed`. PostgREST orders an RPC result only by columns in the select projection, so the select
  must include `pinned, sort_at` (as `RELEASE_SELECT` does).
- Not wired to UI yet.

## Triggers `releases_default_sort_at()` and `keep_created_at()`

- Migration `20261010120000`. `releases_default_sort_at` (before insert on `releases`): sets
  `sort_at := created_at` when null. `keep_created_at` (before update of `created_at` on `releases`,
  `tracks`, `albums`): resets `created_at` to the old value. Plain invoker triggers, not callable via the API.

## Release admin functions (archive, restore, edit, add/replace track)

Migrations `20261010140000`..`20261010140300`. All are definer with `search_path = public`; the
seven public ones are revoked from `public`/`anon` and granted to `authenticated`. Each checks
`current_user_role()` first (`42501`), then locks the owning `releases` row `for update` before
other reads/writes. Rule violations are `22023` with the UI message; missing rows `P0002`.
Callers: the release-admin server actions ([[content-lifecycle]]). Tests:
`src/lib/supabase/{archive-release,archive-track,add-track-replace-audio,update-release}.data.test.ts`
(fixtures in `release-admin-fixtures.ts`).

| Function | Returns | Errors (besides `42501` / `P0002`) |
|---|---|---|
| `archive_release(p_release_id uuid)` | void | none; already archived is a silent no-op |
| `restore_release(p_release_id uuid)` | void | `22023` a same-timestamp track/album key was already `cleaned_at`; not archived is a no-op |
| `archive_track(p_track_id uuid)` | void | `22023` track is on a single ("Archive the single instead.") or the album is archived (checked after the track's own state); already archived is a no-op, even if the album was archived with it |
| `restore_track(p_track_id uuid)` | void | `22023` single, album archived ("Restore the album first."), or its key was already `cleaned_at`; not archived is a no-op |
| `add_album_track(p_release_id uuid, payload jsonb)` | uuid (new track id) | `22023` not an album, album archived, missing title / `audioKey` / artists; from `resolve_artist_refs`: "Unknown artist.", "Artist name is empty.", "artists must be a list". A malformed artist `{id}` raises raw `22P02`, so callers must pre-validate UUIDs |
| `replace_track_audio(p_track_id uuid, p_audio_key text)` | void | `22023` track archived, empty key, or same key as current |
| `update_release(p_release_id uuid, payload jsonb)` | void | `22023` release archived, `tracks` not a list, single given `album`, blank album/track title, track without artist, stale draft; plus the same `resolve_artist_refs` `22023` messages as `add_album_track`. A malformed artist `{id}` or track id raises raw `22P02`, so callers must pre-validate UUIDs |

- `archive_release` sets `releases.archived_at` and archives the release's live tracks with the
  **same timestamp**, queuing track audio/art keys and the album art key (`archived`).
  `restore_release` restores only tracks carrying that same timestamp and deletes their uncleaned
  `archived` queue rows.
- `archive_track` queues that track's keys; if it was the album's last live track it archives the
  release too (same timestamp, queues album art). `restore_track` clears one track and its uncleaned rows.
- `add_album_track` payload `{ title, audioKey, artists: [{id}|{newName}] }`; the position is
  `max(position) + 1` over every track on the album (live or removed), so it lands last. Key format
  and object existence are checked in the server action, not here.
- `replace_track_audio` queues the old key (`replaced`) and swaps `audio_url`.
- `update_release` payload `{ album?: { title, artists }, tracks: [{ id, title, artists }] }`. `tracks`
  must list exactly the release's live tracks (else `22023` "This release changed since you opened it.
  Reload the page."); array order becomes positions 1..n, removed (archived) tracks keep their
  relative order after the live ones. Artists go through `resolve_artist_refs`, so a "new" name that
  exists in another case reuses the artist.
- **`release_for_track(p_track_id uuid)` is internal** (`sql`, `stable`; execute revoked from
  `public`, `anon` and `authenticated`, so it is not an RPC). It returns the release that owns a
  track and assumes **one owning release per track**: true for everything `publish_release` and
  `add_album_track` create. The schema would allow a track on several albums; nothing creates that.
- **Positions:** `track_albums` has no unique `(album_id, position)`. Every writer of positions
  locks the release row first (`add_album_track`, `update_release`), so don't write them without it.

## Writing a new function

Follow the template in [rls-model.md](rls-model.md) ("Adding a new write path"). Use
`errcode = '22023'` (invalid parameter) for validation and `'42501'` (insufficient
privilege) for authorization so the app can map them. Regenerate types afterwards — new
functions appear under `Database['public']['Functions']` and type `supabase.rpc(...)`.
