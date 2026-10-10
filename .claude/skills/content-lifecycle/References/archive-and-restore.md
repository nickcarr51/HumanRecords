# Reference: Archive and restore

Migration `20261010120000_feed_order_and_archive.sql`. Columns: `releases.archived_at`,
`tracks.archived_at` (both nullable `timestamptz`; set = archived).

## What archiving does per object

| Archive | Effect |
|---|---|
| A single | Set `releases.archived_at` and the track's `archived_at` together. The single disappears from the feed and its track can no longer be streamed or downloaded. |
| An album | Set `releases.archived_at`. The feed row and `/albums/[id]` disappear (`getAlbum` returns `null`). Its tracks need not be archived individually. **Known gap (deferred to the release-admin branch):** the live tracks of an archived album are still signable by `getTrackStreamUrl` / `getTrackDownloadUrl` if a caller already has the track id; fix by checking the parent release or archiving the tracks with the album. |
| One track on an album | Set `tracks.archived_at`. The album stays; the track is skipped in feed and album track lists, and its stream/download is refused. **If it was the album's last live track, archive the release too:** the feed drops albums with zero live tracks (`toFeedItem`), which makes that page come back short, so admin actions must keep data consistent. |

The archive writes happen in the admin UI (not built). Each archive also queues the object
keys involved in `r2_cleanup_queue` with reason `archived` ([r2-cleanup-queue.md](r2-cleanup-queue.md)).

## Who still sees archived rows

- RLS (`releases`, `tracks`): `archived_at is null or current_user_role() = 'label_member'`.
  Listeners never read archived rows; label members do, for the admin pages.
- Because of that, listener-facing code filters explicitly. Guards that exist: `getFeed`
  (`.is("archived_at", null)`, archived album tracks dropped), `getAlbum` (`null` for an
  archived album or one with no visible release, archived tracks skipped), `getTrackStreamUrl` / `getTrackDownloadUrl`
  ("Track not found."), `search_feed` (archived releases and tracks excluded).
- A new listener-facing query on `releases` or `tracks` **must** add its own `archived_at`
  filter, or label members will see archived items.

## Restore

Restoring = clear `archived_at`. Rules: restore the release and any tracks that were archived
with it; delete the still-uncleaned `archived` queue rows for that source
(`cleaned_at is null`) so the job doesn't remove a live file. If a queue row is already
`cleaned_at`, the file is gone from R2 and the track cannot be restored to a playable state.
`move_release` refuses archived releases (`22023`), so restore before reordering.

## Why not hard delete

- `downloads` references tracks with `on delete cascade`; a hard delete erases download
  history.
- The prod R2 bucket is delete-locked ([[media-storage]]), so the files stay regardless.
- Archive is reversible; deletion is not. The only hard delete is an uncredited artist
  ([artist-delete.md](artist-delete.md)).
