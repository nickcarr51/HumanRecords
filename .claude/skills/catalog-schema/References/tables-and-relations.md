# Reference: Tables + relations

All tables are in `public`, have RLS enabled, and use `uuid` ids (`gen_random_uuid()`) and
`created_at timestamptz default now()`.

## Entities

| Table | Columns | Notes |
|---|---|---|
| `users` | `id` (PK → `auth.users.id`, cascade), `name` (nullable), `role user_role default 'listener'`, `created_at` | One row per auth user, created by the `handle_new_user` trigger. Email is **not** here — it stays in `auth.users`. Column grant to `authenticated`: `id, name, created_at` (not `role`). |
| `invites` | `user_id` (PK → `auth.users`, cascade), `token text unique` (plaintext, null once used), `used_at`, `created_by`, `created_at`, `updated_at` | One row per user. **Service-role only**: RLS on, no policies, no grants. See [[invites]]. |
| `artists` | `id`, `name not null`, `bio`, `profile_photo_url`, `user_id unique → users.id on delete set null`, `created_at` | `user_id` links an artist to a member account (nullable; at most one artist per account). Unique index `artists_name_ci_key` on `lower(trim(name))` — one artist per name, case/space-insensitive. |
| `albums` | `id`, `title not null`, `album_art_url`, `created_at` | |
| `tracks` | `id`, `title not null`, `track_art_url`, `audio_url not null`, `play_count int default 0`, `created_at` | |
| `downloads` | `user_id → users`, `track_id → tracks`, `downloaded_at`; PK `(user_id, track_id)` | One row per user+track (repeat downloads ignored). |
| `releases` | `id`, `kind release_kind`, `track_id unique → tracks`, `album_id unique → albums`, `created_at` | The timeline unit. Check constraint: `single` ⇒ `track_id` set + `album_id` null; `album` ⇒ the reverse. Index on `created_at desc`. Cascades on target delete. |

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

All FKs cascade on delete (except `artists.user_id` → set null).

## Indexes

A composite PK only serves lookups by its first column, so the reverse direction is indexed
explicitly: `track_artists(artist_id)`, `album_artists(artist_id)`, `track_albums(album_id)`,
`downloads(track_id)`. Plus `releases(created_at desc)` and `artists_name_ci_key`.

## Media columns hold R2 object keys, not URLs

`tracks.audio_url`, `tracks.track_art_url`, `albums.album_art_url`,
`artists.profile_photo_url` store the **object key** in the private R2 bucket (e.g.
`DAYE. - LET EM KNOW.mp3` from the seed, or `tracks/<uuid>.mp3` for admin uploads). The `_url` suffix is
historical. Never render them directly — sign them server-side (see [[media-storage]]).
Artwork columns are currently always null (no artwork upload yet).

## What appears in the feed

Only rows with a `releases` row. An album's tracks have no release of their own, so they
never appear as separate feed items. Pre-existing hosted rows were backfilled: every album
got an `album` release; every track not on an album got a `single` release.

## Querying with embeds

PostgREST resource embedding follows FKs:
`releases → track:tracks(…)`, `album:albums(… track_albums(position, tracks(…)))`,
`… track_artists(position, artists(name))`. Generated types describe nested embeds loosely,
so call sites cast with `as unknown as <Shape>` — keep the cast narrow and local.
Counting a relation: `track_artists(count)` with `{ count: 'exact' }` (see `getArtists`).
