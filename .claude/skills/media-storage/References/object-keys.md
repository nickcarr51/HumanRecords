# Reference: Object keys, buckets, and CORS

## Which columns hold keys

| Column | Status |
|---|---|
| `tracks.audio_url` | Required. Every track has one. |
| `tracks.track_art_url` | Nullable; null in practice (no image upload yet; test fixtures set `art/<tag>-<n>.jpg`). |
| `albums.album_art_url` | Nullable; null in practice. Selected by `getAlbum`/`getFeed` as `albumArtUrl`, but the album page hides its artwork block until image upload ships. |
| `artists.profile_photo_url` | Nullable; null in practice. |

No column holds the waveform file; see [Peaks files](#peaks-files).

Despite `_url`, these are **object keys** inside `R2_BUCKET_NAME`, e.g. `album_art_url` holds
something like `art/3f2b….jpg`, never `https://…`. The signed URL is
`${R2_ENDPOINT}/${bucket}/${key}?X-Amz-…`. Never store a signed URL in the database (it
expires) and never render a key directly.

**Rendering artwork:** pass the column through `signImageUrl(key)` (`sign.ts`; accepts `null`,
returns `null`, 1 h TTL) in a server component or action and put the result on an `<img src>`.
That is the intended path and it has no caller yet: `src/app/(app)/albums/[id]/page.tsx` keeps
`Art` (GlitchArt) and `ArtPlaceholder` ready in `album-page.styles.ts` but doesn't render them,
because an unsigned key would show a blank square. An `<img>` load is not a CORS request, so
artwork does not depend on the bucket CORS policy below.

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

**Replace flow (admin edit page):** `createUploadUrls` → browser `putFile` → `headObject` → `replace_track_audio` RPC, which points the track at the new key and queues the old key as `replaced`. A retry after a failed action re-uploads a fresh object and orphans the first (accepted).

Queue rows are **candidates, not a delete list**: album and track art can share one key, so the future job must re-check that no live row references the key. Replacing an MP3 changes nothing for downloads already made, and the download count stays on the same track id. Edits never rewrite ID3 tags (D5); the edit page tells users to replace the MP3 with a re-tagged file instead.

**Nothing deletes from R2 now.** The future cleanup job may delete a key only when it was queued
30+ days ago **and** no live row still references it (album/track art can be shared), then sets
`cleaned_at`. It never runs against the locked prod bucket without the lock being deliberately
lifted. Full rules: [[content-lifecycle]] `References/r2-cleanup-queue.md`.

## Peaks files

`peaks/<id>.bin` is a track's stored loudness, used by the player's waveform and particles
([[timeline-player]]). It is **derived from `tracks.audio_url`, never stored**: `peaksKeyFor`
(`src/lib/peaks/format.ts`) maps `tracks/<id>.mp3` to `peaks/<id>.bin` and returns `null` for
any other key shape. No DB column, no migration.

- Format: one byte per 20 ms (`PEAKS_PER_SECOND = 50`), the RMS loudness of the mono mix,
  0–255. Content-Type `application/octet-stream` (`PEAKS_CONTENT_TYPE`; the presigned PUT signs
  it, so the browser must send exactly that).
- Written best-effort by the admin browser (decode with `OfflineAudioContext`, `storePeaks`)
  right after each MP3 PUT at publish / add-track / replace-audio, and by **Analyze all** on
  `/admin/releases/[id]`, which overwrites in place. A missing file just means idle dots.
- Replacing a track's MP3 mints a new id, so old peaks never apply to new audio. The old
  `peaks/<oldid>.bin` is orphaned like the old MP3.
- **Never deleted.** Writes are PUT/overwrite only; the prod token cannot delete, and the
  cleanup queue does not list peaks files.
- Signing: `getTrackPeaksUrl` (listener GET, `signStreamUrl` TTL), `getPeaksJob` (admin: GET the
  MP3 + PUT the peaks), `createUploadUrls` (returns `peaksUrl` per target); see `signing.md`.

## CORS

Browser paths that hit the R2 endpoint cross-origin and need the bucket to answer with
`Access-Control-Allow-Origin`:

- **Peaks and MP3 reads (`GET`/`HEAD`).** The player `fetch`es `peaks/<id>.bin` through a
  presigned URL (`usePeaks`), and the admin Analyze all `fetch`es the MP3 to decode it. If the
  bucket doesn't allow `GET` from the page's origin, those fetches fail: the waveform stays on
  idle dots / Analyze all fails. **Touch playback is not affected**: there the `<audio>` element
  has no `crossOrigin`, so its media request is not CORS mode and plays even where the same
  URL would be refused to `fetch`. On desktop the element is `crossOrigin="anonymous"` (live
  analyser), so the same `GET` rule is required for it to play. `HEAD` stays allowed alongside
  `GET`.
- **Browser uploads (`PUT`).** `/admin/upload` and the admin edit page PUT MP3s and peaks files with a
  `Content-Type` header → preflight → the bucket must allow `PUT` and the `content-type` header
  ([[admin-upload]] `References/upload-flow.md`).

**Not CORS:** `<audio>` playback, downloads (`window.location.assign` to the signed URL, a navigation) and artwork
via `<img src>`. None of them breaks if the policy is wrong; only the peaks/MP3 fetches and uploads do.

### The policy, per bucket

Source of truth: `infra/r2/cors.local.json`, `cors.dev.json`, `cors.prod.json`, with the applied
status recorded in `infra/r2/README.md`. All three allow `["GET", "HEAD", "PUT"]`,
`AllowedHeaders: ["content-type"]`, `MaxAgeSeconds: 3600`, and **only that environment's site
origin(s)** — scheme, host and port must match the page exactly, no trailing slash. The dev bucket's
policy (`cors.dev.json`) is:

```json
[
  {
    "AllowedOrigins": ["https://humanservices-dev.vercel.app"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Local is the same shape with `["http://localhost:3000", "http://127.0.0.1:3000"]`; prod with
`["https://services.humanrecords.co", "https://humanservices.vercel.app"]`. Feature-branch preview
deployments are turned off (`vercel.json`), so no other origins exist.

### Applying it (dashboard only, no CLI)

1. Cloudflare dashboard → **R2** → the bucket (`humanrecords-media-local` / `-dev` / `-prod`) →
   **Settings** → **CORS Policy** → Edit → paste the whole contents of the matching
   `infra/r2/cors.<env>.json` → Save.
2. Update the status row in `infra/r2/README.md` (date + what's allowed) and commit it.
3. Hard-reload the site (the preflight is cached for `MaxAgeSeconds`).

No `aws`/`wrangler`/`rclone` command is used for this; the JSON files are the record, the
dashboard is the mechanism.

**Order relative to deploys:** the CORS policy must be in place **before** code that depends on it
(e.g. a new fetch of an R2 URL from the browser) reaches that environment — otherwise the deploy ships
a feature that can't load. Infra first, then merge/deploy. (The stored-peaks change needed no CORS change: `GET`/`HEAD`/`PUT` with `content-type` were already allowed.) Status: applied to all three buckets on
2026-10-11 with GET/HEAD/PUT (the earlier PUT-only policy from 2026-10-06/09 was replaced). Re-paste
after any origin change ([[release-ops]] `References/domain-cutover.md`).

### Why not proxy audio through a Next route instead?

Rejected. A same-origin `/api/tracks/[id]/stream` route (added in `4beeed1`, removed on
`feat/playback-vector-icons`) would sidestep bucket CORS, but:

- every audio byte would stream through a Vercel function — **metered bandwidth** where R2
  egress is free, which is the whole reason the design is presigned URLs;
- function **duration limits** and long-lived range requests (seeking, locked-phone playback)
  make a proxied stream fragile;
- the presigned URL would be minted only to be consumed server-side — a wasted sign and an extra
  hop on every track start, including the pre-signed "next track" path the player relies on for
  gapless advance.

Audio goes R2 → browser directly. Fix the bucket policy, not the transport.

### Symptoms

| Symptom | Meaning |
|---|---|
| Waveform stays idle after a CORS edit; console shows a CORS error on the `peaks/…` URL; audio still plays | `GET` (or the origin) missing from that bucket's policy. Re-paste from `infra/r2/cors.<env>.json`, hard-reload. |
| Works locally, not on develop/prod | Each environment is its own bucket with its own policy; check the hosted bucket's CORS Policy in the dashboard against `cors.dev.json`/`cors.prod.json`, then that deployment's `R2_BUCKET_NAME`. |
| Waveform flat, audio audible | No `peaks/<id>.bin` for that track: run Analyze all on its release page. If it exists, see the CORS row above. |
| Upload (or a peaks PUT) fails at the PUT step with a CORS error | `PUT` or `content-type` missing from the policy. A failed peaks PUT does not fail publish; it only leaves idle dots. |
| 403 `SignatureDoesNotMatch` | Not CORS: see `signing.md` (wrong Content-Type on PUT, altered URL, mismatched key pair). |
