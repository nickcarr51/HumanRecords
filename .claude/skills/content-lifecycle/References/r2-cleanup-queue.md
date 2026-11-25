# Reference: `r2_cleanup_queue`

Migration `20261010120300_r2_cleanup_queue.sql`. Test: `r2-cleanup-queue.data.test.ts`.

## Columns

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `object_key` | the R2 key (e.g. `tracks/<uuid>.mp3`), not a URL |
| `reason` | `archived` or `replaced` (check constraint) |
| `source_table` | `tracks`, `albums`, or `artists` (check constraint) |
| `source_id` | uuid of the row that owned the key |
| `queued_at` | default `now()` |
| `cleaned_at` | null until a cleanup job deletes the object |

Indexes: `(queued_at) where cleaned_at is null` (pending work) and `(source_table, source_id)`
(restore lookups).

## Access

RLS on, **no policies**, all privileges revoked from `anon` and `authenticated`: only the service
role, the security-definer functions, or Drizzle's `asSystem` (the `postgres` login skips RLS;
[[db-access]]) can reach it. Even label members can't read or write it through the user client.
The release services (`archiveRelease`, `archiveTrack`, `replaceTrackAudio` in
`src/lib/services/releases.ts`) insert rows through `asSystem`, `restoreRelease` and
`restoreTrack` read and delete them there, and the `removeArtist` service inserts one when an
artist with a photo is deleted. The old security-definer functions (`archive_release`,
`archive_track`, `replace_track_audio`, the restore functions) did the same until slice 4's
migration dropped them ([[catalog-schema]] `References/rls-model.md`).

## When rows are written

- **Archive** a release/track (`archiveRelease`, `archiveTrack`; were `archive_release`, `archive_track`): queue the track audio and art keys and, for an album, its art key (`archived`). `archiveTrack` queues the album art only when it archives the last live track.
- **Replace** an MP3 (`replaceTrackAudio`; was `replace_track_audio`): queue the old key (`replaced`). Image replacement has no function yet. Replacing A→B then B→A leaves an uncleaned `replaced` row for A while A is live again; that is safe because the job only deletes keys no live row references.
- **Hard-delete an uncredited artist** (`removeArtist`, same transaction as the delete): queue their `profile_photo_url` key with reason `archived` (the check constraint allows only `archived` / `replaced`, so there is no "deleted" reason).

## When rows are removed

`restoreRelease` / `restoreTrack` (were `restore_release` / `restore_track`) delete the uncleaned `archived` rows for the tracks they bring back (and, for an album, its art), and refuse (`INVALID`; the SQL functions raised `22023`) if a matching `archived` row already has `cleaned_at` set. Rows are
otherwise kept; `cleaned_at` marks them done.

## The future cleanup job (not built)

Delete an object only if **all** hold: the row is uncleaned, `queued_at` is 30+ days old, and
**no live row references the key** (check `tracks.audio_url`, `track_art_url`, `albums.album_art_url`,
`artists.profile_photo_url`; album and track art can be shared). Then set `cleaned_at`. It must
never run against the locked prod bucket unless the lock is deliberately lifted in Cloudflare.
Until then nothing deletes from R2.

Each `tracks/<id>.mp3` also has a derived `peaks/<id>.bin` waveform file (`media-storage`
`References/object-keys.md`); the job should delete it alongside the MP3, wherever deletion is allowed (never prod).

The job must lock the owning release row (or re-check `archived_at` on the source row) before
deleting a key; otherwise a restore that runs between the job's check and its delete brings a
release back with a missing file.
