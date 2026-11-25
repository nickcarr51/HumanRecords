# Reference: Archive and restore

Migration `20261010120000_feed_order_and_archive.sql`. Columns: `releases.archived_at`,
`tracks.archived_at` (both nullable `timestamptz`; set = archived). Migration
`20261115120000_track_one_place.sql` added `tracks.archived_with_release` (boolean, default
`false`): true while a track is archived because its release was archived.

## What archiving does per object

| Archive | Effect |
|---|---|
| A single | Set `releases.archived_at` and the track's `archived_at` together. The single disappears from the feed and its track can no longer be streamed or downloaded. |
| An album | Set `releases.archived_at`. The feed row and `/albums/[id]` disappear (`getAlbum` returns `null`). **Closed:** `archiveRelease` also archives the album's live tracks (and sets their `archived_with_release`), so stream/download refuse them too. |
| One track on an album | Set `tracks.archived_at`. The album stays; the track is skipped in feed and album track lists, and its stream/download is refused. **If it was the album's last live track, archive the release too:** the feed drops albums with zero live tracks (`toFeedItem`), which makes that page come back short, so `archiveTrack` does this itself: removing the last live track archives the release too, and that track gets `archived_with_release`, so restoring the album brings it back. |

The archive writes are the services `archiveRelease` / `archiveTrack` in `src/lib/services/releases.ts` (Drizzle slice 3, [[db-access]]; each runs `authorize`, then one `asSystem` transaction). The admin UI calls them through `release-actions.ts` (`/admin/releases` and `/admin/releases/[id]`). They replaced the SQL functions `archive_release` / `archive_track`, which slice 4's migration (`20261119120000`) dropped. Each archive also queues the object
keys involved in `r2_cleanup_queue` with reason `archived` ([r2-cleanup-queue.md](r2-cleanup-queue.md)).

## Who still sees archived rows

- RLS (`releases`, `tracks`): `archived_at is null or current_user_role() = 'label_member'`.
  Listeners never read archived rows; label members do, for the admin pages.
- Because of that, listener-facing code filters explicitly. Guards that exist: `getFeed`
  (`isNull(releases.archivedAt)` in its Drizzle query, archived singles and album tracks
  dropped), its search filter `searchMatches` (archived tracks never match), `getAlbum` (`null`
  for an archived album or one with no visible release, archived tracks skipped),
  `getTrackStreamUrl` / `getTrackDownloadUrl` ("Track not found."). (The old `search_feed` SQL
  function, dropped in slice 4, excluded them too.)
- A new listener-facing query on `releases` or `tracks` **must** add its own `archived_at`
  filter, or label members will see archived items.

## Restore

`restoreRelease` / `restoreTrack` (services, one transaction each). Restoring a release clears
`archived_at` on the release and **only** on its tracks with `archived_with_release = true`
(those archived with it; a track removed earlier stays removed), and sets their flag back to
`false`. Example: album with tracks A, B, C. Monday: remove B. Tuesday: archive the album (A and C
get the flag). Restore: A and C come back, B stays removed. Before slice 3, `restore_release`
found these tracks by matching `archived_at` to the release's `archived_at` (one `now()` for the
whole archive); the migration's backfill flagged exactly the tracks the old timestamp match selected (the old SQL
function, dropped in slice 4, never used the flag). Restore deletes the still-uncleaned `archived` queue rows
for those sources (`cleaned_at is null`) so the job doesn't remove a live file. If a matching
`archived` row is already `cleaned_at`, the file is gone from R2: both refuse with `INVALID`
("Some files for this release were already deleted from storage; it can't be restored." /
"This track's file was already deleted from storage."). `restoreTrack` refuses a single
("Restore the single instead.") and an archived album ("Restore the album first."). Restoring the
album whose last track was removed brings that track back (it carries the flag). A track removed
on its own keeps the flag `false`, and `restoreTrack` only runs while the album is live, so it
never touches the flag. Archive/restore on something already in that state is a no-op.

Deploy window: during the minutes between the migration and the new code going live, the old
code still runs and never writes the flag. (a) A release archived by the old code gets no flag, so
restoring it later brings back none of its tracks. (b) A release restored by the old code keeps its
tracks' flags set to `true`; if old code then also removes one of those tracks on its own, a later
restore of the album brings that track back. Either is fixed by restoring the affected tracks by
hand, or by re-running the migration's backfill after setting `archived_with_release = false` on
every track.

`archiveTrack` locks the release, rejects singles, then locks the track and returns if it is already archived; only then does it refuse an archived album. So removing an album's last track twice (double-click) is a no-op the second time.
`moveRelease` refuses archived releases ("Archived releases cannot be moved."), so restore before reordering.

## One track in one place

Since migration `20261115120000_track_one_place.sql` a track belongs to at most one release: it
is on at most one album (unique index `track_albums_track_id_key`), and a single's track is never
also an album track (trigger `track_in_one_place`, `23505` "A track can belong to only one
release."). The app never did either: every upload creates a new track with its own R2 key. This
matters here because `archived_at` and `archived_with_release` are per track: archiving one
release could otherwise hide a track another release still shows. The old SQL functions refused a
shared track with `22023` ("A track on this release also belongs to another release.", "This track
belongs to more than one release."); the services drop those checks, since the database now makes
that state impossible ([[catalog-schema]] `References/tables-and-relations.md`).
Archived and restored releases and tracks keep their `catalog_number`; numbers are never reused
after an archive or a hard delete (identity column), and the `keep_catalog_number` trigger raises
on any update of the column ([[catalog-schema]]).

## Why not hard delete

- `downloads` references tracks with `on delete cascade`; a hard delete erases download
  history.
- The prod R2 bucket is delete-locked ([[media-storage]]), so the files stay regardless.
- Archive is reversible; deletion is not. The only hard delete is an uncredited artist
  ([artist-delete.md](artist-delete.md)).
