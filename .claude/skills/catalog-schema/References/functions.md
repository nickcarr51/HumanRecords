# Reference: SQL functions + trigger

All are `security definer` with `set search_path = public` (pinning the search path is what
makes a definer function safe from search-path hijacking), except `resolve_artist_refs`,
which is invoker but only reachable from inside `publish_release`.

## `handle_new_user()` → trigger

- Migration: `20260915004137_create_users.sql`. Trigger `on_auth_user_created` — `after insert
  on auth.users for each row`.
- Inserts `public.users (id, first_name, last_name, role)` from `new.raw_user_meta_data`;
  `role` falls back to `'listener'`.
- Fed by `admin.createUser` / `inviteUserByEmail` `user_metadata` (seed, `test-helpers`,
  `scripts/invite-users.mts`).
- **Landmine:** `raw_user_meta_data` is user-writable. Safe only while sign-up is disabled.
  Enabling self-signup without moving role to `app_metadata` = privilege escalation.

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
