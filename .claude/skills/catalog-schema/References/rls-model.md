# Reference: RLS + privilege model

## Roles

- `anon` — signed-out requests (publishable key, no session). Sees **nothing**: no policy
  targets `anon`, so every select returns `[]` (not an error).
- `authenticated` — any signed-in member, regardless of app role. App roles
  (`listener`/`artist`/`label_member`) are **not** Postgres roles; they're checked inside
  functions via `current_user_role()`.
- `service_role` — the secret key. Bypasses RLS and column grants. Server-only.
- `postgres` — the login Drizzle uses (`DATABASE_URL`, [[db-access]]). Skips RLS (`rolbypassrls`;
  not a superuser). `asUser` switches each transaction to `authenticated` with the caller's id, so
  everything below applies as it does for supabase-js. `asSystem` stays `postgres` (RLS skipped,
  `auth.users` readable) and runs only after `authorize()` in a service has checked the caller
  (today only `listUsers`, which reads `users`, `auth.users` and `invites`).

## Read policies

| Table | Policy |
|---|---|
| `users`, `artists`, `albums`, `track_artists`, `album_artists`, `track_albums` | `authenticated … for select using (true)` |
| `releases`, `tracks` | `"signed-in users read live …; label members read all"`: `using (archived_at is null or (select current_user_role()) = 'label_member')` |
| `r2_cleanup_queue` | none — RLS on, no policies, all privileges revoked from `anon`/`authenticated`; only the service role, definer functions, or `asSystem` (no app code reads it that way yet) |
| `downloads` | `"users can read their own downloads"`: `using (user_id = (select auth.uid()))` |

Because label members can read archived rows, listener-facing code (`getFeed` and its search
filter `searchMatches`, `getAlbum`, the stream/download actions) also filters `archived_at`
explicitly (`getAlbum` treats a missing release row as not found, since RLS hides archived
releases from listeners; `getFeed` drops singles whose track is archived); RLS alone is not
enough. See [[content-lifecycle]].

**`downloads` stays owner-only.** `getMyDownloadedTrackIds` (`src/lib/supabase/downloads.ts`) reads
it with the user client and no `user_id` filter, so the feed/album ✓ state relies on this policy.
Adding a label-member select policy would make label members see everyone's downloads as their own ✓
— admin download stats (v1 pass 2) must use a service that calls `authorize()` and then `asSystem`
(pattern: `listUsers` in `src/lib/services/users.ts`, [[db-access]]), or add `.eq("user_id",
<caller>)` to that query first. Pinned by `downloads.data.test.ts`.

`(select auth.uid())` (wrapped in a subselect) lets Postgres evaluate it once per query
instead of per row — use that form in new policies.

## The hidden `role` column

RLS filters rows, not columns. To hide `users.role` from peers while keeping names public,
`20260916140001` revokes table-level select from `authenticated` and grants select on
`(id, name, created_at)` only. Consequences:

- `select('*')` or `select('role')` on `users` as `authenticated` → **permission denied error**
  (not empty). Always list columns.
- A member reads **their own** role via `rpc('current_user_role')` (definer function; see
  [functions.md](functions.md)). The app wraps that in `getCurrentRole()` ([[auth]]).
- The service role can still read/update `role` (the invite script does).
- If you add a column to `users`, it is **not** readable by `authenticated` until you add it
  to the grant.

## Writes

The only write policies are on `artists`, for label members (`/admin/artists`):

| Policy | Rule |
|---|---|
| `"label members insert artists"` | `with check (current_user_role() = 'label_member' and length(trim(name)) > 0)` |
| `"label members update artists"` | `using (current_user_role() = 'label_member')`, `with check` adds `length(trim(name)) > 0` (blank name → `42501`) — every column is writable, including `user_id` (admins link accounts to artists on purpose) |

No delete policy: deletes go through `admin_delete_artist`. No other table has an insert/update/delete
policy. Under RLS, a write that no policy allows
is **silently a no-op** (zero rows, `error: null`) — tests assert the value is unchanged, not
that the call errored (see `catalog.test.ts`).

Sanctioned write paths (reads that RLS can't allow, like the admin user list, go through
`authorize()` + `asSystem` in `listUsers`; the `search_feed` and `admin_list_users` SQL functions
still exist but the app no longer calls them, see [functions.md](functions.md)):

| Write | Path | Gate |
|---|---|---|
| New `users` row | `handle_new_user` trigger (definer) on `auth.users` insert | Supabase Auth (invite-only) |
| Increment `play_count` | `rpc('increment_play_count')` (definer) | `authenticated` only; `public`/`anon` revoked |
| Publish a release | `rpc('publish_release')` (definer) | `current_user_role() = 'label_member'`, else SQLSTATE 42501 |
| Reorder the feed | `rpc('move_release')` (definer) | `label_member`, else `42501`; bad direction `22023`; unknown id `P0002`; archived `22023` |
| Create / edit an artist | cookie client `insert`/`update` on `artists` (RLS policies above) | `label_member`; insert by others → `42501`, update by others → 0 rows (no error). Duplicate name or `user_id` → `23505` (`artists_name_ci_key` / `artists_user_id_key`) |
| Delete an artist | `rpc('admin_delete_artist')` (definer) | `label_member`, else `42501`; unknown id `P0002`; still credited → `23503` (FK restrict); queues `profile_photo_url` in `r2_cleanup_queue` |
| Change a role | `admin_set_user_role` RPC (definer) | `label_member`, else `42501`; own id → `22023` |
| Invite tokens | service-role client (`src/lib/invites/store.ts`); `invites` has no policies or grants | Server actions check role first |
| Record a download | service-role `upsert` in `getTrackDownloadUrl` | Server action checks session first |
| Test fixtures, scripts | service-role client | Never shipped to the browser |
| `catalog_number` (albums, tracks) | **none** — assigned by the identity sequence on insert | Any explicit insert/update value → `428C9`; `set … = default` → `keep_catalog_number` raises `P0001`. Applies to the service role too; the column has no write path at all. Readable wherever the row is (no new grants/policies). |

## Adding a new write path — checklist

1. Prefer a `security definer` function with `set search_path = public` and a role/ownership
   check at the top that `raise`s with an `errcode`.
2. `revoke execute … from public; revoke … from anon;` then `grant execute … to authenticated`.
   (Postgres grants `execute` to `public` by default on new functions — the revoke is required.)
3. Internal helpers callable only from other functions: also revoke from `authenticated`
   (see `resolve_artist_refs`).
4. Only use the service-role client, or `asSystem` behind `authorize()` ([[db-access]]), when
   there's no user-scoped rule to express, and only in `server-only` code after checking the
   caller.
5. Add a schema test proving both the allowed path and that the direct table write is a no-op
   or denied.
