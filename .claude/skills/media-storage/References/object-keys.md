# Reference: Object keys, buckets, and CORS

## Which columns hold keys

| Column | Status |
|---|---|
| `tracks.audio_url` | Required. Every track has one. |
| `tracks.track_art_url` | Nullable; always null today. |
| `albums.album_art_url` | Nullable; always null today. |
| `artists.profile_photo_url` | Nullable; always null today. |

Despite `_url`, these are **object keys** inside `R2_BUCKET_NAME`. The signed URL is
`${R2_ENDPOINT}/${bucket}/${key}?X-Amz-…`. Never store a signed URL in the database (it
expires) and never render a key directly.

## Key conventions

| Source | Shape | Example |
|---|---|---|
| Local seed (`yarn r2:seed-local`, fixed ids in `scripts/lib/r2-local.mts`) | `tracks/<uuid v4>.mp3` | `tracks/c41d7e9f-2a3b-4c5d-b6e7-f8091a2b3c43.mp3` |
| Admin upload | `tracks/<uuid v4>.mp3` | `tracks/3f2b…c1.mp3` |

Upload keys are minted server-side by `createUploadUrls` and validated against `AUDIO_KEY_RE`
(`src/lib/admin/rules.ts`) by `publishRelease`, so a client can't make a track point at an
arbitrary object. Details in [[admin-upload]] `References/upload-flow.md`.

Every audio key, seed or upload, is `tracks/<uuid>.mp3`. When artwork lands, follow the same
pattern (`<kind>/<uuid>.<ext>`).

## Buckets and environments

`R2_BUCKET_NAME` selects the bucket: `humanrecords-media-local` (laptop), `-dev` (develop
deployment), `-prod` (production). Seed objects exist only in the local bucket, put there by
`yarn r2:seed-local`. Pointed at a bucket without them, signing still succeeds (it never checks the
object exists); the **browser** gets a 404 fetching the URL and the player shows its error state.

## Orphans and `r2_cleanup_queue`

A publish that fails after upload, or a file replaced in the form after uploading, leaves an
object with no row pointing at it. Accepted for now.

`r2_cleanup_queue` (service-role only) records keys that may later be deletable:

| `reason` | Key comes from | `source_table` |
|---|---|---|
| `archived` | an archived track's `audio_url`/`track_art_url`, an archived album's `album_art_url` | `tracks` / `albums` |
| `replaced` | a file swapped out in the admin UI (MP3 or image) | `tracks` / `albums` / `artists` |
| `archived` | the photo of an uncredited artist that was hard-deleted (queued as `archived` because the check constraint allows only `archived` / `replaced`) | `artists` |

**Nothing deletes from R2 now.** The future cleanup job may delete a key only when it was queued
30+ days ago **and** no live row still references it (album/track art can be shared), then sets
`cleaned_at`. It never runs against the locked prod bucket without the lock being deliberately
lifted. Full rules: [[content-lifecycle]] `References/r2-cleanup-queue.md`.

## CORS

Streaming via `<audio src>` and downloads via navigation don't need CORS. **Browser PUT
uploads do** (cross-origin XHR with a custom Content-Type → preflight). The bucket needs a CORS
rule allowing `PUT` (and `GET`/`HEAD`) from the app origins with `Content-Type` as an allowed
header. The rules will be committed as `infra/r2/cors.local.json`, `cors.dev.json`, `cors.prod.json`
during setup (Task B2, pending) (local: localhost origins; dev: develop domain; prod: prod domain). The user pastes each into
Cloudflare → R2 → the bucket → Settings → CORS policy, and re-pastes after a domain change
([[release-ops]] `References/domain-cutover.md`). Background: [[admin-upload]]
`References/upload-flow.md`. Symptom when missing: every upload fails at the PUT step with a CORS error in the
browser console.
