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
| Local seed (pre-existing dev objects) | the original filename | `DAYE. - LET EM KNOW.mp3` |
| Admin upload | `tracks/<uuid v4>.mp3` | `tracks/3f2b…c1.mp3` |

Upload keys are minted server-side by `createUploadUrls` and validated against `AUDIO_KEY_RE`
(`src/lib/admin/rules.ts`) by `publishRelease`, so a client can't make a track point at an
arbitrary object. Details in [[admin-upload]] `References/upload-flow.md`.

Spaces and punctuation in seed keys work because `new URL()` percent-encodes the path before
signing. When artwork lands, follow the upload pattern (`<kind>/<uuid>.<ext>`).

## Buckets and environments

`R2_BUCKET_NAME` selects the bucket (`.env.example` default: `humanrecords-media-dev`).
Local `.env.local` and the develop deployment point at the dev bucket. Seed keys only exist
in that bucket. Pointed at a bucket without them, signing still succeeds (it never checks the
object exists); the **browser** gets a 404 fetching the URL and the player shows its error state.

## Orphans

A publish that fails after upload, or a file replaced in the form after uploading, leaves an
object with no row pointing at it. Accepted for now; cleanup is planned with Delete.

## CORS

Streaming via `<audio src>` and downloads via navigation don't need CORS. **Browser PUT
uploads do** (cross-origin XHR with a custom Content-Type → preflight). The bucket needs a CORS
rule allowing `PUT` (and `GET`/`HEAD`) from the app origins with `Content-Type` as an allowed
header. The rules are committed as `infra/r2/cors.local.json`, `cors.dev.json`, `cors.prod.json`
(local: localhost origins; dev: develop domain; prod: prod domain). The user pastes each into
Cloudflare → R2 → the bucket → Settings → CORS policy, and re-pastes after a domain change
([[release-ops]] `References/domain-cutover.md`). Background: [[admin-upload]]
`References/upload-flow.md`. Symptom when missing: every upload fails at the PUT step with a CORS error in the
browser console.
