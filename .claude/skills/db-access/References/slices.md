# Reference: The slice map

How the app moved off SQL functions, slice by slice. The rule that drove it is now the permanent
rule for all code: [data-access-rule.md](data-access-rule.md).

Design and history: `docs/superpowers/specs/2026-10-23-drizzle-services-slice1-design.md`,
`docs/superpowers/specs/2026-10-28-drizzle-slice2-design.md`,
`docs/superpowers/specs/2026-11-15-drizzle-slice3-design.md`,
`docs/superpowers/specs/2026-11-19-drizzle-slice4-design.md` and the plans next to them
(gitignored, local).

## Slice map (owner-decided; 2026-11-15 the last three slices became two)

| Slice | SQL functions moved into TypeScript (Drizzle) | Other code |
|---|---|---|
| **1 (done, #38)** | `search_feed`, `admin_list_users` | `getFeed` (Drizzle); `getAlbum` moved to Drizzle, then back to Supabase in slice 2 |
| **2 (done, #39)** | `admin_delete_artist` → `removeArtist`, `admin_set_user_role` → `changeUserRole` (the first writes) | `getAlbum` back to Supabase; the invite script deleted |
| **3 (done, #40)** | `archive_release`, `restore_release`, `archive_track`, `restore_track`, `replace_track_audio`, `move_release` (+ `release_for_track`) → `src/lib/services/releases.ts` | migration `20261115120000_track_one_place.sql`: `tracks.archived_with_release` and the one-track-one-place rule ([[catalog-schema]]) |
| **4 (`feature/ORM-phase-4`)** | `publish_release` → `publishRelease`, `update_release` → `updateRelease`, `add_album_track` → `addAlbumTrack` (+ `resolve_artist_refs`) → `src/lib/services/releases.ts` | migration `20261119120000_drop_replaced_functions.sql` (below); the rule written down ([data-access-rule.md](data-access-rule.md)) |

Slice 3 keeps two deliberate differences from the SQL functions: restore finds the tracks to bring
back by `tracks.archived_with_release` instead of matching `archived_at`, and the shared-track
checks ("A track on this release also belongs to another release.", "This track belongs to more
than one release.") are gone, because the database now keeps every track on one release.

### Rollout layout (owner 2026-11-15)

| PR | Code | Migration |
|---|---|---|
| Slice 3 | the six functions above → Drizzle | one add-only migration: the flag and the one-place rule |
| Slice 4 | `publish_release`, `update_release`, `add_album_track` → Drizzle | one migration that (a) drops the 11 functions slices 1–3 replaced (`search_feed`, `admin_list_users`, `admin_delete_artist`, `admin_set_user_role`, the six above, `release_for_track`); (b) revokes `TRUNCATE`, `TRIGGER`, `REFERENCES`, `MAINTAIN` on every `public` table from `anon` and `authenticated`, now and as the default for future tables; (c) revokes `UPDATE` on `public.users` from `authenticated` and `anon` |
| Final cleanup (its own branch, after slice 4 is live in production) | — | drops `publish_release`, `update_release`, `add_album_track`, `resolve_artist_refs`, `increment_play_count` |

Why the drops trail the code: `deploy.yml` applies migrations before it deploys the code, so a
function can only be dropped once the code live in production no longer calls it. **Slice 3 must
be live in production (develop → main) before slice 4 deploys** (done: #41, 2026-11-16). Slice 4
also removed or rewrote the tests that called the dropped functions, keeping everything they
checked: the parity tests now run the services alone, the release ones against snapshots recorded
from the SQL functions ([testing.md](testing.md)).

Stay in SQL permanently: the triggers `handle_new_user`, `sync_user_role_from_app_metadata`,
`keep_created_at`, `keep_catalog_number`, `releases_default_sort_at`, `track_in_one_place`
(slice 3: one track in one place), and `current_user_role` (RLS policies call it).
`increment_play_count` (nothing calls it) is dropped in the final cleanup.

Dropped by slice 4's migration: `search_feed`, `admin_list_users`, `admin_delete_artist`,
`admin_set_user_role`, `archive_release`, `restore_release`, `archive_track`, `restore_track`,
`replace_track_audio`, `move_release`, `release_for_track`. Unused once slice 4 is live, until
the final cleanup drops them: `publish_release`, `update_release`, `add_album_track`,
`resolve_artist_refs` (their data tests and `releases-publish.parity.data.test.ts` still call them).

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
| `src/lib/supabase/artists.ts` `getArtists`, `getArtist`, `escapeLike` (retired `/artists`, not live) | reads; the owner brings the page back later |

Also one table: `getReleaseFeedPage` (`releases` only; `getFeedAfterRelease` then calls the
Drizzle `getFeed`), `getMyDownloadedTrackIds` (`downloads`), `getCurrentRole`
(`current_user_role()`), the invite store functions (`invites`), `setPinned` (`releases`), and the
artist create/update actions (`artists`). The app's only `rpc(...)` call left is `getCurrentRole`'s
`current_user_role`.
