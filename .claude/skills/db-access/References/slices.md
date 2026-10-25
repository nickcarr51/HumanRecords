# Reference: The rule and the slice map

## The rule (owner's)

- **One table → supabase-js.** **More than one table → Drizzle**, behind `asUser` or a service.
- It applies to reads, writes and everything else. The work moves in slices, one PR into
  `develop` each, so code that breaks the rule today is either "not moved yet" (listed below,
  with its slice) or a bug.

Design and history: `docs/superpowers/specs/2026-10-23-drizzle-services-slice1-design.md` and
the plan next to it (gitignored, local).

## Slice map (owner-decided)

| Slice | SQL functions moved into TypeScript | supabase-js code moved to Drizzle |
|---|---|---|
| **1 (done)** | `search_feed`, `admin_list_users` | `getFeed`, `getAlbum` |
| 2 | `admin_delete_artist`, `admin_set_user_role` (first writes) | `src/lib/admin/artists.ts` (`listAdminArtists`, `getAdminArtist`, `loadLinkTargets`, `getCreditCounts`); `src/lib/auth/invite.ts` (`getInviteGreeting`); the table parts of `createUser` and `updateUserProfile` (`src/lib/admin/users-actions.ts`; creating and editing the auth user stays on Supabase's Auth API); `scripts/invite-users.mts`; the unused `src/lib/supabase/artists.ts` |
| 3 | `archive_track`, `restore_track`, `replace_track_audio` (+ `release_for_track`) | `getTrackDownloadUrl` (`src/lib/storage/actions.ts`) |
| 4 | `archive_release`, `restore_release`, `move_release` | `getAdminReleases`, `getAdminRelease` (`src/lib/admin/releases.ts`) |
| 5 | `publish_release`, `update_release`, `add_album_track` (+ `resolve_artist_refs`) | — |

Stay in SQL permanently: the triggers `handle_new_user`, `sync_user_role_from_app_metadata`,
`keep_created_at`, `keep_catalog_number`, `releases_default_sort_at`, and `current_user_role`
(RLS policies call it). `increment_play_count` touches one table and nothing calls it.

## Not moved yet: many-table supabase-js code (as of 2026-10-25)

| Code | What touches more than one table | Slice |
|---|---|---|
| `src/lib/admin/artists.ts` `ROW_SELECT` (`listAdminArtists`, `getAdminArtist`) | embeds `track_artists(count), album_artists(count)`; combined with `listUsers` (Drizzle) | 2 |
| `src/lib/admin/artists.ts` `loadLinkTargets` | an `artists` query combined with `listUsers` | 2 |
| `src/lib/admin/artists.ts` `getCreditCounts` | two one-table counts (`track_artists`, `album_artists`) combined | 2 |
| `src/lib/auth/invite.ts` `getInviteGreeting` | `findUnusedInvite` (`invites`) then a `users` lookup | 2 |
| `src/lib/admin/users-actions.ts` `createUser` | Auth API `createUser` (the trigger writes `users`), then `upsertInvite` (`invites`); not atomic | 2 (table parts) |
| `src/lib/admin/users-actions.ts` `updateUserProfile` | Auth API update, then `users.update` | 2 (table parts) |
| `scripts/invite-users.mts` | Auth API list/create plus `users` select/update | 2 |
| `src/lib/supabase/artists.ts` `getArtists`, `getArtist` (retired `/artists`, not live) | `track_artists(count)`; `track:tracks(… track_albums(albums(title)))` | 2 |
| `src/lib/storage/actions.ts` `getTrackDownloadUrl` | `tracks` embedding `track_artists ( position, artists ( name ) )`, then an upsert into `downloads` (service client) | 3 |
| `src/lib/admin/releases.ts` `getAdminReleases`, `getAdminRelease` | one embedded select over `releases`, `tracks`, `track_artists`, `artists`, `albums`, `album_artists`, `track_albums` | 4 |

Not on the list because they touch one table: `getReleaseFeedPage` (`releases`; it then calls the
Drizzle `getFeed`), `getMyDownloadedTrackIds` (`downloads`), `getCurrentRole`
(`current_user_role()`), the invite store functions (`invites`), `setPinned` (`releases`), and the
artist create/update actions (`artists`). Every admin write in `release-actions.ts`,
`actions.ts`, `artists-actions.ts` and `users-actions.ts` that calls `rpc(...)` is a SQL function
in the slice map above.
