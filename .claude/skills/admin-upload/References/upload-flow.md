# Reference: The publish / upload flow

Files: `src/components/Upload/upload-engine.ts` (browser), `src/lib/admin/actions.ts`
(server), `src/lib/storage/sign.ts` (R2), `src/lib/admin/rules.ts` (limits).

## Sequence (`runPublish(state, deps)`)

1. `state.publishing` → return (double-click guard; `UploadForm` also holds an `inFlight`
   ref because React state isn't fresh between two quick clicks).
2. `validate(state)` has errors → dispatch `showErrors`, return. Nothing leaves the browser.
3. dispatch `publishStarted`.
4. Collect keys from tracks whose `upload.status === "done"` (a previous attempt). Every
   other track needs uploading.
5. If any: `createUploadUrls([{clientId, name, size}])`. Server: role check; 1–50 files;
   each passes `audioFileError`; mints `tracks/<randomUUID>.mp3` and a presigned PUT per
   file. Client checks the returned targets are exactly the requested `clientId`s.
6. `runPool(targets, 2, …)`: for each target, `uploadStarted` → `putFile` (XHR PUT with
   `Content-Type: audio/mpeg`, progress → `uploadProgress`) → `uploadDone(key)`. On a PUT
   failure: `uploadFailed("Upload failed.")`, no new uploads start, in-flight ones finish.
7. `publishRelease(buildPayload(state, keys))`. Server: role check; runtime shape check;
   ≤ 50 tracks; every `audioKey` a string matching `AUDIO_KEY_RE`, no duplicates; `HEAD`
   each key (missing or size ≤ 0 → "didn't finish uploading"; > 50 MB → rejected);
   `rpc("publish_release")`; `revalidatePath("/feed")`; `redirect("/feed")`.

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
which varies by OS).

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
into Cloudflare -> R2 -> bucket -> Settings -> CORS policy:

```json
[
  {
    "AllowedOrigins": ["<origin(s) for this environment>"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Origins: local = `http://localhost:3000` (and `http://127.0.0.1:3000`); dev = the develop domain;
prod = the prod domain. The files will be committed as `infra/r2/cors.{local,dev,prod}.json`
during setup (Task B2, pending); until then this JSON is the reference.

Status: applied to all three buckets 2026-10-06; the exact rules live in `infra/r2/cors.*.json`
(local: localhost + 127.0.0.1; dev: `https://humanservices-dev.vercel.app`; prod:
`https://humanservices.vercel.app`). Re-paste after a domain change
([[release-ops]] `References/domain-cutover.md`).

Feature-branch preview deployments are turned off (`vercel.json`), so no other origins exist.
