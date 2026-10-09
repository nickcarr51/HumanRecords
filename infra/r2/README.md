# R2 CORS rules

The applied CORS policy for each bucket, kept here as the record. Paste a file's
contents into Cloudflare → R2 → <bucket> → Settings → CORS Policy, then commit.

Only browser **uploads** (presigned PUT from `/admin/upload`) need CORS. Streaming
(`<audio>`), downloads (navigation), and artwork (`<img>`) don't. Each bucket allows
uploads only from its own environment's site.

| File | Bucket | Status |
|---|---|---|
| `cors.local.json` | `humanrecords-media-local` | applied 2026-10-05 |
| `cors.dev.json` | `humanrecords-media-dev` | applied 2026-10-06 (develop site only) |
| `cors.prod.json` | `humanrecords-media-prod` | applied 2026-10-09 (services.humanrecords.co + vercel.app) |
