# Reference: Object keys, buckets, and CORS

## Which columns hold keys

| Column | Status |
|---|---|
| `tracks.audio_url` | Required. Every track has one. |
| `tracks.track_art_url` | Nullable; null in practice (no image upload yet; test fixtures set `art/<tag>-<n>.jpg`). |
| `albums.album_art_url` | Nullable; null in practice. Selected by `getAlbum`/`getFeed` as `albumArtUrl`, but the album page hides its artwork block until image upload ships. |
| `artists.profile_photo_url` | Nullable; null in practice. |

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

## CORS

Two browser paths hit the R2 endpoint cross-origin and need the bucket to answer with
`Access-Control-Allow-Origin`:

- **Playback (`GET`/`HEAD`).** The app's single `<audio>` element has `crossOrigin="anonymous"`
  (`PlayerProvider.tsx`) and is pointed straight at the presigned stream URL. CORS mode is what
  lets Web Audio (`audioMeter.ts`) read the decoded signal for the waveform and particles. The
  flip side: if the bucket doesn't allow `GET` from the page's origin, the browser gets no
  `Access-Control-Allow-Origin` and **refuses the media entirely** — no sound, `error` event,
  player error state — even though the same URL plays when opened in a new tab (a top-level
  navigation is not a CORS request). `HEAD` is allowed alongside `GET` so range/metadata probes
  behave the same way.
- **Browser uploads (`PUT`).** `/admin/upload` and the admin edit page PUT files with a
  `Content-Type` header → preflight → the bucket must allow `PUT` and the `content-type` header
  ([[admin-upload]] `References/upload-flow.md`).

**Not CORS:** downloads (`window.location.assign` to the signed URL, a navigation) and artwork
via `<img src>`. Neither breaks if the policy is wrong; only playback and uploads do.

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
(e.g. the `crossOrigin="anonymous"` change) reaches that environment — otherwise the deploy ships
a player that can't play. Infra first, then merge/deploy. Status: applied to all three buckets on
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
| Nothing plays after a CORS edit; console shows a CORS / `MediaError` on the R2 URL; URL works in a new tab | `GET` (or the origin) missing from that bucket's policy. Re-paste from `infra/r2/cors.<env>.json`, hard-reload. |
| Plays locally, not on develop/prod | Each environment is its own bucket with its own policy; check the hosted bucket's CORS Policy in the dashboard against `cors.dev.json`/`cors.prod.json`, then that deployment's `R2_BUCKET_NAME`. |
| Waveform flat, audio audible | Not CORS: `crossOrigin` not `"anonymous"` on the element, or `AudioContext` suspended (needs a user gesture; see `enable()` in `audioMeter.ts`). |
| Upload fails at the PUT step with a CORS error | `PUT` or `content-type` missing from the policy. |
| 403 `SignatureDoesNotMatch` | Not CORS: see `signing.md` (wrong Content-Type on PUT, altered URL, mismatched key pair). |
