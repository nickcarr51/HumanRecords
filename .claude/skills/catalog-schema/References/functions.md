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
- Returns `id, email, name, role, created_at, invite_token, invite_used_at`, newest first.
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

## Writing a new function

Follow the template in [rls-model.md](rls-model.md) ("Adding a new write path"). Use
`errcode = '22023'` (invalid parameter) for validation and `'42501'` (insufficient
privilege) for authorization so the app can map them. Regenerate types afterwards — new
functions appear under `Database['public']['Functions']` and type `supabase.rpc(...)`.
