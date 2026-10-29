# Reference: The rule and the slice map

## The rule (owner-confirmed 2026-10-28)

> A SQL function goes away. If the job is one simple read or write on one table, it uses
> Supabase. If it needs several changes that must all succeed or all fail (a transaction), or
> Supabase can't do it safely, it uses Drizzle. Reads that change nothing stay on Supabase, even
> when they touch several tables.

- Drizzle runs behind `asUser` or a service (`authorize` + `asSystem`).
- Reads are never moved to Drizzle just to save a round trip.
- It replaces slice 1's rule ("one table → supabase-js, more than one table → Drizzle", reads
  included). Under it the feed (`getFeed`) stays on Drizzle: its search can't be done safely
  through Supabase (a `*` in a search term is always a wildcard there, and a production artist has
  `*` in their name). The admin user list (`listUsers`) stays on Drizzle: it reads emails from
  `auth.users`, which a Supabase call made as a signed-in user can't read. The album page
  (`getAlbum`) went back to one supabase-js read in slice 2.
- The SQL functions move in slices, one PR into `develop` each.

Design and history: `docs/superpowers/specs/2026-10-23-drizzle-services-slice1-design.md`,
`docs/superpowers/specs/2026-10-28-drizzle-slice2-design.md` and the plans next to them
(gitignored, local).

## Slice map (owner-decided)

| Slice | SQL functions moved into TypeScript (Drizzle) | Other code |
|---|---|---|
| **1 (done)** | `search_feed`, `admin_list_users` | `getFeed` (Drizzle); `getAlbum` moved to Drizzle, then back to Supabase in slice 2 |
| **2 (done)** | `admin_delete_artist` → `removeArtist`, `admin_set_user_role` → `changeUserRole` (the first writes) | `getAlbum` back to Supabase; the invite script deleted |
| 3 | `archive_track`, `restore_track`, `replace_track_audio` (+ `release_for_track`) | — |
| 4 | `archive_release`, `restore_release`, `move_release` | — |
| 5 | `publish_release`, `update_release`, `add_album_track` (+ `resolve_artist_refs`) | — |

Stay in SQL permanently: the triggers `handle_new_user`, `sync_user_role_from_app_metadata`,
`keep_created_at`, `keep_catalog_number`, `releases_default_sort_at`, and `current_user_role`
(RLS policies call it). `increment_play_count` touches one table and nothing calls it.

Unused, kept in the database until a later cleanup migration drops them: `search_feed`,
`admin_list_users`, `admin_delete_artist`, `admin_set_user_role` (the app no longer calls them;
their data tests and the parity tests still call them directly). Migrations only add, and code
deployed before slice 2 still calls the last two.

## Stays on Supabase (under the rule, not "not moved yet")

| Code | Why it stays |
|---|---|
| `src/lib/admin/artists.ts` `listAdminArtists`, `getAdminArtist`, `loadLinkTargets`, `getCreditCounts` | reads; their linked-user lists come from the Drizzle `listUsers` |
| `src/lib/auth/invite.ts` `getInviteGreeting` | a read (`findUnusedInvite`, then a `users` lookup) |
| `src/lib/admin/users-actions.ts` `createUser`, `updateUserProfile` | each database step is one table (the Auth API, then `invites` or `users`) |
| `src/lib/auth/actions.ts` `redeemInvite` | each database step is one table (`invites`) or the Auth API |
| `src/lib/storage/actions.ts` `getTrackDownloadUrl` | a read, then an upsert into one table (`downloads`) |
| `src/lib/admin/releases.ts` `getAdminReleases`, `getAdminRelease` | reads |
| `src/lib/supabase/albums.ts` `getAlbum` | a read ([[timeline-player]]) |
| `src/lib/supabase/artists.ts` `getArtists`, `getArtist`, `escapeLike` (retired `/artists`, not live) | reads; the owner handles this file after all slices |

Also one table: `getReleaseFeedPage` (`releases` only; `getFeedAfterRelease` then calls the
Drizzle `getFeed`), `getMyDownloadedTrackIds` (`downloads`), `getCurrentRole`
(`current_user_role()`), the invite store functions (`invites`), `setPinned` (`releases`), and the
artist create/update actions (`artists`). Every admin write in `release-actions.ts` and
`actions.ts` that calls `rpc(...)` is a SQL function in the slice map above.
