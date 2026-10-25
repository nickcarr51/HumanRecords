---
name: catalog-schema
description: Use when adding or changing a Supabase migration (`supabase/migrations/*`), table, column, RLS policy, grant, trigger, or SQL function (`increment_play_count`, `current_user_role`, `handle_new_user`, `admin_list_users`, `admin_set_user_role`, `admin_delete_artist`, `move_release`, `search_feed`, `archive_release`/`restore_release`, `archive_track`/`restore_track`, `add_album_track`, `replace_track_audio`, `update_release`, `keep_created_at`, `keep_catalog_number`), `archived_at`, `catalog_number` / HS### / HSS### catalog numbers, `r2_cleanup_queue`, `supabase/seed.sql`, `supabase/config.toml`, regenerating `database.types.ts`, the browser/server/service clients (`src/lib/supabase/{client,server,service}.ts`), or a `*.data.test.ts` / schema test (`test-helpers.ts`, `release-admin-fixtures.ts`). Also when a query silently returns zero rows, a column read errors with permission denied, "column catalog_number does not exist" (42703), or a data test refuses to run against a non-local URL.
---

# Catalog Schema + Supabase Data Layer

The Postgres schema (users, artists, albums, tracks, their link tables, downloads, releases),
its Row Level Security model, the three Supabase client factories, the local Supabase
workflow, and the generated TypeScript types. Every other feature reads through this.

## The one thing to understand first

**The `authenticated` role can read the catalog and write nothing — except label members writing `artists`.** Every table has RLS on,
every table has an `authenticated … for select` policy: `using (true)` for most, except
`downloads` (owner-only), `releases`/`tracks` (archived rows hidden unless the caller is a label
member), and `r2_cleanup_queue` (no policies at all; service role only). See
`References/rls-model.md`. And **no table has a write policy except `artists`** (label-member insert/update,
for `/admin/artists`). Every other write goes through one of
two routes: a `security definer` SQL function that checks the caller itself
(`increment_play_count`, `publish_release`, `move_release`, `admin_delete_artist`), or the server-only **service-role** client
(`createServiceClient`, used for recording downloads). A blocked write under RLS does not
error — it silently affects zero rows. Design new writes as a definer function with a role
check (see `publish_release` in [[admin-upload]]) rather than opening a write policy.

## Pieces

| Concern | Where |
|---|---|
| `users` + `user_role` enum + `handle_new_user` trigger | `supabase/migrations/20260915004137_create_users.sql` |
| `artists` (unique `user_id`) | `…20260915004749_create_artists.sql` |
| `albums`, `tracks`, `increment_play_count` | `…20260915005111_create_albums_and_tracks.sql` |
| Link tables + `downloads` + reverse-lookup indexes | `…20260915005504_create_catalog_relations.sql` |
| RPC grant hardening (no `public`/`anon`) | `…20260915013116_revoke_play_count_public_execute.sql` |
| `downloads` owner-only select | `…20260916140000_downloads_owner_only_select.sql` |
| Hide `users.role` via column grants | `…20260916140001_hide_user_role_column.sql` |
| `releases`, `position` columns, unique artist names, `current_user_role()` | `…20260929120000_create_releases.sql` |
| `resolve_artist_refs` + `publish_release` | `…20260929120100_publish_release.sql` |
| `users.name`, role from `app_metadata`, role-sync trigger | `…20261002120000_users_name_and_app_metadata_role.sql` |
| `invites`, `admin_list_users`, `admin_set_user_role` | `…20261002120100_create_invites.sql` |
| `pinned`/`sort_at`/`archived_at`, `keep_created_at`, live-only read policies | `…20261010120000_feed_order_and_archive.sql` |
| `move_release` (admin reorder) | `…20261010120100_move_release.sql` |
| `search_feed` (feed search) | `…20261010120200_search_feed.sql` |
| `r2_cleanup_queue` (service-only) | `…20261010120300_r2_cleanup_queue.sql` |
| Artist-side credit FKs `restrict` | `…20261010120400_artist_credit_fk_restrict.sql` |
| `admin_list_users` returns `banned_until` | `…20261010120500_admin_list_users_banned_until.sql` |
| `artists` label-member insert/update policies, `admin_delete_artist` | `…20261010130000_artists_admin_writes.sql` |
| Release admin: `archive_release`/`restore_release`, `archive_track`/`restore_track`, `add_album_track`/`replace_track_audio`, `update_release` | `…20261010140000`..`…20261010140300` |
| `catalog_number` on `albums` + `tracks` (identity, backfilled), `keep_catalog_number` trigger | `…20261011170000_catalog_numbers.sql` |
| Local seed (example users, 4 artists, 1 album, 1 single, releases; `seed_helpers.seed_user`) | `supabase/seed.sql` |
| Optional gitignored real-account seed (template: `supabase/seed-local.example.sql`) | `supabase/seed.local.sql` (`sql_paths` globs `./seed.local*.sql`) |
| Local stack config (ports, auth, OTP, email templates) | `supabase/config.toml` |
| Generated types (`Database`) | `src/lib/supabase/database.types.ts` |
| Browser client | `src/lib/supabase/client.ts` |
| Server client (cookies; RSC, route handlers, actions) | `src/lib/supabase/server.ts` |
| Service-role client (bypasses RLS, `server-only`) | `src/lib/supabase/service.ts` |
| Session refresh + route guard per request | `src/lib/supabase/middleware.ts` (see [[auth]]) |
| Test helpers (local-only guard, OTP test users) | `src/lib/supabase/test-helpers.ts` |
| Schema/RLS tests | `src/lib/supabase/{users,artists,catalog,catalog-relations,releases-schema.data,publish-release.data,artists-admin-writes.data}.test.ts` |
| v1 schema tests | `src/lib/supabase/{archive-schema,move-release,search-feed,r2-cleanup-queue,artist-delete}.data.test.ts` (+ `invites.data.test.ts` covers `banned_until`) |
| Release-admin + catalog-number tests (tagged fixtures) | `src/lib/supabase/{archive-release,archive-track,add-track-replace-audio,update-release,catalog-numbers}.data.test.ts` via `release-admin-fixtures.ts` |
| Catalog-number formatting (`HS###` / `HSS###`) | `src/components/CatalogId/CatalogId.tsx` (+ `CatalogLine.tsx`); the DB stores only the integer |
| Unit vs DB test projects | `vitest.config.mts` (`unit` parallel, `db` serial; `dbTests` list) |

