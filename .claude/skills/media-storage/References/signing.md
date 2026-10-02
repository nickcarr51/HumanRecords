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
| `signUploadUrl(key, contentType)` | PUT | `UPLOAD_TTL_SECONDS` | 900 (15m) | Enough for a 50 MB file on a slow link. |

All GET signers share the private `signObjectUrl(key, { expiresIn, downloadFilename? })`.

### Download filename (RFC 6266)

`signDownloadUrl` adds `response-content-disposition` so R2 serves the file as an attachment:

```
attachment; filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded>
```

The ASCII fallback strips `"` and `\` (so they can't break out of the quotes) and replaces
non-ASCII with `_`; `filename*` carries the real name (e.g. "Café.mp3").

### Upload: Content-Type is signed

`signUploadUrl` passes `headers: { "Content-Type": contentType }` and
`aws: { signQuery: true, allHeaders: true }`. aws4fetch skips `Content-Type` by default;
`allHeaders` includes it in the signature. Consequence: the browser **must** send exactly that
Content-Type (`audio/mpeg`) or R2 returns 403 `SignatureDoesNotMatch`.

## `headObject(key)`

`aws.fetch(url, { method: "HEAD" })` (a signed request, not a presigned URL). Returns
`{ size }` from `content-length`, `null` on 404, and **throws** on any other non-OK status.
Used by `publishRelease` to verify uploads exist before referencing them. aws4fetch retries
5xx/429 with backoff, so an R2 outage is slow before it fails.

## Adding a signer

Add a TTL constant with a comment saying why that duration, reuse `signObjectUrl` for GETs,
and add a `sign.test.ts` case asserting the path, `X-Amz-Expires`, and any extra params
(tests set fake `R2_*` env in `beforeAll` and inspect the URL — no network).
