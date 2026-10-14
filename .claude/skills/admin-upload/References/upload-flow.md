# Reference: The publish / upload flow

Files: `src/components/Upload/upload-engine.ts` (browser), `src/lib/admin/actions.ts`
(server), `src/lib/storage/sign.ts` (R2), `src/lib/admin/rules.ts` (limits), `src/lib/peaks/{compute,format}.ts`
(waveform), `src/lib/admin/peaks-actions.ts` and `src/components/AdminReleases/AnalyzeWaveforms.tsx`
(re-analyze).

## Sequence (`runPublish(state, deps)`)

1. `state.publishing` → return (double-click guard; `UploadForm` also holds an `inFlight`
   ref because React state isn't fresh between two quick clicks).
2. `validate(state)` has errors → dispatch `showErrors`, return. Nothing leaves the browser.
3. dispatch `publishStarted`.
4. Collect keys from tracks whose `upload.status === "done"` (a previous attempt). Every
   other track needs uploading.
5. If any: `createUploadUrls([{clientId, name, size}])`. Server: role check; 1–50 files;
   each passes `audioFileError`; mints `tracks/<randomUUID>.mp3` and a presigned PUT per
   file, plus a `peaksUrl` (presigned PUT for `peaks/<same uuid>.bin`, signed with
   `application/octet-stream`) on each target (`UploadTarget`). Client checks the returned targets are exactly the requested `clientId`s.
6. `runPool(targets, 2, …)`: for each target, `uploadStarted` → `putFile` (XHR PUT with
   `Content-Type: audio/mpeg`, progress → `uploadProgress`) → `uploadDone(key)`. On a PUT
   failure: `uploadFailed("Upload failed.")`, no new uploads start, in-flight ones finish.
   **After a successful MP3 PUT**, `deps.storePeaks(file, target.peaksUrl)` decodes the file in
   the browser (`computePeaks`, `OfflineAudioContext`) and PUTs the 50-bytes-per-second loudness
   file. It is best-effort and never throws: a failure is ignored (`uploadDone` still fires,
   publish still succeeds) and the track just shows idle dots in the player until Analyze all.
7. `publishRelease(buildPayload(state, keys))`. Server: role check; runtime shape check;
   ≤ 50 tracks; every `audioKey` a string matching `AUDIO_KEY_RE`, no duplicates; `HEAD`
   each key (missing or size ≤ 0 → "didn't finish uploading"; > 50 MB → rejected);
   `rpc("publish_release")`; `revalidatePath("/feed")`; `redirect("/feed")`.

## Peaks (stored waveform)

The player's waveform and button particles read `peaks/<id>.bin` ([[media-storage]]
`References/object-keys.md#peaks-files`). Three paths write it, all from the admin browser, all
best-effort, all using the same `storePeaks`:

- `runPublish` (new releases), after each MP3 PUT.
- `uploadOne` (`src/components/AdminReleases/upload-one.ts`, used by `ReplaceAudio` and
  `AddTrackForm`), after the MP3 PUT; a peaks failure never fails add-track / replace-audio.
- **Analyze all** on `/admin/releases/[id]` (`AnalyzeWaveforms`), for tracks with no peaks
  (everything uploaded before this feature) or to redo them. `getPeaksStatus(trackIds)` HEADs each
  live track's peaks key; per track, sequentially, `getPeaksJob(trackId)` returns a signed
  MP3 GET (`audioUrl`) and a signed peaks PUT (`peaksUrl`), minted per track so the 15-minute
  PUT can't expire mid-run. The browser fetches the MP3, `storePeaks` it, and the row flips to
  "analyzed". Re-running overwrites in place. Late status responses are ignored and the run stops
  after unmount. Both actions check `label_member` first (server actions are callable directly).

The peaks key is derived from the audio key, never stored: no DB column, no migration, and
`publishRelease` does not HEAD or require it. Prod rule: PUT/overwrite only, never delete.

## Key format and why it's checked

`tracks/<uuid v4>.mp3`, minted only by `createUploadUrls`. `AUDIO_KEY_RE` in
`rules.ts` makes `publishRelease` refuse any other key, so a crafted payload can't point a
track at an arbitrary bucket object. (It checks *shape* only; keys aren't recorded when
minted. The DB function doesn't check key shape — a label member calling the RPC directly
could bypass it.)

## Presigned PUT

