# R2 CORS rules

The desired CORS policy for each bucket. Paste a file's contents into
Cloudflare → R2 → <bucket> → Settings → CORS Policy.

Each bucket allows `GET`, `HEAD`, and presigned `PUT` uploads from its own
environment's site. `GET` and `HEAD` support cross-origin image fetches and
metadata requests; ordinary artwork display with `<img>` does not require CORS.

Store a full, accessible HTTPS image URL in `albums.album_art_url`. CORS does not
make private R2 objects public: use a public artwork URL or a valid presigned GET
URL (which expires). External image hosts control their own CORS policies.
The app uses native images, so no Next.js `remotePatterns` configuration is needed.

The files now include `GET` and `HEAD`; these additions still need to be applied
in Cloudflare. The dates below record the previous upload-only policies.

| File | Bucket | Status |
|---|---|---|
| `cors.local.json` | `humanrecords-media-local` | applied 2026-10-05 |
| `cors.dev.json` | `humanrecords-media-dev` | applied 2026-10-06 (develop site only) |
| `cors.prod.json` | `humanrecords-media-prod` | applied 2026-10-09 (services.humanrecords.co + vercel.app) |
