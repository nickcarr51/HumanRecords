# Reference: Archive and restore

Migration `20261010120000_feed_order_and_archive.sql`. Columns: `releases.archived_at`,
`tracks.archived_at` (both nullable `timestamptz`; set = archived).

## What archiving does per object

| Archive | Effect |
|---|---|
| A single | Set `releases.archived_at` and the track's `archived_at` together. The single disappears from the feed and its track can no longer be streamed or downloaded. |
| An album | Set `releases.archived_at`. The feed row and `/albums/[id]` disappear (`getAlbum` returns `null`). **Closed:** `archive_release` archives the album's live tracks with the same timestamp, so stream/download refuse them too. |
| One track on an album | Set `tracks.archived_at`. The album stays; the track is skipped in feed and album track lists, and its stream/download is refused. **If it was the album's last live track, archive the release too:** the feed drops albums with zero live tracks (`toFeedItem`), which makes that page come back short, so `archive_track` does this itself: removing the last live track archives the release with the same timestamp. |

The archive writes are the SQL functions `archive_release` / `archive_track` (the admin UI that calls them is not built). Each archive also queues the object
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

`restore_release` / `restore_track` (atomic). Restoring a release clears `archived_at` on the
release and **only** on tracks carrying the same timestamp (those archived with it; a track
removed earlier stays removed). It deletes the still-uncleaned `archived` queue rows for those
sources (`cleaned_at is null`) so the job doesn't remove a live file. If a matching `archived`
row is already `cleaned_at`, the file is gone from R2: both functions refuse with `22023`.
`restore_track` refuses a single ("Restore the single instead.") and an archived album ("Restore
the album first."). Restoring the album whose last track was removed brings that track back
(same timestamp). Archive/restore on something already in that state is a no-op. `archive_track` locks the release, rejects singles, then locks the track and returns if it is already archived; only then does it refuse an archived album. So removing an album's last track twice (double-click) is a no-op the second time.
`move_release` refuses archived releases (`22023`), so restore before reordering.

## Why not hard delete

- `downloads` references tracks with `on delete cascade`; a hard delete erases download
  history.
- The prod R2 bucket is delete-locked ([[media-storage]]), so the files stay regardless.
- Archive is reversible; deletion is not. The only hard delete is an uncredited artist
  ([artist-delete.md](artist-delete.md)).
