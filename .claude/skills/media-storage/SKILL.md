---
name: media-storage
description: Use when working with audio or image files in Cloudflare R2 — signing stream, download, image, or upload URLs (`src/lib/storage/sign.ts`), the `getTrackStreamUrl` / `getTrackDownloadUrl` server actions (`src/lib/storage/actions.ts`), R2 env config (`config.ts`, `R2_*` vars), `headObject`, recording downloads with the service-role client, the download filename (`filename.ts`: `downloadFilename`, `extFromKey`, `Content-Disposition`/`filename*`), object-key conventions for `audio_url` / `*_art_url`, `r2_cleanup_queue`, or R2 CORS (`infra/r2/cors.*.json`, GET/HEAD/PUT per bucket — the `<audio>` element loads with `crossOrigin="anonymous"` so Web Audio can read the signal). Also when playback fails with a CORS error, the waveform is flat while audio plays, a link returns 403/SignatureDoesNotMatch, a signed URL expires mid-track, a download has the wrong name or altered bytes/ID3 tags, "Missing R2 env vars" is thrown, or someone proposes proxying audio through an API route.
---

# Media Storage (Cloudflare R2)

All audio (and, later, artwork) lives in a **private** Cloudflare R2 bucket. Nothing in the
bucket is public. The server hands the browser short-lived **presigned URLs**, signed with
SigV4 by `aws4fetch`, for exactly one operation on one object. Three media buckets, one
bucket-scoped token each, chosen by `R2_BUCKET_NAME`: `humanrecords-media-local` (local),
`humanrecords-media-dev` (develop), `humanrecords-media-prod` (production). A fourth bucket,
`humanrecords-backups`, holds DB backups and is never touched by app code
([[release-ops]] `References/backups-and-restore.md`).

**Prod bucket is locked indefinitely (R2 bucket lock): prod code never deletes R2 objects.**
Upload keys are fresh UUIDs so overwrite is never needed. Releases and tracks are soft-deleted
(`archived_at`) — any edit/delete feature must honor that, and keys that may become deletable
are recorded in `r2_cleanup_queue` ([[content-lifecycle]]); nothing deletes from R2 now. Hard removal (e.g. a takedown) means
deliberately lifting the lock in the Cloudflare dashboard.

## The one thing to understand first

**The browser only ever sends a track id; the server looks up the object key and signs it.**
Catalog columns (`tracks.audio_url`, `*_art_url`) store R2 **object keys**, not URLs. A
server action checks the session, reads the key through the user's RLS-scoped Supabase client,
then signs it. The R2 secret is read only in `server-only` modules (`config.ts`, `sign.ts`);
importing either from a client component is a build error. Actions always return
`{ url, error }` — they never throw to the client.

**Downloads serve the original R2 bytes. Never transcode/re-encode;** artists tag MP3s (320 kbps /
44.1 kHz, ID3 incl. art) before upload and DJs rely on them. Only the saved filename changes.
Verified byte-identical (SHA-256) on 2026-10-10 through `signUploadUrl` then `signDownloadUrl`.

## Audio goes R2 → browser directly, in CORS mode

The signed stream URL is set straight on the app's single `<audio>` element
(`PlayerProvider.tsx`), which has `crossOrigin="anonymous"`. That attribute is what lets Web
Audio (`audioMeter.ts`: one `AudioContext` + `AnalyserNode` on a `MediaElementAudioSourceNode`)
read the signal for the player waveform (`PixelWaveform`) and the button particles
(`PlaybackButton`). Without it the media is "tainted" and the analyser reads silence.

