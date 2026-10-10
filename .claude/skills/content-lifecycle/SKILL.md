---
name: content-lifecycle
description: Use when archiving, restoring, or removing releases, tracks, or artists; replacing an uploaded MP3 or image; working with archived_at, r2_cleanup_queue, the artist-delete FK block, move_release / pinned / sort_at ordering, or a future R2 cleanup job. Also when an archived item still shows somewhere, a deleted artist errors with 23503, or someone asks whether a file can be deleted from R2.
---

# Content Lifecycle (archive, order, cleanup)

What happens to catalog content after it is published: how it is hidden (soft delete), how
the feed is ordered and reordered, which R2 keys are queued for a future cleanup, and why
artists can't be deleted while credited. The **schema and read-side guards are built**
(branch `feature/v1-schema`, 2026-10-10); the admin UI that drives them is not. The atomic archive/restore/edit SQL functions are built
(branch `feature/release-admin-functions`).

## The one thing to understand first

**Nothing is hard-deleted except uncredited artists, and app code never deletes from R2.**
Releases and tracks get `archived_at`; a hard delete would cascade away `downloads` history,
and the prod bucket is delete-locked anyway. `archived_at` plus `r2_cleanup_queue` are the
record of what is gone and which files might be removed later. Archived rows are hidden from
listeners by RLS but **label members can still read them**, so every listener-facing path
(`getFeed`, `getAlbum`, `getTrackStreamUrl`, `getTrackDownloadUrl`, `search_feed`) also
filters `archived_at` explicitly. Ordering is separate from age: `created_at` is the locked
upload date, `sort_at` is the movable feed position (`move_release` swaps it).

## Pieces

| Concern | Where |
|---|---|
| `pinned`, `sort_at`, `archived_at`, `keep_created_at`, live-only read policies | `supabase/migrations/20261010120000_feed_order_and_archive.sql` |
| `move_release` | `…20261010120100_move_release.sql` |
| `search_feed` (archived excluded) | `…20261010120200_search_feed.sql` |
| `r2_cleanup_queue` | `…20261010120300_r2_cleanup_queue.sql` |
| Artist-side credit FKs `restrict` | `…20261010120400_artist_credit_fk_restrict.sql` |
| `release_for_track` (internal), `archive_release`, `restore_release` | `…20261010140000_archive_restore_release.sql` |
| `archive_track`, `restore_track` | `…20261010140100_archive_restore_track.sql` |
| `add_album_track`, `replace_track_audio` | `…20261010140200_add_track_replace_audio.sql` |
| `update_release` | `…20261010140300_update_release.sql` |
| Feed order + archived filter, `feedPageSize()` | `src/lib/supabase/feed.ts` (`getFeed`) |
| `null` for archived albums, archived tracks skipped | `src/lib/supabase/albums.ts` (`getAlbum`) |
| Stream/download refuse archived tracks | `src/lib/storage/actions.ts` |
| Tests | `src/lib/supabase/{archive-schema,move-release,search-feed,r2-cleanup-queue,artist-delete}.data.test.ts`, `feed.data.test.ts`, `albums.data.test.ts`, `{archive-release,archive-track,add-track-replace-audio,update-release}.data.test.ts`, `src/lib/storage/actions.test.ts` |

## References

- [archive-and-restore.md](References/archive-and-restore.md) — what archiving does per
  object, who still sees archived rows, restore rules, why not hard delete.
- [r2-cleanup-queue.md](References/r2-cleanup-queue.md) — columns, when rows are written and
  removed, the future job's rules, service-role only.
- [ordering.md](References/ordering.md) — `pinned`, `sort_at`, `created_at`, the default
  trigger, `move_release` (swap, tie spreading, group edges, deadlock retry).
- [artist-delete.md](References/artist-delete.md) — the `restrict` FK, `23503`, the admin
  message, uncredited artists.

## Depends on

- [[catalog-schema]] — the tables, RLS policies, definer-function pattern, generated types.
- [[media-storage]] — R2 keys, the prod bucket lock, the stream/download actions.

Used by: [[admin-upload]] (the future edit/delete UI), [[invites]] (user deactivation is a
reversible auth ban, `admin_list_users.banned_until`, not a delete), [[timeline-player]]
(feed order and archived filtering).

## Known deferrals (as of 2026-10-10)

- **Admin UI** for archive/restore/reorder/pin and replace is the release-admin branch;
  artist and user admin is a later branch. The SQL functions exist (see Pieces) but no app code
  calls them, `move_release`, or `search_feed` yet.
- **The cleanup job itself** is not built; nothing deletes from R2.
