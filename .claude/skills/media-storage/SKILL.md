---
name: media-storage
description: Use when working with audio or image files in Cloudflare R2 — signing stream, download, image, or upload URLs (`src/lib/storage/sign.ts`), the `getTrackStreamUrl` / `getTrackDownloadUrl` server actions (`src/lib/storage/actions.ts`), R2 env config (`src/lib/storage/config.ts`, `R2_*` vars), `headObject`, recording downloads with the service-role client, object-key conventions for `audio_url` / `*_art_url`, `r2_cleanup_queue` (which keys may be deleted later), or R2 CORS. Also when playback or a download link returns 403/SignatureDoesNotMatch, a signed URL expires mid-track, or "Missing R2 env vars" is thrown.
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

## Pieces

| Concern | Where |
|---|---|
| R2 env validation (read per call) | `src/lib/storage/config.ts` (`getR2Config`) |
| Signers + TTLs + HEAD | `src/lib/storage/sign.ts` (`signStreamUrl`, `signDownloadUrl`, `signImageUrl`, `signUploadUrl`, `headObject`) |
| Session-gated server actions | `src/lib/storage/actions.ts` (`getTrackStreamUrl`, `getTrackDownloadUrl`) |
| Service-role client (download recording) | `src/lib/supabase/service.ts` |
| Upload-side actions (presigned PUT + HEAD) | `src/lib/admin/actions.ts` ([[admin-upload]]) |
| Seed local bucket from `supabase/seed-media/` (refuses a `-dev`/`-prod` bucket) | `yarn r2:seed-local` → `scripts/r2-seed-local.mts` |
| CORS rule per bucket | `infra/r2/cors.{local,dev,prod}.json` (to be committed during setup, Task B2 pending; user pastes into Cloudflare) |
| Env template | `.env.example` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`) |
| Keys that may be deletable later | `r2_cleanup_queue` table (service-role only; see [[content-lifecycle]]) |
| Tests | `src/lib/storage/{config,sign,actions}.test.ts` |

## References

- [signing.md](References/signing.md) — how `aws4fetch` presigns, each signer and its TTL,
  the RFC 6266 download filename, the PUT Content-Type rule, `headObject`, and config.
- [server-actions.md](References/server-actions.md) — `getTrackStreamUrl` /
  `getTrackDownloadUrl` step by step (both refuse archived tracks), the `{ url, error }` contract, download recording, and
  how to add a new signed-URL action.
- [object-keys.md](References/object-keys.md) — key conventions (seed keys vs.
  `tracks/<uuid>.mp3`), which columns hold keys, artwork status, orphans and `r2_cleanup_queue`, and CORS.

## Depends on

- [[catalog-schema]] — reads `tracks.audio_url` / `title` under RLS; writes `downloads`
  via the service-role client.
- [[auth]] — every action starts with `getSessionUser()`; `claims.sub` is the user id.

- [[content-lifecycle]] — decides which keys are queued for cleanup and when they may be deleted.

Used by: [[timeline-player]] (player calls `getTrackStreamUrl`), [[admin-upload]]
(`signUploadUrl`, `headObject`).

## Known deferrals (as of 2026-10-10)

- `getTrackDownloadUrl` and `signImageUrl` are built and tested but **not wired to any UI** yet.
- No artwork upload; art columns are null, so image signing is unused.
- Orphaned objects (failed/replaced uploads) are not cleaned up. `r2_cleanup_queue` records archived and replaced keys; the job that reads it is not built ([[content-lifecycle]]).
- R2 CORS rule must be applied per bucket before browser uploads work (see
  [object-keys.md](References/object-keys.md); files to be committed in `infra/r2/` during setup, Task B2 pending).
- Orphan cleanup must never delete from the prod bucket (lock + soft-delete rule above); the future job runs only where deletion is allowed.

A code guide is in `Walkthrough/walkthrough.md` (gitignored).