Consequence: **playback itself now depends on the bucket's CORS policy.** A CORS-mode media
request needs `Access-Control-Allow-Origin` on the response; a bucket that doesn't allow `GET`
from the site origin returns none, and the browser refuses the media entirely (`error` event →
player error state), even though the same signed URL opens fine in a new tab. Downloads
(top-level navigation to the signed URL) and `<img>` artwork are not CORS requests and don't need
it. Each bucket therefore allows `GET`, `HEAD`, `PUT` from exactly its own site origin —
policy JSON, paste location, and rollout order in [object-keys.md](References/object-keys.md#cors).

**There is no server-side audio proxy, and don't add one.** A same-origin `/api/tracks/[id]/stream`
route (commit `4beeed1`) was tried and removed on `feat/playback-vector-icons`: it would have made
R2 CORS irrelevant, but every byte of audio would then flow through a Vercel function — metered
bandwidth instead of R2's free egress, function duration limits on long tracks and range
requests, and a presigned URL minted only to be consumed server-side. Bucket CORS is the
intended fix; the R2 free egress is the reason the architecture is presigned URLs at all.

## Pieces

| Concern | Where |
|---|---|
| R2 env validation (read per call) | `src/lib/storage/config.ts` (`getR2Config`) |
| Signers + TTLs + HEAD | `src/lib/storage/sign.ts` (`signStreamUrl`, `signDownloadUrl`, `signImageUrl`, `signUploadUrl`, `headObject`) |
| Session-gated server actions | `src/lib/storage/actions.ts` (`getTrackStreamUrl`, `getTrackDownloadUrl`) |
| Download filename (pure) | `src/lib/storage/filename.ts` (`downloadFilename`, `extFromKey`) |
| Download button (client) | `src/components/Downloads/DownloadButton.tsx` (calls `getTrackDownloadUrl`) |
| The `<audio>` element (`crossOrigin="anonymous"`) + Web Audio analyser | `src/components/Player/PlayerProvider.tsx`, `src/components/Player/audioMeter.ts` ([[timeline-player]]) |
| Service-role client (download recording) | `src/lib/supabase/service.ts` |
| Upload-side actions (presigned PUT + HEAD) | `src/lib/admin/actions.ts`; replace/add-track in `src/lib/admin/release-actions.ts` ([[admin-upload]]) |
| Seed local bucket from `supabase/seed-media/` (refuses a `-dev`/`-prod` bucket) | `yarn r2:seed-local` → `scripts/r2-seed-local.mts` |
| CORS policy per bucket (GET/HEAD/PUT, exact origins) | `infra/r2/cors.{local,dev,prod}.json` + status table in `infra/r2/README.md`; applied by pasting into the Cloudflare dashboard, no CLI |
| Env template | `.env.example` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`) |
| Keys that may be deletable later | `r2_cleanup_queue` table (service-role only; see [[content-lifecycle]]) |
| Tests | `src/lib/storage/{config,sign,actions,filename}.test.ts`; `PlayerProvider.test.tsx` asserts `crossOrigin` |

## References

- [signing.md](References/signing.md) — how `aws4fetch` presigns, each signer and its TTL,
  the RFC 6266 download filename and how `downloadFilename` builds the name, the PUT Content-Type rule, `headObject`, and config.
- [server-actions.md](References/server-actions.md) — `getTrackStreamUrl` /
  `getTrackDownloadUrl` step by step (both refuse archived tracks), the `{ url, error }` contract, download recording, and
  how to add a new signed-URL action.
- [object-keys.md](References/object-keys.md) — key conventions (seed keys vs.
  `tracks/<uuid>.mp3`), which columns hold keys, artwork status (`signImageUrl`, hidden in the UI), orphans and `r2_cleanup_queue`,
  the CORS policy per bucket (exact JSON, where to paste, rollout order), and the rejected proxy route.

## Troubleshooting

| Symptom | Cause / first check |
|---|---|
| Media error / nothing plays after a CORS edit (status `error` right after load; the signed URL opens fine in a new tab) | The bucket's CORS policy no longer allows `GET` (and `HEAD`) from the site origin, or the origin is wrong (scheme, host, or port must match exactly — no trailing slash). The `<audio>` element requests in CORS mode, so a missing `Access-Control-Allow-Origin` is fatal. Compare the live policy with `infra/r2/cors.<env>.json`, re-paste, hard-reload (`MaxAgeSeconds: 3600` caches the preflight). |
| Track plays locally but not on develop/prod after a deploy | Same check, for that environment's bucket: Cloudflare → R2 → `humanrecords-media-dev`/`-prod` → Settings → CORS Policy must match `cors.dev.json`/`cors.prod.json` (the dev policy allows only `https://humanservices-dev.vercel.app`). Then confirm that deployment's `R2_BUCKET_NAME` points at that bucket. |
| Waveform flat / particles still, but audio plays | Web Audio isn't reading the signal: `crossOrigin="anonymous"` missing from the `<audio>` element (`enable()` in `audioMeter.ts` bails if it isn't exactly `"anonymous"`), or the `AudioContext` is still `suspended` because `enable()` wasn't called from a user gesture (`playQueue`/`play` call it; `readLevel`/`readWaveform` return 0/`null` unless `context.state === "running"`). |
| 403 `SignatureDoesNotMatch` | For uploads: the browser sent a different `Content-Type` than the one signed (see signing.md). For GETs: the URL was altered after signing (any query param is covered), the `R2_*` key pair doesn't match the bucket, or the clock is far off. Re-mint; never hand-edit a signed URL. |
| 403 with `Request has expired` / playback dies mid-track | Stream TTL is 2 h and the player re-signs anything older than 1 h; a page left open longer plays until the next track load. Downloads expire in 5 min — never pre-fetch them. |
| 404 from the signed URL | Signing never checks the object exists. The key isn't in `R2_BUCKET_NAME` (local seed objects live only in `-local`; run `yarn r2:seed-local`). |
| `Missing R2 env vars: …` | `getR2Config()` names each missing var; set them for that environment (Vercel env for hosted). |
| Upload fails at the PUT step with a CORS error | Bucket policy lacks `PUT` or `content-type` in `AllowedHeaders` ([[admin-upload]] `References/upload-flow.md`). |

## Depends on

- [[catalog-schema]] — reads `tracks.audio_url` / `title` under RLS; writes `downloads`
  via the service-role client.
- [[auth]] — every action starts with `getSessionUser()`; `claims.sub` is the user id.

- [[content-lifecycle]] — decides which keys are queued for cleanup and when they may be deleted.

Used by: [[timeline-player]] (player calls `getTrackStreamUrl`; owns the `<audio>` element and
Web Audio meter), [[admin-upload]] (`signUploadUrl`, `headObject`).

## Known deferrals (as of 2026-10-11)

- `signImageUrl` is built and tested but has no caller yet. It is the intended way to render
  `*_art_url` keys; the album page hides its artwork block until image upload ships (comment in
  `src/app/(app)/albums/[id]/page.tsx`). Downloads are wired: `DownloadButton` on feed and album track rows ([[timeline-player]]).
- No artwork upload; art columns are null in practice (fixtures may set keys), so image signing is unused.
- Orphaned objects (failed uploads, retried add/replace) are not cleaned up. `r2_cleanup_queue` records archived and replaced keys; the job that reads it is not built ([[content-lifecycle]]).
- CORS is applied to all three buckets (2026-10-11, GET/HEAD/PUT). It must be re-pasted after any
  origin change (domain cut-over, new preview host) and **before** a code change that depends on
  it deploys to that environment.
- Orphan cleanup must never delete from the prod bucket (lock + soft-delete rule above); the future job runs only where deletion is allowed.

A code guide is in `Walkthrough/walkthrough.md` (gitignored).
