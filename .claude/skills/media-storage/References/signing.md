# Reference: Signing (`src/lib/storage/sign.ts`, `config.ts`)

Both files start with `import "server-only"`. Never import them from a `'use client'` module;
call a server action instead.

## Config

`getR2Config()` reads `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`, `R2_ENDPOINT` **at call time** (not module load, so serverless picks up
per-invocation env) and throws `Missing R2 env vars: <names>` listing every missing one.
`R2_ENDPOINT` is the account endpoint, e.g. `https://<account>.r2.cloudflarestorage.com`.
None are `NEXT_PUBLIC_`.

## How a presigned URL is built

```ts
const aws = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
const url = new URL(`${endpoint}/${bucket}/${key}`);       // path-style
url.searchParams.set("X-Amz-Expires", String(ttl));
const signed = await aws.sign(url.toString(), { method, aws: { signQuery: true } });
return signed.url;                                          // signature in the query string
```

`signQuery: true` puts the SigV4 signature in the URL (`X-Amz-Signature`, `X-Amz-Credential`,
…) so the browser can use it as a plain `src`/`href`. Any query param added **before** signing
(`X-Amz-Expires`, `response-content-disposition`) is covered by the signature — the holder
can't alter it. `region: "auto"` is R2's region.

## Signers

| Function | Method | TTL constant | Value | Why that TTL |
|---|---|---|---|---|
| `signStreamUrl(key)` | GET | `STREAM_TTL_SECONDS` | 7200 (2h) | Must outlast the longest track so seeking (new range requests) keeps working. |
| `signDownloadUrl(key, filename)` | GET | `DOWNLOAD_TTL_SECONDS` | 300 (5m) | One-shot grab. |
| `signImageUrl(key \| null)` | GET | `IMAGE_TTL_SECONDS` | 3600 (1h) | Outlasts a page session. Returns `null` for a null key (art columns are nullable). |
| `signUploadUrl(key, contentType)` | PUT | `UPLOAD_TTL_SECONDS` | 900 (15m) | Enough for a 50 MB file on a slow link. Also signs the `peaks/<id>.bin` PUT (`PEAKS_CONTENT_TYPE`, `application/octet-stream`). |

`getTrackPeaksUrl` (storage actions) signs `peaks/<id>.bin` with `signStreamUrl`; `getPeaksJob`
(`src/lib/admin/peaks-actions.ts`, label members only) mints a fresh `signStreamUrl(audio_url)`
GET plus `signUploadUrl(peaksKey, PEAKS_CONTENT_TYPE)` PUT per track so the 15-minute PUT can't
expire mid-run; `createUploadUrls` returns a `peaksUrl` beside each MP3 `url`. As with any
signed PUT, the browser must send exactly the signed `Content-Type`.

All GET signers share the private `signObjectUrl(key, { expiresIn, downloadFilename? })`.

Signing says nothing about CORS. A stream URL is consumed by an `<audio>`: plain on touch devices (no
`crossOrigin`, needs no CORS), `crossOrigin="anonymous"` on desktop (needs the `GET` rule); a stream-signed `peaks/<id>.bin` URL is consumed by
`fetch`, and the admin MP3 URL by `fetch`, so the **bucket** must answer with
`Access-Control-Allow-Origin` for the site origin (`GET`/`HEAD` in `infra/r2/cors.<env>.json`);
a download URL is consumed by navigation and an image URL by `<img>`, neither of which needs
CORS. A correctly signed URL that opens in a new tab but fails in a `fetch` is a CORS problem,
not a signing one — see [object-keys.md](object-keys.md#cors).

`signImageUrl` is the intended way to render `*_art_url` keys (they are keys, not URLs); it has
no caller yet because the album page hides artwork until image upload ships.

### Download filename (RFC 6266)

`signDownloadUrl` adds `response-content-disposition` so R2 serves the file as an attachment:

```
attachment; filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded>
```

The ASCII fallback strips `"` and `\` (so they can't break out of the quotes) and replaces
non-ASCII with `_`; `filename*` carries the real name (e.g. "Café.mp3"), with `' ( ) *` also
percent-encoded (`encodeURIComponent` leaves them, but RFC 5987 `attr-char` forbids them; strict parsers like Firefox
otherwise fall back to the ASCII name).

The name itself comes from `downloadFilename(artistNames, title, ext)` in
`src/lib/storage/filename.ts` (pure, no `server-only`; tests in `filename.test.ts`):

- Format `A x B - Title.ext`, artists in credited order. No artists → `Title.ext`. Empty title → `track`.
- Base name (before `.ext`) is capped at 150 code points. Over the cap, trailing artists collapse to
  `A x N more - Title`; if even one artist + title won't fit, the title is cut.
- `/ \ :` become `-`; `? * " < > |` and control characters are removed; whitespace collapses;
  trailing dots/spaces are trimmed.
- `extFromKey(key)` takes the lowercase extension of the last path segment (1-5 alnum chars), else `bin`.

Verified 2026-10-10 (local bucket): `Content-Disposition: attachment; filename="Test Artist x Second Artist - ID3 Check.mp3"; filename*=UTF-8''...`,
and the downloaded MP3 was byte-identical to the upload (SHA-256), same bitrate/sample rate, same ID3 tags.

### Upload: Content-Type is signed

`signUploadUrl` passes `headers: { "Content-Type": contentType }` and
`aws: { signQuery: true, allHeaders: true }`. aws4fetch skips `Content-Type` by default;
`allHeaders` includes it in the signature. Consequence: the browser **must** send exactly that
Content-Type (`audio/mpeg`) or R2 returns 403 `SignatureDoesNotMatch`.

### `SignatureDoesNotMatch` in general

R2 recomputes the signature over the method, path, every query param present at signing time,
and (for uploads) the signed headers. So a 403 `SignatureDoesNotMatch` means one of: the PUT sent
a different `Content-Type` than was signed; a signed URL was edited after signing (adding or
re-ordering a query param, re-encoding the key); the `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`
pair belongs to a different bucket token than `R2_BUCKET_NAME`; or the server clock is far off.
Re-mint the URL from the action; never patch one by hand. Browser CORS failures look different
(no status reached the page, `MediaError`/preflight error in the console).

## `headObject(key)`

`aws.fetch(url, { method: "HEAD" })` (a signed request, not a presigned URL). Returns
`{ size }` from `content-length`, `null` on 404, and **throws** on any other non-OK status.
Used by `publishRelease` to verify uploads exist before referencing them. aws4fetch retries
5xx/429 with backoff, so an R2 outage is slow before it fails.

## Adding a signer

Add a TTL constant with a comment saying why that duration, reuse `signObjectUrl` for GETs,
and add a `sign.test.ts` case asserting the path, `X-Amz-Expires`, and any extra params
(tests set fake `R2_*` env in `beforeAll` and inspect the URL — no network).
