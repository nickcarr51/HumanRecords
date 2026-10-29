# Reference: Deleting artists

Migration `20261010120400_artist_credit_fk_restrict.sql`. Test: `artist-delete.data.test.ts`.

## The rule

`track_artists.artist_id` and `album_artists.artist_id` now reference `artists(id)` with
`on delete restrict` (they were `cascade`). Deleting an artist who is still credited on any
track or album fails with SQLSTATE **`23503`** (foreign key violation) instead of silently
stripping the credit. Deleting a track or album still cascades its own credit rows (that side is
unchanged). `artists.user_id` stays `on delete set null`.

## Admin flow (built)

- `/admin/artists/[id]` has a Danger zone (`DeleteArtist`) that calls `deleteArtist`, which calls
  the `removeArtist` service (`src/lib/services/artists.ts`, `authorize` + `asSystem`,
  [[db-access]]; it replaced the definer function `admin_delete_artist`, migration
  `20261010130000`, in Drizzle slice 2; the function still exists until a cleanup migration drops
  it). On `23503` (which reaches the action as `DomainError` `CONFLICT`) the UI shows
  `creditMessage` (still credited on N tracks / M albums; remove or reassign those credits
  first), and nothing is deleted or queued.
- No credits: the delete succeeds and is the one **hard delete** in the system. The artist's
  `profile_photo_url` key is queued in `r2_cleanup_queue` (`source_table = 'artists'`, reason
  `archived`) in the same transaction ([r2-cleanup-queue.md](r2-cleanup-queue.md)).
  `src/lib/services/artists.parity.data.test.ts` checks the service and the old function give the
  same result.
- Credited artists are not archived (artists have no `archived_at`); the admin removes credits
  first, or leaves the artist.

## Why one release was enough

The deployed code never deletes artists, so tightening the FK in the same release is
expand/contract-safe ([[release-ops]] `References/migrations.md`).
