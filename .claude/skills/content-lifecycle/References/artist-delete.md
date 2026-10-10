# Reference: Deleting artists

Migration `20261010120400_artist_credit_fk_restrict.sql`. Test: `artist-delete.data.test.ts`.

## The rule

`track_artists.artist_id` and `album_artists.artist_id` now reference `artists(id)` with
`on delete restrict` (they were `cascade`). Deleting an artist who is still credited on any
track or album fails with SQLSTATE **`23503`** (foreign key violation) instead of silently
stripping the credit. Deleting a track or album still cascades its own credit rows (that side is
unchanged). `artists.user_id` stays `on delete set null`.

## Admin flow (not built)

- Attempt the delete (service-role or a definer function). On `23503`, show a message such as
  "This artist is still credited on releases. Remove or reassign those credits first."
- No credits: the delete succeeds and is the one **hard delete** in the system. Queue the
  artist's `profile_photo_url` key in `r2_cleanup_queue` (`source_table = 'artists'`, reason
  `archived`) before or with the delete ([r2-cleanup-queue.md](r2-cleanup-queue.md)).
- Credited artists are not archived (artists have no `archived_at`); the admin removes credits
  first, or leaves the artist.

## Why one release was enough

The deployed code never deletes artists, so tightening the FK in the same release is
expand/contract-safe ([[release-ops]] `References/migrations.md`).