A presigned URL is a normal R2 (S3-compatible) URL with a signature in the query string,
computed server-side with the R2 secret. Whoever holds it can do exactly that one
operation on that one key until it expires — no credentials in the browser.
`signUploadUrl(key, contentType)`: method `PUT`, `X-Amz-Expires=900` (15 min),
`aws: { signQuery: true, allHeaders: true }` with `Content-Type` in the headers.
`allHeaders` is needed because aws4fetch doesn't sign `Content-Type` by default; with it
signed, the browser **must** send exactly `audio/mpeg` or R2 answers
`SignatureDoesNotMatch`. `putFile` always sends `AUDIO_CONTENT_TYPE` (not `File.type`,
which varies by OS). The peaks PUT is signed with `PEAKS_CONTENT_TYPE`
(`application/octet-stream`) and `storePeaks` sends exactly that.

## HEAD verification

`headObject(key)` → `{ size }` from `content-length`, `null` on 404, throws on other
statuses (the action turns a throw into "Couldn't verify the uploaded files. Try again.").
HEADs run sequentially. aws4fetch retries 5xx/429 with backoff by default, so an R2 outage
can make publish slow before it fails.

## Retry semantics

- Upload failure: successful siblings keep `status:"done"` + key; Publish again uploads only
  the rest (fresh keys/URLs for them).
- DB failure: every track is `done`, so Publish again skips uploads and re-sends the same
  keys; the HEADs pass and the RPC runs again.
- Replacing a file resets that track's upload to idle (it re-uploads under a new key; the
  old object is orphaned).

## Failure matrix

| Failure | User sees | DB | R2 |
|---|---|---|---|
| Client validation | field errors | nothing | nothing |
| `createUploadUrls` error (role, bad file, signing) | banner with the error | nothing | nothing |
| `createUploadUrls` / `publishRelease` rejects (network, server crash) | "Couldn't reach the server. Publish again to retry." | nothing | maybe objects |
| Returned targets don't match | "Couldn't prepare the upload." | nothing | nothing |
| A peaks PUT or its decode fails | nothing (best-effort); the track shows idle dots in the player; run Analyze all later | nothing | MP3 stays, no peaks file |
| A PUT fails (CORS, signature, offline, 4xx/5xx) | red progress + "Upload failed." on that track; banner "Some files didn't upload. Publish again to retry." | nothing | uploaded siblings stay |
| Bad/duplicate key, > 50 tracks, malformed payload | "Invalid audio file reference." / "Too many tracks." / "Invalid release." | nothing | objects stay |
| HEAD missing / zero / too big / throws | see HEAD section | nothing | objects stay |
| `publish_release` raises | 42501 / 22023 text / generic (see releases-model.md) | rolled back | objects stay (orphans) |
| Success | redirect to `/feed` | release written | objects referenced |

A thrown `NEXT_REDIRECT` (from `redirect()`) is rethrown by `failUnreachable` so the
navigation isn't mistaken for a failure.

## R2 CORS rule

The browser PUTs cross-origin to the R2 endpoint, so every bucket needs a CORS rule or every
upload fails at the PUT step (the preflight is rejected). One rule per bucket, pasted by the user
into Cloudflare -> R2 -> bucket -> Settings -> CORS policy. The source of truth is
`infra/r2/cors.{local,dev,prod}.json` (`GET`, `HEAD`, `PUT` with `content-type`). Uploads (MP3 and
peaks) need `PUT` with `content-type`; `GET` is needed by Analyze all (it `fetch`es the MP3 in the
admin browser) and by the player's peaks `fetch` (see [[media-storage]]). The desktop `<audio>`
element uses `crossOrigin="anonymous"` (live analyser) and so needs the same `GET` rule; the touch
element is plain and needs no CORS. Downloads (navigation) and artwork
(`<img>`) don't need CORS — see `infra/r2/README.md`. The stored-peaks work changed no CORS rule.

Status: applied to all three buckets 2026-10-06 (prod updated 2026-10-09; `GET`/`HEAD` added to
all three 2026-10-11); the exact rules live in
`infra/r2/cors.*.json` (local: localhost + 127.0.0.1; dev: `https://humanservices-dev.vercel.app`;
prod: `https://services.humanrecords.co` + `https://humanservices.vercel.app`). Re-paste after a domain change
([[release-ops]] `References/domain-cutover.md`).

Feature-branch preview deployments are turned off (`vercel.json`), so no other origins exist.