## References

- [tables-and-relations.md](References/tables-and-relations.md) — every table and column,
  the many-to-many link tables, `position` ordering, `releases`, catalog numbers
  (`catalog_number`), indexes, and the "`audio_url` holds an R2 key, not a URL" rule.
- [rls-model.md](References/rls-model.md) — read policies, the column grant hiding `role`,
  owner-only downloads, definer functions, and how to add a write path safely.
- [functions.md](References/functions.md) — `handle_new_user` + role-sync trigger, `increment_play_count`,
  `current_user_role`, `admin_list_users`, `admin_set_user_role`, `admin_delete_artist`, `resolve_artist_refs`, `publish_release`,
  `move_release`, `search_feed`, the release-admin functions,
  `releases_default_sort_at`/`keep_created_at`/`keep_catalog_number` (signatures, grants, callers).
- [clients-and-types.md](References/clients-and-types.md) — which client to use where, the
  dependency-injection convention for data functions, regenerating `database.types.ts`, and
  what the generated types look like for an identity column (`catalog_number?: never`).
- [local-workflow.md](References/local-workflow.md) — `supabase start`/`db reset`, seed
  accounts + `seed.local.sql`, Mailpit, adding a migration, hosted rollout (via `deploy.yml`
  only), the data-test conventions (`test-helpers.ts`, `release-admin-fixtures.ts`), running one
  `db` test file, the `unit`/`db` Vitest projects, and the "column … does not exist" symptom.
- [[release-ops]] `References/migrations.md` — the add-only rule and expand/contract (two-release
  rename/drop). Read before any migration that renames, drops, or tightens something.

## Catalog numbers (HS### / HSS###)

Since `20261011170000`, `albums.catalog_number` and `tracks.catalog_number` are permanent,
unique integers assigned by Postgres on insert (`generated always as identity`, one sequence
per table). Vocabulary: **`HS###` = an album, `HSS###` = any track** — every track gets one,
not only singles, so a single is `HSS###` and never has an `HS` number. The database stores
only the integer; the prefix and zero-padding (`padStart(3)`) live in the UI (`CatalogId`).
Nobody can supply or change a number: Postgres rejects an explicit value on an always-identity
column, the `keep_catalog_number` trigger raises on any update that would change it, and the
generated types mark it `never` in `Insert`/`Update`. Archived rows keep their number;
deleting a row (tests only) consumes it — numbers are never reused. Details:
[tables-and-relations.md](References/tables-and-relations.md) "Catalog numbers".

## Depends on

Nothing — this is foundational. Feature skills that build on it: [[auth]] (users table,
role trigger), [[media-storage]] (`tracks.audio_url` keys, `downloads`), [[timeline-player]]
(`getFeed`/`getAlbum`), [[admin-upload]] (`releases`, `publish_release`), [[invites]] (`invites`, admin user functions), [[artists-read]], [[content-lifecycle]] (archive, `r2_cleanup_queue`, ordering, artist delete),
[[release-ops]] (how migrations
reach hosted databases).

## Known deferrals (as of 2026-10-24)

- Soft delete exists in the schema (`archived_at`); the release admin UI for it is built
  ([[content-lifecycle]]).
- `play_count` has an RPC but nothing in the app calls it yet.
- Catalog numbers are display-only: nothing searches or sorts by `catalog_number` yet, and the
  admin UI does not show them.
- Drizzle since slice 1 (2026-10): one table → supabase-js, more → Drizzle; see [clients-and-types.md](References/clients-and-types.md).

A code guide (migration-by-migration read, with why each security fix exists) is in
`Walkthrough/walkthrough.md` (gitignored).
