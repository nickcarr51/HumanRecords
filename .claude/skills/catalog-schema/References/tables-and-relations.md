# Reference: Tables + relations

All tables are in `public`, have RLS enabled, and use `uuid` ids (`gen_random_uuid()`) and
`created_at timestamptz default now()`.

## Entities

| Table | Columns | Notes |
|---|---|---|
| `users` | `id` (PK → `auth.users.id`, cascade), `name` (nullable), `role user_role default 'listener'`, `created_at` | One row per auth user, created by the `handle_new_user` trigger. Email is **not** here — it stays in `auth.users`. Column grant to `authenticated`: `id, name, created_at` (not `role`). |
| `invites` | `user_id` (PK → `auth.users`, cascade), `token text unique` (plaintext, null once used), `used_at`, `created_by`, `created_at`, `updated_at` | One row per user. **Service-role only**: RLS on, no policies, no grants. See [[invites]]. |
| `artists` | `id`, `name not null`, `bio`, `profile_photo_url`, `user_id unique → users.id on delete set null`, `created_at` | `user_id` links an artist to a member account (nullable; at most one artist per account). Unique index `artists_name_ci_key` on `lower(trim(name))` — one artist per name, case/space-insensitive. |
| `albums` | `id`, `title not null`, `album_art_url`, `created_at` | `created_at` is locked (see below). |
| `tracks` | `id`, `title not null`, `track_art_url`, `audio_url not null`, `play_count int default 0`, `archived_at`, `created_at` | `archived_at` set ⇒ soft-deleted track; hidden from listeners by RLS. `created_at` locked. |
| `downloads` | `user_id → users`, `track_id → tracks`, `downloaded_at`; PK `(user_id, track_id)` | One row per user+track (repeat downloads ignored). |
| `releases` | `id`, `kind release_kind`, `track_id unique → tracks`, `album_id unique → albums`, `created_at` | The timeline unit. Check constraint: `single` ⇒ `track_id` set + `album_id` null; `album` ⇒ the reverse. Index on `created_at desc`. Cascades on target delete. Feed columns: `pinned boolean default false`, `sort_at timestamptz not null` (movable feed position), `archived_at` (soft delete). |
| `r2_cleanup_queue` | `id`, `object_key`, `reason` (`archived`/`replaced`), `source_table` (`tracks`/`albums`/`artists`), `source_id`, `queued_at`, `cleaned_at` | Keys that may be deletable from R2 later. **Service-role only**: RLS on, no policies, privileges revoked. See [[content-lifecycle]]. |

Enums: `user_role = listener | artist | label_member`; `release_kind = single | album`.

## Link tables (many-to-many)

| Table | PK | `position` | Meaning |
|---|---|---|---|
| `track_artists` | `(track_id, artist_id)` | credit order on the track | A track can credit several artists. |
| `album_artists` | `(album_id, artist_id)` | credit order on the album | Album-level credit. Empty ⇒ UI shows "Various Artists". |
| `track_albums` | `(track_id, album_id)` | track number on the album | A track can sit on several albums. |

`position` (integer, `not null`) was added by the releases migration and backfilled from
title/name order. It is **not** unique-constrained — the writer (`publish_release`) assigns
1..n. Order in JS with `byPosition` (`src/lib/supabase/artist-names.ts`) because nested
PostgREST embeds can't be ordered by a link-table column.

All FKs cascade on delete, except `artists.user_id` → set null and the **artist side** of `track_artists`/`album_artists`, which is `restrict` (an artist still credited cannot be deleted; SQLSTATE `23503`). Deleting a track or album still cascades its credit rows.

## Feed ordering and soft delete (`20261010120000`)

- Feed order is `pinned desc, sort_at desc, id desc`. `sort_at` starts equal to `created_at`;
  `move_release` swaps it. A column default can't read another column, so the
  `releases_default_sort_at` before-insert trigger fills `sort_at := created_at` when omitted
  (`publish_release` omits it). Generated `releases.Insert` types still **require** `sort_at`.
- `created_at` is the real upload date and never changes: `keep_created_at` before-update
  triggers on `releases`, `tracks` and `albums` restore the old value. Inserts may still set it
  (tests, backfills). Reorder with `sort_at`, never `created_at`.
- `archived_at` on `releases` and `tracks` is the soft delete. Archived rows are hidden from
  listeners by RLS; label members still read them (see [rls-model.md](rls-model.md)).
- Partial index `releases_feed_order_idx (pinned desc, sort_at desc, id desc) where archived_at is null`.

## Indexes

A composite PK only serves lookups by its first column, so the reverse direction is indexed
explicitly: `track_artists(artist_id)`, `album_artists(artist_id)`, `track_albums(album_id)`,
`downloads(track_id)`. Plus `releases(created_at desc)`, `releases_feed_order_idx`, `artists_name_ci_key`, and on `r2_cleanup_queue`
`(queued_at) where cleaned_at is null` and `(source_table, source_id)`.

## Media columns hold R2 object keys, not URLs

`tracks.audio_url`, `tracks.track_art_url`, `albums.album_art_url`,
`artists.profile_photo_url` store the **object key** in the private R2 bucket (e.g.
`tracks/<uuid>.mp3` — the seed and admin uploads use the same shape). The `_url` suffix is
historical. Never render them directly — sign them server-side (see [[media-storage]]).
Artwork columns are currently always null (no artwork upload yet).

## What appears in the feed

Only rows with a `releases` row. An album's tracks have no release of their own, so they
never appear as separate feed items. Archived releases are excluded, as are archived album tracks and archived single tracks (a single whose track is archived is dropped). An album with zero live tracks (all archived, or none) is also dropped by `toFeedItem`; a dropped item makes that page come back short, so admin actions must keep data consistent (archiving an album's last live track archives the release). Pre-existing hosted rows were backfilled: every album
got an `album` release; every track not on an album got a `single` release.

## Querying with embeds

PostgREST resource embedding follows FKs:
`releases → track:tracks(…)`, `album:albums(… track_albums(position, tracks(…)))`,
`… track_artists(position, artists(name))`. Generated types describe nested embeds loosely,
so call sites cast with `as unknown as <Shape>` — keep the cast narrow and local.
Counting a relation: `track_artists(count)` with `{ count: 'exact' }` (see `getArtists`).
